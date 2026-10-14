import { expect, test } from "vitest";
import { MeshBVH } from "three-mesh-bvh";
import {
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from "three";
import { PRESETS, type BoltSpec } from "../src/timeline";
import { revisionPose } from "../src/revision-motion";
import { makeRevisionHeadDrive } from "../src/revision-head-drive";

function fixture(
  head: "hex" | "phillips" | "slotted" = "phillips",
  spec: BoltSpec = PRESETS[1],
) {
  const frame = new Group(),
    spindle = new Group();
  frame.add(spindle);
  const material = new MeshStandardMaterial();
  const drive = makeRevisionHeadDrive({
    frame,
    spindle,
    spec,
    head,
    improved: true,
    mat: {
      alu: material,
      dark: material,
      steel: material,
      teal: material,
      orange: material,
      green: material,
      black: material,
    },
  });
  return { frame, spindle, ...drive };
}

test("the holder journal remains inside both bearings throughout withdrawal", () => {
  const g = fixture();
  for (const time of [22, 57, 58, 58.5, 59, 60, 65]) {
    g.update(revisionPose(time, PRESETS[1], "integrated", "phillips"));
    g.frame.updateMatrixWorld(true);
    const journal = new Box3().setFromObject(
      g.frame.getObjectByName("holder-journal")!,
    );
    for (const name of ["holder-rear-bearing", "holder-front-bearing"]) {
      const bearing = new Box3().setFromObject(g.frame.getObjectByName(name)!);
      expect(journal.min.z).toBeLessThanOrEqual(bearing.min.z);
      expect(journal.max.z).toBeGreaterThanOrEqual(bearing.max.z);
    }
  }
});

test("tool travel keeps a keyed torque connection and actuator reaction support", () => {
  for (const head of ["hex", "phillips"] as const) {
    const g = fixture(head);
    let previousBody: Vector3 | undefined;
    for (const time of [26, 29, 30, 31, 64, 65]) {
      g.update(revisionPose(time, PRESETS[1], "integrated", head));
      g.frame.updateMatrixWorld(true);
      const a = new Box3().setFromObject(
        g.frame.getObjectByName("hollow-splined-shaft")!,
      );
      const b = new Box3().setFromObject(
        g.frame.getObjectByName("tool-spline-quill")!,
      );
      expect(
        Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z),
      ).toBeGreaterThan(60);
      const body = g.frame.getObjectByName("tool-feed-actuator")!;
      const position = body.getWorldPosition(new Vector3());
      if (previousBody)
        expect(position.distanceTo(previousBody)).toBeLessThan(1e-9);
      previousBody = position;
      expect(body.parent).toBe(g.carrier);
      expect(g.frame.getObjectByName("tool-feed-thrust-bearing")).toBeDefined();
    }
  }
});

test("radial jaws stay captured in their guideways over the full opening stroke", () => {
  const g = fixture();
  for (const time of [20, 22, 56, 57, 58, 59]) {
    g.update(revisionPose(time, PRESETS[1], "integrated", "phillips"));
    for (const jaw of g.retainers) {
      const slider = jaw.getObjectByName("holder-jaw-slider")!;
      const guide = jaw.parent!.getObjectByName("holder-radial-guide")!;
      g.frame.updateMatrixWorld(true);
      const local = guide.worldToLocal(slider.getWorldPosition(new Vector3()));
      expect(local.x).toBeGreaterThanOrEqual(-9);
      expect(local.x).toBeLessThanOrEqual(9);
    }
  }
  expect(g.brake.parent).toBe(g.holderCarrier);
});

