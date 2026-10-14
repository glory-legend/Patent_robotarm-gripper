import { describe, expect, test } from "vitest";
import { Vector3 } from "three";
import { PRESETS } from "../src/timeline";
import { REVISIONS } from "../src/revision-config";
import {
  boltMassProperties,
  gravityAngle,
  nearestDriveAngle,
  revisionPose,
  revisionBoltMatrix,
} from "../src/revision-motion";

test("short bolts require the pivot nearer the head than their centre of mass", () => {
  const m6 = boltMassProperties(PRESETS[0]);
  expect(m6.centre).toBeCloseTo(5.45, 1);
  expect(m6.centre).toBeLessThan(14);
  for (const spec of PRESETS) {
    expect(boltMassProperties(spec).centre).toBeGreaterThan(2.5);
    expect(gravityAngle(0, spec)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(gravityAngle(4, spec))).toBeLessThan(0.04);
  }
});

test("recess alignment chooses equivalent angles without turning the clamped bolt", () => {
  expect(nearestDriveAngle((170 * Math.PI) / 180, 0, "slotted")).toBeCloseTo(
    (-10 * Math.PI) / 180,
  );
  expect(nearestDriveAngle((80 * Math.PI) / 180, 0, "phillips")).toBeCloseTo(
    (-10 * Math.PI) / 180,
  );
  const a = revisionPose(27, PRESETS[1], "integrated", "phillips");
  const b = revisionPose(29, PRESETS[1], "integrated", "phillips");
  expect(a.spin).toBe(0);
  expect(b.spin).toBe(0);
  expect(b.bitAngle).not.toBe(a.bitAngle);
  expect(b.brake).toBe(true);
});

describe.each(REVISIONS)("$label ownership and geometry", ({ id }) => {
  test("supports the bolt throughout handoff and releases lips before final seating", () => {
    for (let t = 5; t < 58; t += 0.1) {
      const s = revisionPose(t, PRESETS[1], id, "hex");
      expect(s.release > 0 && s.clamp < 1, `unsupported handoff at ${t}`).toBe(
        false,
      );
      expect(s.spin !== 0 && t < 36).toBe(false);
    }
    expect(revisionPose(60, PRESETS[1], id, "hex").retainOpen).toBe(1);
    const reset = revisionPose(70, PRESETS[1], id, "hex");
    expect(reset.carriageZ).toBe(
      revisionPose(0, PRESETS[1], id, "hex").carriageZ,
    );
    expect(reset.shoeAngle).toBeCloseTo(-Math.PI / 2);
    expect(reset.lock).toBe(true);
  });
});

test("gravity rotation preserves the physical pivot instead of teleporting the bolt", () => {
  for (const spec of PRESETS) {
    for (const time of [8, 8.25, 9, 11, 13, 14]) {
      const state = revisionPose(time, spec, "gravity", "hex");
      const pivot = new Vector3(0, 0, 2.5).applyMatrix4(
        revisionBoltMatrix(state),
      );
      expect(pivot.x).toBeCloseTo(0);
      expect(pivot.y).toBeCloseTo(0);
      expect(pivot.z).toBeCloseTo(26.5);
    }
  }
});

test("empty shoes unlock before the reset servo rotates them and relock at home", () => {
  expect(revisionPose(23.5, PRESETS[1], "integrated").lock).toBe(true);
  expect(revisionPose(24.5, PRESETS[1], "integrated").lock).toBe(false);
  expect(revisionPose(25, PRESETS[1], "integrated").lock).toBe(true);
});

test.each(PRESETS)(
  "$id advances two pitches initially and reaches the head at final seating",
  (spec) => {
    const initial = revisionPose(39, spec, "integrated");
    expect(initial.spin / (2 * Math.PI)).toBeCloseTo(2);
    expect(initial.inserted * spec.length).toBeCloseTo(2 * spec.pitch);
    const seated = revisionPose(60, spec, "integrated");
    expect(seated.inserted).toBeCloseTo(1);
    expect(seated.spin / (2 * Math.PI)).toBeCloseTo(spec.length / spec.pitch);
  },
);

test("handover relaxes, lowers, then opens the shoes while the head stays clamped", () => {
  for (const spec of PRESETS) {
    const closed = revisionPose(22, spec, "integrated");
    const relaxed = revisionPose(22.1, spec, "integrated");
    const lowered = revisionPose(22.3, spec, "integrated");
    expect(relaxed.gap - closed.gap).toBeCloseTo(0.15);
    expect(relaxed.carriageZ).toBe(0);
    expect(lowered.carriageZ).toBe(2);
    expect(lowered.gap).toBeCloseTo(relaxed.gap);
    expect(lowered.clamp).toBe(1);
    expect(revisionBoltMatrix(lowered).elements).toEqual(
      revisionBoltMatrix(closed).elements,
    );
    expect(revisionPose(23, spec, "integrated").carriageZ).toBe(2);
  }
});
