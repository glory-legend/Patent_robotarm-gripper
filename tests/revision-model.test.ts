import { expect, test } from "vitest";
import { Box3, Matrix4, Mesh, Raycaster, Vector3 } from "three";
import { PRESETS } from "../src/timeline";
import {
  makeRevisionGripper,
  makeRevisionWorkpiece,
} from "../src/revision-model";

test("gravity design removes the thumb and keeps both rotating retention shoes", () => {
  const g = makeRevisionGripper("integrated", PRESETS[1], "hex");
  expect(g.root.getObjectByName("thumb-link")).toBeUndefined();
  expect(g.root.getObjectByName("rotating-shoe-left")).toBeDefined();
  expect(g.root.getObjectByName("shoe-reset-servo")).toBeDefined();
  expect(g.root.getObjectByName("pivot-lock-left")).toBeDefined();
});
test("explosion moves assemblies and restores their exact animated positions", () => {
  const g = makeRevisionGripper("integrated", PRESETS[1], "phillips");
  g.update(30, "assembled", 0.5);
  const shaft = g.root.getObjectByName("bit-shaft")!;
  const before = shaft.getWorldPosition(new Vector3());
  g.update(30, "exploded", 1);
  expect(
    shaft.getWorldPosition(new Vector3()).distanceTo(before),
  ).toBeGreaterThan(0.01);
  g.update(30, "assembled", 0.5);
  expect(shaft.getWorldPosition(new Vector3()).distanceTo(before)).toBeLessThan(
    1e-10,
  );
});
test("section clips internal solids and plane follows the world transform", () => {
  const g = makeRevisionGripper("integrated", PRESETS[1], "hex");
  g.root.applyMatrix4(new Matrix4().makeRotationX(Math.PI / 2));
  g.update(20, "section", 0.5);
  const shell = g.root.getObjectByName("housing") as Mesh;
  const motor = g.root.getObjectByName("spindle-motor") as Mesh;
  expect((shell.material as any).clippingPlanes).toHaveLength(1);
  expect((motor.material as any).clippingPlanes).toHaveLength(1);
  g.update(20, "assembled", 0.5);
  expect((shell.material as any).clippingPlanes).toHaveLength(0);
});
test("recess modes have a real opening and matching driver, with independent rotation", () => {
  const g = makeRevisionGripper("drive", PRESETS[1], "slotted");
  g.update(26, "assembled", 0.5);
  expect(g.root.getObjectByName("head-recess")).toBeDefined();
  expect(g.root.getObjectByName("slotted-bit")).toBeDefined();
  expect(g.root.getObjectByName("camera")).toBeDefined();
  const holder = g.root.getObjectByName("head-holder")!;
  const before = holder.rotation.z;
  g.update(28.5, "assembled", 0.5);
  expect(holder.rotation.z).toBe(before);
});

test("camera centre ray clears the actual holder and nose while the bit is retracted", () => {
  for (const spec of PRESETS) {
    const g = makeRevisionGripper("integrated", spec, "phillips");
    g.update(26);
    const origin = g.root
      .getObjectByName("camera-lens")!
      .getWorldPosition(new Vector3());
    const target = g.root.localToWorld(
      new Vector3(0, 0, -spec.headHeight * 1000),
    );
    const ray = new Raycaster(
      origin,
      target.clone().sub(origin).normalize(),
      0.0001,
      origin.distanceTo(target) - 0.0001,
    );
    const blockers: Mesh[] = [];
    g.root.traverse((o) => {
      if (
        o instanceof Mesh &&
        !/camera|held-bolt|head-recess|bolt-shank/.test(o.name)
      )
        blockers.push(o);
    });
    expect(
      ray.intersectObjects(blockers, false).map((i) => i.object.name),
      spec.id,
    ).toEqual([]);
  }
});

test("socket torque band and head-retaining contact band have axial clearance", () => {
  for (const spec of PRESETS) {
    const g = makeRevisionGripper("head", spec, "hex");
    g.update(31);
    const socket = new Box3().setFromObject(
      g.root.getObjectByName("hex-form-socket")!,
    );
    const jaw = new Box3().setFromObject(
      g.root.getObjectByName("head-contact")!,
    );
    expect(jaw.min.z - socket.max.z).toBeGreaterThan(0.0003);
  }
});

test("hex socket is aligned before any axial insertion", () => {
  for (const spec of PRESETS) {
    const g = makeRevisionGripper("head", spec, "hex");
    for (const t of [29, 29.5, 30, 31]) {
      g.update(t);
      const driver = g.root.getObjectByName("driver-rotor")!;
      const holder = g.root.getObjectByName("head-holder")!;
      expect(Math.sin(3 * (driver.rotation.z - holder.rotation.z))).toBeCloseTo(
        0,
      );
    }
  }
});

test("rotating shoe pads touch each bolt on tangent faces", () => {
  for (const spec of PRESETS) {
    const g = makeRevisionGripper("gravity", spec, "hex");
    g.update(14);
    const boltInverse = g.root
      .getObjectByName("held-bolt")!
      .matrixWorld.clone()
      .invert();
    const pads: Mesh[] = [];
    g.root.traverse((o) => {
      if (o instanceof Mesh && o.name === "U-contact-face") pads.push(o);
    });
    expect(pads).toHaveLength(4);
    for (const pad of pads) {
      pad.geometry.computeBoundingBox();
      const contact = new Vector3(pad.geometry.boundingBox!.min.x, 0, 0)
        .applyMatrix4(pad.matrixWorld)
        .applyMatrix4(boltInverse);
      expect(Math.hypot(contact.x, contact.y)).toBeCloseTo(
        spec.diameter * 500,
        5,
      );
    }
  }
});

test("each workpiece bore fits its bolt and supports even the round head", () => {
  for (const spec of PRESETS) {
    const plate = makeRevisionWorkpiece(spec).getObjectByName(
      "workpiece-plate",
    ) as Mesh;
    const shape = (plate.geometry as any).parameters.shapes;
    const radius = shape.holes[0].getPoints()[0].length();
    expect(radius).toBeGreaterThanOrEqual(spec.diameter / 2);
    expect(radius).toBeLessThan(spec.diameter / 2 + 0.0001);
    expect(radius).toBeLessThan(spec.headWidth / 2);
  }
});

test("section travel reaches both the feed drive and the external camera", () => {
  const g = makeRevisionGripper("integrated", PRESETS[1], "hex");
  for (const amount of [0, 1]) {
    g.update(25, "section", amount);
    const plane = ((g.root.getObjectByName("housing") as Mesh).material as any)
      .clippingPlanes[0];
    for (const name of ["feed-motor", "camera-lens"]) {
      const distance = plane.distanceToPoint(
        g.root.getObjectByName(name)!.getWorldPosition(new Vector3()),
      );
      expect(Math.sign(distance)).toBe(amount === 0 ? -1 : 1);
    }
  }
});