test("actuator rods pass through real barrel and mounting bores throughout the stroke", () => {
  const g = fixture();
  for (const time of [0, 21, 22, 29, 30, 31, 57, 58, 59, 64, 65]) {
    g.update(revisionPose(time, PRESETS[1], "integrated", "phillips"));
    g.frame.updateMatrixWorld(true);
    for (const [rodName, ...bores] of [
      ["holder-withdraw-rod", "holder-withdraw-actuator"],
      ["holder-jaw-actuator-rod", "holder-jaw-actuator"],
      [
        "tool-feed-piston-rod",
        "tool-feed-actuator",
        "tool-feed-actuator-mount",
      ],
    ]) {
      const centre = g.frame
        .getObjectByName(rodName)!
        .getWorldPosition(new Vector3());
      const ray = new Raycaster(
        new Vector3(centre.x, centre.y, -200),
        new Vector3(0, 0, 1),
        0,
        200,
      );
      for (const name of bores)
        expect(
          ray.intersectObject(g.frame.getObjectByName(name)!, false),
          `${name} t=${time}`,
        ).toEqual([]);
    }
  }
});

test("inclined cam walls keep every jaw roller captured through opening and withdrawal", () => {
  const g = fixture();
  for (const time of [0, 20, 21, 22, 56, 57, 58, 59, 64, 65]) {
    g.update(revisionPose(time, PRESETS[1], "integrated", "phillips"));
    g.frame.updateMatrixWorld(true);
    g.retainers.forEach((jaw, index) => {
      const roller = jaw.getObjectByName("holder-cam-follower")!;
      const cam = g.frame.getObjectByName(`holder-opening-cam-${index}`)!;
      const tracks = cam.children.filter(
        (o) => o.name === "holder-opening-cam-track",
      ) as Mesh[];
      tracks.forEach((track, i) => {
        const point = roller.localToWorld(
          new Vector3(0, i < 2 ? -4.2 : 4.2, 0),
        );
        track.worldToLocal(point);
        const radiusGap = Math.hypot(point.x, point.z);
        expect(radiusGap).toBeGreaterThanOrEqual(0.95 - 1e-6);
        expect(radiusGap).toBeLessThan(0.96);
        track.geometry.computeBoundingBox();
        expect(point.y).toBeGreaterThan(
          track.geometry.boundingBox!.min.y + 0.6,
        );
        expect(point.y).toBeLessThan(track.geometry.boundingBox!.max.y - 0.6);
      });
    });
  }
});

test("every opening cam has material connecting its arms to the draw tube for all bolt sizes", () => {
  for (const spec of PRESETS) {
    const g = fixture("hex", spec);
    g.update(revisionPose(22, spec, "integrated", "hex"));
    g.frame.updateMatrixWorld(true);
    const tube = g.frame.getObjectByName("holder-draw-tube") as Mesh;
    const bvh = new MeshBVH(tube.geometry);
    for (let sector = 0; sector < 3; sector++) {
      const cam = g.frame.getObjectByName(`holder-opening-cam-${sector}`)!;
      const arms = cam.children.filter(
        (o) => o.name === "holder-cam-radial-arm",
      ) as Mesh[];
      for (const arm of arms) {
        const relative = tube.matrixWorld
          .clone()
          .invert()
          .multiply(arm.matrixWorld);
        expect(
          bvh.intersectsGeometry(arm.geometry, relative),
          `${spec.id} cam ${sector}`,
        ).toBe(true);
      }
    }
  }
});

test("all retaining lips have a physical surface connection to their head-contact pads", () => {
  for (const spec of PRESETS)
    for (const head of ["hex", "phillips", "slotted"] as const) {
      const g = fixture(head, spec);
      g.update(revisionPose(25, spec, "integrated", head));
      g.frame.updateMatrixWorld(true);
      for (const jaw of g.retainers) {
        const pad = jaw.getObjectByName("head-contact") as Mesh;
        const lip = jaw.getObjectByName("under-head-retainer") as Mesh;
        const relative = pad.matrixWorld
          .clone()
          .invert()
          .multiply(lip.matrixWorld);
        const closest = new MeshBVH(pad.geometry).closestPointToGeometry(
          lip.geometry,
          relative,
        );
        expect(closest, `${spec.id}/${head}/${jaw.name}`).not.toBeNull();
        expect(
          closest!.distance,
          `${spec.id}/${head}/${jaw.name}`,
        ).toBeLessThan(1e-5);
      }
    }
});
