import * as T from "three";
import { HEAD_ANGLE, REVISION_BODY } from "./revision-motion";
import type { HeadType } from "./revision-config";
import { PRESETS, type BoltSpec } from "./timeline";

type Dimensions = {
  diameter: number;
  length: number;
  headWidth: number;
  headHeight: number;
  pitch: number;
};
export const PILE = {
  bottomZ: 0.166,
  tableZ: 0.17,
  rimZ: 0.121,
  width: 0.26,
  depth: 0.24,
};
export type PileContact = {
  targetPart: "head" | "shank";
  support: T.Mesh;
  point: T.Vector3;
};
export type PileBolt = {
  mesh: T.Group;
  spec: Dimensions;
  contacts: PileContact[];
  floorContacts: T.Vector3[];
};
const grasp = REVISION_BODY.grasp / 1000;
const headSupport: Dimensions = { ...PRESETS[1], length: 0.07 };
const largeSupport: Dimensions = {
  diameter: 0.012,
  length: 0.06,
  headWidth: 0.019,
  headHeight: 0.0075,
  pitch: 0.00175,
};

function profile(spec: Dimensions, head: HeadType, part: "head" | "shank") {
  const count = part === "head" && head === "hex" ? 6 : 32;
  const radius =
    part === "shank"
      ? spec.diameter / 2
      : head === "hex"
        ? spec.headWidth / Math.sqrt(3)
        : spec.headWidth / 2;
  return Array.from({ length: count }, (_, i) => {
    const a =
      (count === 6 ? Math.PI / 6 : 0) + (i * Math.PI * 2) / count + HEAD_ANGLE;
    return new T.Vector3(radius * Math.cos(a), 0, -radius * Math.sin(a));
  });
}
function floorPose(spec: Dimensions, x: number, y: number) {
  const angle = Math.atan(
    (spec.headWidth / 2 - spec.diameter / 2) / spec.length,
  );
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const matrix = new T.Matrix4().makeBasis(
    new T.Vector3(s, 0, -c),
    new T.Vector3(0, 1, 0),
    new T.Vector3(c, 0, s),
  );
  matrix.setPosition(x, y, PILE.bottomZ - (spec.headWidth / 2) * c);
  return { matrix, angle };
}
function supportVertex(
  spec: Dimensions,
  head: HeadType,
  part: "head" | "shank",
  angle: number,
) {
  return profile(spec, head, part).reduce((a, b) =>
    b.z - b.x * Math.tan(angle) > a.z - a.x * Math.tan(angle) ? b : a,
  );
}
function stackLayout(spec: Dimensions, head: HeadType, longSupports: boolean) {
  const rear = { ...headSupport, length: longSupports ? 0.07 : 0.035 };
  const front =
    spec.diameter >= 0.01
      ? { ...largeSupport, length: longSupports ? 0.06 : 0.04 }
      : {
          ...PRESETS[2],
          length: longSupports ? (spec.diameter <= 0.006 ? 0.09 : 0.06) : 0.035,
        };
  const rearAngle = floorPose(rear, 0, 0).angle;
  const rearPose = floorPose(
    rear,
    -rear.length * 0.75 * Math.cos(rearAngle),
    -grasp - spec.headHeight / 2,
  );
  const headVertex = supportVertex(spec, head, "head", rearAngle);
  const rearPosition = new T.Vector3().setFromMatrixPosition(rearPose.matrix);
  const axisZ =
    rearPosition.z -
    rearPosition.x * Math.tan(rearAngle) -
    rear.diameter / 2 / Math.cos(rearAngle) -
    (headVertex.z - headVertex.x * Math.tan(rearAngle));
  const frontAngle = floorPose(front, 0, 0).angle;
  const shankVertex = supportVertex(spec, head, "shank", frontAngle);
  const frontOriginZ =
    PILE.bottomZ - (front.headWidth / 2) * Math.cos(frontAngle);
  const frontX =
    (frontOriginZ -
      front.diameter / 2 / Math.cos(frontAngle) -
      (shankVertex.z - shankVertex.x * Math.tan(frontAngle)) -
      axisZ) /
    Math.tan(frontAngle);
  const frontY = spec.length - grasp - Math.min(0.006, spec.length * 0.23);
  const frontPose = floorPose(front, frontX, frontY);
  return {
    axisZ,
    rear,
    front,
    rearPose,
    frontPose,
    headVertex,
    shankVertex,
    frontY,
  };
}
export function revisionPilePickupAxisZ(
  spec: BoltSpec,
  head: HeadType = "hex",
) {
  return stackLayout(spec, head, true).axisZ;
}

