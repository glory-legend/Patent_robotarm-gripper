import * as T from "three";
import { ROBOT_DATA, originMatrix } from "./kinematics";
import { ramp, type BoltSpec } from "./timeline";
import { type HeadType, type RevisionId } from "./revision-config";
import {
  REVISION_BODY,
  revisionBoltMatrix,
  revisionPose,
} from "./revision-motion";
import { makeRevisionWorkpiece } from "./revision-model";
import { makeRevisionPile, revisionPilePickupAxisZ } from "./revision-pile";

// Cell coordinates are metres, with +Z downward, matching the tool's working axis.
export const CELL = {
  pickupX: -0.1,
  fastenX: 0.1,
  plateZ: 0.1,
  tableZ: 0.17,
};
export const ROBOT_BASE = new T.Matrix4()
  .makeRotationX(Math.PI)
  .setPosition(-0.45, 0, CELL.tableZ);

export function revisionScenePose(
  time: number,
  spec: BoltSpec,
  id: RevisionId,
  head: HeadType = "hex",
) {
  const p = revisionPose(time, spec, id, head),
    t = p.time;
  const pickupZ =
    revisionPilePickupAxisZ(spec, head) -
    (REVISION_BODY.feed + REVISION_BODY.grasp) / 1000;
  const liftZ = pickupZ - 0.09;
  let z = pickupZ - 0.03 * (1 - ramp(t, 0, 3)) - 0.09 * ramp(t, 5, 8);
  let x = CELL.pickupX + (CELL.fastenX - CELL.pickupX) * ramp(t, 31, 34);
  if (t >= 34)
    z = T.MathUtils.lerp(liftZ, CELL.plateZ - spec.length, ramp(t, 34, 36));
  if (t >= 36)
    z =
      CELL.plateZ -
      spec.length +
      spec.length * p.inserted +
      p.compression / 1000;
  if (t >= 63) z = CELL.plateZ + p.compression / 1000 - 0.08 * ramp(t, 65, 68);
  if (t >= 68) {
    x = T.MathUtils.lerp(CELL.fastenX, CELL.pickupX, ramp(t, 68, 70));
    z = T.MathUtils.lerp(CELL.plateZ - 0.08, pickupZ - 0.03, ramp(t, 68, 70));
  }
  return {
    tool: new T.Vector3(x, 0, z),
    owner: t < 5 ? "pickup" : t < 63 ? "tool" : "workpiece",
  } as const;
}

export function revisionBoltWorld(
  time: number,
  spec: BoltSpec,
  id: RevisionId,
  head: HeadType = "hex",
) {
  const t = Math.max(5, Math.min(63, time));
  const position = revisionScenePose(t, spec, id, head).tool;
  return new T.Matrix4()
    .makeTranslation(position.x, position.y, position.z)
    .multiply(new T.Matrix4().makeScale(0.001, 0.001, 0.001))
    .multiply(revisionBoltMatrix(revisionPose(t, spec, id, head)));
}

export function robotFlangeTarget(tool: T.Vector3) {
  return ROBOT_BASE.clone()
    .invert()
    .multiply(
      new T.Matrix4().makeTranslation(
        tool.x,
        tool.y,
        tool.z - REVISION_BODY.length / 1000,
      ),
    );
}

