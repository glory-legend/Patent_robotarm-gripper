import { expect, test } from "vitest";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import { PRESETS } from "../src/timeline";
import { HEADS, REVISION_STAGES } from "../src/revision-config";
import { flangeAtPath, ROBOT_DATA } from "../src/kinematics";
import { revisionPose } from "../src/revision-motion";
import { makeRevisionGripper } from "../src/revision-model";
import {
  CELL,
  revisionScenePose,
  revisionBoltWorld,
  robotFlangeTarget,
  solveRevisionJoints,
  makeRevisionFixtures,
} from "../src/revision-scene";

test.each(PRESETS)(
  "$id stays on its pickup support, then remains seated while the tool retracts",
  (spec) => {
    const start = revisionBoltWorld(0, spec, "integrated", "hex");
    for (const time of [1, 3, 4.9, 5])
      expect(
        revisionBoltWorld(time, spec, "integrated", "hex").elements,
      ).toEqual(start.elements);
    const seated = revisionBoltWorld(63, spec, "integrated", "hex");
    for (const time of [64, 65, 67, 70])
      expect(
        revisionBoltWorld(time, spec, "integrated", "hex").elements,
      ).toEqual(seated.elements);
    expect(new Vector3().setFromMatrixPosition(seated).z).toBeCloseTo(
      CELL.plateZ,
    );
    expect(revisionScenePose(68, spec, "integrated").tool.z).toBeLessThan(
      revisionScenePose(63, spec, "integrated").tool.z - 0.05,
    );
  },
);

test.each(PRESETS)(
  "$id approaches a fixed hole and follows pitch without changing the fixture",
  (spec) => {
    const fixtures = makeRevisionFixtures(spec, "hex");
    expect(fixtures.workpiece.position.toArray()).toEqual([
      CELL.fastenX,
      0,
      CELL.plateZ,
    ]);
    for (const t of [36, 37, 39, 45, 55, 60, 63]) {
      const p = revisionPose(t, spec, "integrated");
      const tip = new Vector3(0, 0, spec.length * 1000).applyMatrix4(
        revisionBoltWorld(t, spec, "integrated", "hex"),
      );
      expect(tip.x).toBeCloseTo(CELL.fastenX);
      expect(tip.y).toBeCloseTo(0);
      expect(tip.z - CELL.plateZ).toBeCloseTo(p.inserted * spec.length);
    }
    const before = revisionBoltWorld(5 - 1e-6, spec, "integrated", "hex");
    const after = revisionBoltWorld(5 + 1e-6, spec, "integrated", "hex");
    expect(
      new Vector3()
        .setFromMatrixPosition(before)
        .distanceTo(new Vector3().setFromMatrixPosition(after)),
    ).toBeLessThan(1e-8);
  },
);

test("the complete FR3 reaches the tool path within joint limits and flange error bounds", () => {
  let seed: number[] | undefined;
  for (const spec of PRESETS) {
    for (const time of [
      0, 3, 5, 8, 20, 31, 32, 33, 34, 36, 39, 60, 63, 65, 68, 70,
    ]) {
      const target = robotFlangeTarget(
        revisionScenePose(time, spec, "integrated").tool,
      );
      const solved = solveRevisionJoints(target, seed);
      seed = solved.joints;
      const actual = flangeAtPath(solved.joints);
      const positionError = new Vector3()
        .setFromMatrixPosition(actual)
        .distanceTo(new Vector3().setFromMatrixPosition(target));
      const angleError = new Quaternion()
        .setFromRotationMatrix(actual)
        .angleTo(new Quaternion().setFromRotationMatrix(target));
      expect(positionError, `${spec.id} @ ${time}`).toBeLessThan(0.00001);
      expect(angleError, `${spec.id} @ ${time}`).toBeLessThan(0.0001);
      solved.joints.forEach((q, i) => {
        expect(q).toBeGreaterThanOrEqual(ROBOT_DATA[i].lower!);
        expect(q).toBeLessThanOrEqual(ROBOT_DATA[i].upper!);
      });
    }
  }
});

test.each(PRESETS)(
  "$id starts on the pile and clears the bin rim before righting",
  (spec) => {
    for (const head of HEADS) {
      const fixtures = makeRevisionFixtures(spec, head.id);
      const initial = new Matrix4()
        .makeTranslation(CELL.pickupX, 0, 0)
        .multiply(fixtures.pile.targetMatrix);
      const actual = revisionBoltWorld(0, spec, "integrated", head.id);
      initial.elements.forEach((value, index) =>
        expect(value).toBeCloseTo(actual.elements[index], 8),
      );
      const model = makeRevisionGripper("integrated", spec, head.id);
      fixtures.root.add(model.bolt);
      for (const time of [8, 9, 10, 11, 12, 13, 14]) {
        model.bolt.matrix.copy(
          revisionBoltWorld(time, spec, "integrated", head.id),
        );
        fixtures.root.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(model.bolt, true);
        expect(bounds.max.z, `${spec.id}/${head.id} @ ${time}`).toBeLessThan(
          fixtures.pile.rimZ - 0.005,
        );
      }
    }
  },
);

test("joint solutions stay continuous through the full trajectory", () => {
  let seed: number[] | undefined;
  for (const spec of PRESETS)
    for (const head of HEADS)
      for (let time = 0; time <= 70; time += 0.1) {
        const target = robotFlangeTarget(
          revisionScenePose(time, spec, "integrated", head.id).tool,
        );
        const solved = solveRevisionJoints(target, seed);
        const context = `${spec.id}/${head.id} @ ${time}`;
        expect(solved.positionError, context).toBeLessThan(0.00001);
        expect(solved.angleError, context).toBeLessThan(0.0001);
        if (seed && time > 0)
          expect(
            Math.max(...solved.joints.map((q, i) => Math.abs(q - seed![i]))),
            context,
          ).toBeLessThan(0.2);
        seed = solved.joints;
      }
});

test("stage seeks still converge after changing heads and restarting the cycle", () => {
  let seed = solveRevisionJoints(
    robotFlangeTarget(revisionScenePose(0, PRESETS[1], "integrated").tool),
  ).joints;
  for (const spec of PRESETS)
    for (const head of HEADS)
      for (const time of [...REVISION_STAGES.map((stage) => stage.start), 70]) {
        const target = robotFlangeTarget(
          revisionScenePose(time, spec, "integrated", head.id).tool,
        );
        const solved = solveRevisionJoints(target, seed);
        const actual = flangeAtPath(solved.joints);
        const context = `${spec.id}/${head.id} @ ${time}`;
        expect(
          new Vector3()
            .setFromMatrixPosition(actual)
            .distanceTo(new Vector3().setFromMatrixPosition(target)),
          context,
        ).toBeLessThan(0.00001);
        expect(
          new Quaternion()
            .setFromRotationMatrix(actual)
            .angleTo(new Quaternion().setFromRotationMatrix(target)),
          context,
        ).toBeLessThan(0.0001);
        seed = solved.joints;
      }
});

test("pickup uses a multilayer bolt bin instead of an isolated support stand", () => {
  const fixtures = makeRevisionFixtures(PRESETS[1], "hex");
  const bolts: string[] = [];
  fixtures.pickup.traverse((object) => {
    if (/^pile-bolt-\d+$/.test(object.name)) bolts.push(object.name);
  });
  expect(bolts.length).toBeGreaterThanOrEqual(20);
  expect(fixtures.pickup.getObjectByName("head-rest")).toBeUndefined();
  expect(fixtures.pickup.getObjectByName("shank-rest")).toBeUndefined();
  expect(fixtures.pickup.getObjectByName("bin-floor")).toBeDefined();
});