/** Deterministic, supported static arrangement; all coordinates are metres, +Z down. */
export function makeRevisionPile(spec: BoltSpec, head: HeadType) {
  const root = new T.Group();
  root.name = "mixed-bolt-pile";
  const steel = new T.MeshStandardMaterial({
    color: "#8698a2",
    metalness: 0.68,
    roughness: 0.48,
  });
  const binMaterial = new T.MeshStandardMaterial({
    color: "#526a77",
    metalness: 0.3,
    roughness: 0.65,
  });
  const bolts: PileBolt[] = [];
  function box(name: string, size: number[], at: number[]) {
    const mesh = new T.Mesh(
      new T.BoxGeometry(size[0], size[1], size[2]),
      binMaterial,
    );
    mesh.name = name;
    mesh.position.fromArray(at);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  const floor = box(
    "bin-floor",
    [PILE.width + 0.008, PILE.depth + 0.008, PILE.tableZ - PILE.bottomZ],
    [0, 0, (PILE.tableZ + PILE.bottomZ) / 2],
  );
  for (const side of [-1, 1]) {
    box(
      "bin-wall-x",
      [0.004, PILE.depth + 0.008, PILE.bottomZ - PILE.rimZ],
      [side * (PILE.width / 2 + 0.002), 0, (PILE.bottomZ + PILE.rimZ) / 2],
    );
    box(
      "bin-wall-y",
      [PILE.width, 0.004, PILE.bottomZ - PILE.rimZ],
      [0, side * (PILE.depth / 2 + 0.002), (PILE.bottomZ + PILE.rimZ) / 2],
    );
  }
  function bolt(dim: Dimensions, matrix: T.Matrix4, name?: string) {
    const group = new T.Group();
    group.name = name ?? `pile-bolt-${bolts.length}`;
    group.matrixAutoUpdate = false;
    group.matrix.copy(matrix);
    const shape = new T.Shape(),
      radius = dim.headWidth / Math.sqrt(3);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      if (i) shape.lineTo(radius * Math.cos(a), radius * Math.sin(a));
      else shape.moveTo(radius * Math.cos(a), radius * Math.sin(a));
    }
    shape.closePath();
    const headMesh = new T.Mesh(
      new T.ExtrudeGeometry(shape, {
        depth: dim.headHeight,
        bevelEnabled: false,
      }),
      steel,
    );
    headMesh.position.z = -dim.headHeight;
    headMesh.name = "pile-head";
    const shank = new T.Mesh(
      new T.CylinderGeometry(
        dim.diameter / 2,
        dim.diameter / 2,
        dim.length,
        32,
      ),
      steel,
    );
    shank.rotation.x = Math.PI / 2;
    shank.position.z = dim.length / 2;
    shank.name = "pile-shank";
    group.add(headMesh, shank);
    group.traverse((object) => {
      if (object instanceof T.Mesh)
        object.castShadow = object.receiveShadow = true;
    });
    root.add(group);
    const record: PileBolt = {
      mesh: group,
      spec: dim,
      contacts: [],
      floorContacts: [],
    };
    bolts.push(record);
    return record;
  }
  function grounded(
    dim: Dimensions,
    pose: ReturnType<typeof floorPose>,
    transform = new T.Matrix4(),
  ) {
    const record = bolt(dim, transform.clone().multiply(pose.matrix));
    const r = dim.diameter / 2,
      h = dim.headWidth / 2;
    record.floorContacts = [
      new T.Vector3(-h, -dim.headWidth / (2 * Math.sqrt(3)), 0),
      new T.Vector3(-h, dim.headWidth / (2 * Math.sqrt(3)), 0),
      new T.Vector3(-r, 0, dim.length),
    ].map((point) => point.applyMatrix4(record.mesh.matrix));
    return record;
  }
  function stack(
    dim: Dimensions,
    targetHead: HeadType,
    transform: T.Matrix4,
    long: boolean,
    includeTarget: boolean,
  ) {
    const layout = stackLayout(dim, targetHead, long);
    const rear = grounded(layout.rear, layout.rearPose, transform),
      front = grounded(layout.front, layout.frontPose, transform);
    const target = new T.Matrix4()
      .makeRotationX(-Math.PI / 2)
      .multiply(new T.Matrix4().makeRotationZ(HEAD_ANGLE))
      .setPosition(0, -grasp, layout.axisZ);
    const contacts: PileContact[] = [
      {
        targetPart: "head",
        support: rear.mesh.getObjectByName("pile-shank") as T.Mesh,
        point: layout.headVertex
          .clone()
          .add(new T.Vector3(0, -grasp - dim.headHeight / 2, layout.axisZ))
          .applyMatrix4(transform),
      },
      {
        targetPart: "shank",
        support: front.mesh.getObjectByName("pile-shank") as T.Mesh,
        point: layout.shankVertex
          .clone()
          .add(new T.Vector3(0, layout.frontY, layout.axisZ))
          .applyMatrix4(transform),
      },
    ];
    if (includeTarget) {
      const upper = bolt(dim, transform.clone().multiply(target));
      upper.contacts = contacts;
    }
    return {
      contacts,
      targetMatrix: transform
        .clone()
        .multiply(target)
        .multiply(new T.Matrix4().makeScale(0.001, 0.001, 0.001)),
      axisZ: layout.axisZ,
    };
  }
  const selected = stack(spec, head, new T.Matrix4(), true, false);
  // shortcut: fixed supported poses illustrate a mixed bin; predicting settling requires a calibrated contact solver.
  for (const [x, y, yaw, index] of [
    [-0.072, -0.064, 0.35, 0],
    [0.08, -0.064, -0.5, 1],
    [-0.065, 0.074, 0.7, 0],
    [0.08, 0.068, -0.3, 1],
  ]) {
    stack(
      PRESETS[index],
      "hex",
      new T.Matrix4().makeRotationZ(yaw).setPosition(x, y, 0),
      false,
      true,
    );
  }
  root.updateMatrixWorld(true);
  const occupied = bolts.map((record) =>
    new T.Box3().setFromObject(record.mesh),
  );
  // Deterministic rejection keeps loose floor bolts out of every already occupied volume.
  let state = 8197;
  const sample = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let attempt = 0; bolts.length < 26 && attempt < 1200; attempt++) {
    const dim = PRESETS[attempt % 3],
      yaw = sample() * Math.PI * 2;
    const transform = new T.Matrix4()
      .makeRotationZ(yaw)
      .setPosition((sample() - 0.5) * 0.22, (sample() - 0.5) * 0.2, 0);
    const record = grounded(dim, floorPose(dim, -dim.length / 2, 0), transform);
    root.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(record.mesh);
    if (
      bounds.min.x < -PILE.width / 2 + 0.001 ||
      bounds.max.x > PILE.width / 2 - 0.001 ||
      bounds.min.y < -PILE.depth / 2 + 0.001 ||
      bounds.max.y > PILE.depth / 2 - 0.001 ||
      occupied.some((other) =>
        other.intersectsBox(bounds.clone().expandByScalar(0.0007)),
      )
    ) {
      root.remove(record.mesh);
      record.mesh.traverse((object) => {
        if (object instanceof T.Mesh) object.geometry.dispose();
      });
      bolts.pop();
    } else occupied.push(bounds);
  }
  root.updateMatrixWorld(true);
  return {
    root,
    bolts,
    floor,
    contacts: selected.contacts,
    targetMatrix: selected.targetMatrix,
    pickupAxisZ: selected.axisZ,
    rimZ: PILE.rimZ,
  };
}