const origins = ROBOT_DATA.map(originMatrix);
const initialJoints = [0, -0.7, 0, -2.2, 0, 1.5, 0.785];
/** Damped least squares on the real seven-joint chain; joint limits are enforced at every step. */
function solveJointSeed(target: T.Matrix4, seed: number[]) {
  const joints = [...seed],
    desired = new T.Quaternion().setFromRotationMatrix(target);
  const targetPosition = new T.Vector3().setFromMatrixPosition(target);
  let positionError = Infinity,
    angleError = Infinity;
  for (let iteration = 0; iteration <= 120; iteration++) {
    const matrix = new T.Matrix4(),
      positions: T.Vector3[] = [],
      axes: T.Vector3[] = [];
    for (let i = 0; i < 7; i++) {
      matrix.multiply(origins[i]);
      positions.push(new T.Vector3().setFromMatrixPosition(matrix));
      axes.push(new T.Vector3(0, 0, 1).transformDirection(matrix));
      matrix.multiply(new T.Matrix4().makeRotationZ(joints[i]));
    }
    matrix.multiply(origins[7]);
    const position = new T.Vector3().setFromMatrixPosition(matrix);
    const delta = targetPosition.clone().sub(position);
    const rotation = desired
      .clone()
      .multiply(new T.Quaternion().setFromRotationMatrix(matrix).invert());
    if (rotation.w < 0)
      rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
    const sine = Math.hypot(rotation.x, rotation.y, rotation.z);
    angleError = 2 * Math.atan2(sine, rotation.w);
    positionError = delta.length();
    if ((positionError < 1e-7 && angleError < 1e-6) || iteration === 120) break;
    const angular = new T.Vector3(
      rotation.x,
      rotation.y,
      rotation.z,
    ).multiplyScalar(sine > 1e-12 ? angleError / sine : 2);
    const error = [
      ...delta.toArray(),
      ...angular.multiplyScalar(0.2).toArray(),
    ];
    const columns = axes.map((axis, i) => [
      ...axis.clone().cross(position.clone().sub(positions[i])).toArray(),
      ...axis.clone().multiplyScalar(0.2).toArray(),
    ]);
    const equations = Array.from({ length: 6 }, (_, row) => [
      ...Array.from(
        { length: 6 },
        (_, col) =>
          columns.reduce((sum, v) => sum + v[row] * v[col], 0) +
          (row === col ? 1e-6 : 0),
      ),
      error[row],
    ]);
    for (let col = 0; col < 6; col++) {
      let pivot = col;
      for (let row = col + 1; row < 6; row++)
        if (Math.abs(equations[row][col]) > Math.abs(equations[pivot][col]))
          pivot = row;
      [equations[col], equations[pivot]] = [equations[pivot], equations[col]];
      const divisor = equations[col][col];
      for (let j = col; j < 7; j++) equations[col][j] /= divisor;
      for (let row = 0; row < 6; row++)
        if (row !== col) {
          const factor = equations[row][col];
          for (let j = col; j < 7; j++)
            equations[row][j] -= factor * equations[col][j];
        }
    }
    for (let i = 0; i < 7; i++) {
      const step = columns[i].reduce(
        (sum, value, row) => sum + value * equations[row][6],
        0,
      );
      joints[i] = T.MathUtils.clamp(
        joints[i] + T.MathUtils.clamp(step, -0.18, 0.18),
        ROBOT_DATA[i].lower!,
        ROBOT_DATA[i].upper!,
      );
    }
  }
  return { joints, positionError, angleError };
}

export function solveRevisionJoints(target: T.Matrix4, seed = initialJoints) {
  const solved = solveJointSeed(target, seed);
  if (
    seed !== initialJoints &&
    (solved.positionError >= 1e-7 || solved.angleError >= 1e-6)
  ) {
    // A large timeline seek can put the previous pose outside the solver's convergence basin.
    const retry = solveJointSeed(target, initialJoints);
    if (retry.positionError < 1e-7 && retry.angleError < 1e-6) return retry;
  }
  return solved;
}

export function makeRevisionFixtures(spec: BoltSpec, head: HeadType) {
  const pile = makeRevisionPile(spec, head);
  const root = new T.Group(),
    pickup = pile.root,
    workpiece = makeRevisionWorkpiece(spec);
  root.name = "fixed-cell-fixtures";
  pickup.name = "bolt-bin";
  pickup.position.x = CELL.pickupX;
  workpiece.name = "fixed-threaded-workpiece";
  workpiece.position.set(CELL.fastenX, 0, CELL.plateZ);
  root.add(pickup, workpiece);
  const steel = new T.MeshStandardMaterial({
    color: "#9eafb7",
    metalness: 0.5,
    roughness: 0.5,
  });
  const dark = new T.MeshStandardMaterial({
    color: "#526a77",
    metalness: 0.4,
    roughness: 0.6,
  });
  function box(
    parent: T.Group,
    name: string,
    size: number[],
    position: number[],
    material = steel,
  ) {
    const object = new T.Mesh(
      new T.BoxGeometry(size[0], size[1], size[2]),
      material,
    );
    object.name = name;
    object.position.fromArray(position);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
  }
  box(
    root,
    "fixed-worktable",
    [0.85, 0.42, 0.02],
    [-0.14, 0, CELL.tableZ + 0.01],
  );
  for (const x of [-0.032, 0.032])
    for (const y of [-0.026, 0.026])
      box(
        workpiece,
        "workpiece-support",
        [0.008, 0.008, CELL.tableZ - CELL.plateZ - 0.008],
        [x, y, (CELL.tableZ - CELL.plateZ + 0.008) / 2],
        dark,
      );
  return { root, pickup, workpiece, pile };
}
