import { expect, test } from "vitest";
import { writeFileSync } from "node:fs";
import * as T from "three";
import { MeshBVH } from "three-mesh-bvh";
import { makeRevisionGripper } from "../src/revision-model";
import {
  REVISIONS,
  HEADS,
  type RevisionId,
  type HeadType,
} from "../src/revision-config";
import { PRESETS, type BoltSpec } from "../src/timeline";
import {
  makeRevisionFixtures,
  revisionBoltWorld,
  revisionScenePose,
} from "../src/revision-scene";

// Standalone diagnostic: rendered mesh triangles, BVH surface intersections,
// containment, and clipped triangles give a positive-depth solid witness.
// Temporal sampling is not continuous collision detection.
type Solid = {
  mesh: T.Mesh;
  bvh: MeshBVH;
  planes: T.Plane[];
  triangles: T.Vector3[][];
  convex: boolean;
};
const cache = new WeakMap<T.BufferGeometry, Omit<Solid, "mesh">>();
const rayDirection = new T.Vector3(0.8731, 0.3427, 0.3472).normalize();
const reportPrefix = process.env.CLEARANCE_REPORT_PREFIX ?? "/tmp/revision";
const epsilon = 0.02; // mm: distinguish visible penetration from nominal contact.

function updateActualScene(
  model: ReturnType<typeof makeRevisionGripper>,
  time: number,
  spec: BoltSpec,
  id: RevisionId,
  head: HeadType,
) {
  const { tool } = revisionScenePose(time, spec, id, head);
  const boltInTool = new T.Matrix4()
    .makeScale(1000, 1000, 1000)
    .multiply(new T.Matrix4().makeTranslation(-tool.x, -tool.y, -tool.z))
    .multiply(revisionBoltWorld(time, spec, id, head));
  model.update(time, "assembled", 0.5, boltInTool);
}

function solid(mesh: T.Mesh): Solid {
  // TubeGeometry omits wire end caps; close those two cross sections for solid containment.
  if (
    mesh.geometry instanceof T.TubeGeometry &&
    !mesh.geometry.parameters.closed &&
    !mesh.geometry.userData.solidCapped
  ) {
    const original = mesh.geometry;
    const geometry = original.clone();
    const { tubularSegments, radialSegments } = original.parameters;
    const indices = Array.from(geometry.index!.array);
    for (const base of [0, tubularSegments * (radialSegments + 1)])
      for (let i = 1; i < radialSegments - 1; i++)
        indices.push(base, base + i, base + i + 1);
    geometry.setIndex(indices);
    geometry.userData.solidCapped = true;
    mesh.geometry = geometry;
  }
  let data = cache.get(mesh.geometry);
  if (!data) {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute("position");
    const index = geometry.index;
    const vertices = Array.from({ length: positions.count }, (_, i) =>
      new T.Vector3().fromBufferAttribute(positions, i),
    );
    const triangles: T.Vector3[][] = [];
    for (let i = 0; i < (index?.count ?? positions.count); i += 3)
      triangles.push(
        [0, 1, 2].map((j) => vertices[index ? index.getX(i + j) : i + j]),
      );
    const planes: T.Plane[] = [];
    let convex = true;
    for (const [a, b, c] of triangles) {
      const plane = new T.Plane().setFromCoplanarPoints(a, b, c);
      if (plane.normal.lengthSq() < 0.5) continue;
      let lo = Infinity,
        hi = -Infinity;
      for (const v of vertices) {
        const d = plane.distanceToPoint(v);
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
      if (lo < -1e-4 && hi > 1e-4) {
        convex = false;
        continue;
      }
      if (lo >= -1e-4 && hi > 1e-4) plane.negate();
      if (
        !planes.some(
          (p) =>
            p.normal.distanceToSquared(plane.normal) < 1e-8 &&
            Math.abs(p.constant - plane.constant) < 1e-4,
        )
      )
        planes.push(plane);
    }
    const bvh = new MeshBVH(geometry);
    geometry.boundsTree = bvh;
    data = { bvh, planes, triangles, convex };
    cache.set(geometry, data);
  }
  return { mesh, ...data };
}

function inside(s: Solid, point: T.Vector3) {
  if (s.convex) return s.planes.every((p) => p.distanceToPoint(point) < -1e-6);
  const hits = s.bvh.raycast(new T.Ray(point, rayDirection), T.DoubleSide);
  const distances = hits.map((h) => h.distance).sort((a, b) => a - b);
  const unique = distances.filter(
    (d, i) => i === 0 || d - distances[i - 1] > 1e-5,
  );
  return unique.length % 2 === 1;
}

function clip(points: T.Vector3[], planes: T.Plane[]) {
  for (const plane of planes) {
    const next: T.Vector3[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      const da = plane.distanceToPoint(a) + epsilon;
      const db = plane.distanceToPoint(b) + epsilon;
      if (da <= 0) next.push(a);
      if (da < 0 !== db < 0) next.push(a.clone().lerp(b, da / (da - db)));
    }
    points = next;
    if (!points.length) break;
  }
  return points;
}

function collision(a: Solid, b: Solid) {
  const matrix = b.mesh.matrixWorld
    .clone()
    .invert()
    .multiply(a.mesh.matrixWorld);
  const surface = b.bvh.intersectsGeometry(a.mesh.geometry, matrix);
  const av = a.triangles[0][0].clone().applyMatrix4(matrix);
  const inverse = matrix.clone().invert();
  const bv = b.triangles[0][0].clone().applyMatrix4(inverse);
  if (!surface && !inside(b, av) && !inside(a, bv)) return null;
  let depth = 0;
  let witness: T.Vector3 | null = null;
  for (const triangle of a.triangles) {
    const polygon = clip(
      triangle.map((p) => p.clone().applyMatrix4(matrix)),
      b.planes,
    );
    if (!polygon.length) continue;
    const centre = polygon
      .reduce((p, v) => p.add(v), new T.Vector3())
      .divideScalar(polygon.length);
    for (const point of [centre, ...polygon]) {
      if (!inside(b, point)) continue;
      const distance = b.bvh.closestPointToPoint(point)?.distance ?? 0;
      if (distance > depth) {
        depth = distance;
        witness = point.clone();
        // A positive witness proves interference; finding its global maximum adds no safety.
        if (depth > 0.1) return { surface, depth, witness: witness.toArray() };
      }
    }
  }
  // Fully enclosed bolt also has no crossing surface; its surface is the witness.
  if (!witness && inside(a, bv)) {
    depth = a.bvh.closestPointToPoint(bv)?.distance ?? 0;
    witness = bv.clone().applyMatrix4(matrix);
  }
  return { surface, depth, witness: witness?.toArray() ?? null };
}

test("solid diagnostic distinguishes bounding-box overlap and contact from penetration and containment", () => {
  const a = new T.Mesh(new T.BoxGeometry(2, 2, 2));
  const b = new T.Mesh(new T.BoxGeometry(2, 2, 2));
  a.position.x = 0.5;
  a.updateMatrixWorld();
  b.updateMatrixWorld();
  expect(collision(solid(a), solid(b))?.depth).toBeGreaterThan(0);
  a.position.x = 2;
  a.updateMatrixWorld();
  expect(collision(solid(a), solid(b))?.depth ?? 0).toBeLessThan(epsilon);
  a.position.x = 1.5;
  a.updateMatrixWorld();
  expect(collision(solid(a), solid(b))?.depth).toBeGreaterThan(0.3);
  a.position.x = 3;
  a.updateMatrixWorld();
  expect(collision(solid(a), solid(b))).toBeNull();
  a.position.x = 0;
  a.scale.setScalar(0.25);
  a.updateMatrixWorld();
  expect(collision(solid(a), solid(b))?.depth).toBeGreaterThan(0.5);
  const ring = new T.Mesh(new T.TorusGeometry(4, 1, 8, 16));
  ring.updateMatrixWorld();
  expect(
    new T.Box3()
      .setFromObject(ring)
      .intersectsBox(new T.Box3().setFromObject(b)),
  ).toBe(true);
  expect(collision(solid(ring), solid(b))).toBeNull();
});

test("all mechanism meshes clear the bolt throughout the actual assembled cycle", () => {
  const results: object[] = [];
  const failures: object[] = [];
  const times = [
    ...new Set([
      ...Array.from({ length: 281 }, (_, i) => i * 0.25),
      ...Array.from({ length: 181 }, (_, i) => 8 + i * 0.1),
    ]),
  ].sort((a, b) => a - b);
  let configurations = 0,
    sampledFrames = 0;
  for (const revision of REVISIONS)
    for (const spec of PRESETS) {
      const heads = revision.features.includes("drive") ? HEADS : [HEADS[0]];
      for (const head of heads) {
        const model = makeRevisionGripper(revision.id, spec, head.id);
        model.root.scale.setScalar(1); // Work in the model's native mm units.
        const bolt = model.root.getObjectByName("held-bolt")!;
        const bolts: Solid[] = [],
          tools: Solid[] = [];
        model.root.traverse((o) => {
          if (!(o instanceof T.Mesh)) return;
          let parent: T.Object3D | null = o;
          while (parent && parent !== bolt) parent = parent.parent;
          (parent === bolt ? bolts : tools).push(solid(o));
        });
        const rows = new Map<
          string,
          {
            tool: string;
            bolt: string;
            contactPart: boolean;
            from: number;
            to: number;
            at: number;
            depth: number;
            witness: number[] | null;
            samples: number;
          }
        >();
        configurations++;
        for (const time of times) {
          updateActualScene(model, time, spec, revision.id, head.id);
          sampledFrames++;
          const boxes = new Map(
            [...tools, ...bolts].map((s) => {
              s.mesh.geometry.computeBoundingBox();
              return [
                s,
                s.mesh.geometry
                  .boundingBox!.clone()
                  .applyMatrix4(s.mesh.matrixWorld),
              ] as const;
            }),
          );
          for (const tool of tools)
            for (const b of bolts) {
              if (!boxes.get(tool)!.intersectsBox(boxes.get(b)!)) continue;
              const hit = collision(tool, b);
              if (!hit || hit.depth <= epsilon + 1e-5) continue;
              const key = `${tool.mesh.name}/${b.mesh.name}`;
              const row = rows.get(key) ?? {
                tool: tool.mesh.name,
                bolt: b.mesh.name,
                contactPart:
                  /contact|shoe-head-lip|under-head-retainer|hex-form-socket|(?:phillips|slotted).*bit|thumb-distal/.test(
                    tool.mesh.name,
                  ),
                from: time,
                to: time,
                at: time,
                depth: 0,
                witness: null,
                samples: 0,
              };
              row.to = time;
              row.samples++;
              if (hit.depth > row.depth) {
                row.depth = hit.depth;
                row.at = time;
                row.witness = hit.witness;
              }
              rows.set(key, row);
            }
        }
        const summary = {
          revision: revision.code,
          spec: spec.id,
          head: head.id,
          collisions: [...rows.values()],
        };
        results.push(summary);
        if (rows.size) failures.push(summary);
      }
    }
  writeFileSync(
    `${reportPrefix}-clearance-audit.json`,
    JSON.stringify(
      { configurations, sampledFrames, epsilonMm: epsilon, results },
      null,
      2,
    ),
  );
  expect(configurations).toBe(33);
  // Contact names are labels only: a pad, bit or lip may touch, never penetrate.
  expect(failures).toEqual([]);
}, 240000);

test("socket and recessed drivers seat without crossing the actual bolt solid", () => {
  for (const spec of PRESETS)
    for (const head of HEADS) {
      const model = makeRevisionGripper("integrated", spec, head.id);
      model.root.scale.setScalar(1);
      const bolt = model.root.getObjectByName("held-bolt")!;
      const bolts: Solid[] = [],
        drivers: Solid[] = [];
      bolt.traverse((o) => {
        if (o instanceof T.Mesh) bolts.push(solid(o));
      });
      model.root.traverse((o) => {
        if (
          o instanceof T.Mesh &&
          /^(?:hex-form-socket|socket-back|socket-shank|bit-shaft|slotted-bit|phillips-bit|phillips-cross-bit)$/.test(
            o.name,
          )
        )
          drivers.push(solid(o));
      });
      for (const time of [
        27, 28, 29, 29.5, 30, 30.5, 31, 38, 55, 60, 63, 64, 65,
      ]) {
        updateActualScene(model, time, spec, "integrated", head.id);
        for (const driver of drivers)
          for (const b of bolts) {
            const hit = collision(driver, b);
            expect(
              hit?.depth ?? 0,
              `${spec.id}/${head.id} t=${time} ${driver.mesh.name}/${b.mesh.name}`,
            ).toBeLessThanOrEqual(epsilon);
          }
      }
    }
}, 240000);

test("grip stow and return clear fixed mechanism solids", () => {
  const results: object[] = [];
  const failures: object[] = [];
  const times = [
    ...Array.from({ length: 41 }, (_, i) => 22 + i * 0.1),
    ...Array.from({ length: 51 }, (_, i) => 65 + i * 0.1),
  ];
  for (const revision of REVISIONS)
    for (const spec of PRESETS) {
      const heads = revision.features.includes("drive") ? HEADS : [HEADS[0]];
      for (const head of heads) {
        const model = makeRevisionGripper(revision.id, spec, head.id);
        model.root.scale.setScalar(1);
        const feed = model.root.getObjectByName("feed-carriage")!;
        const moving: Solid[] = [],
          fixed: Solid[] = [];
        model.root.traverse((o) => {
          if (!(o instanceof T.Mesh)) return;
          let parent: T.Object3D | null = o;
          while (parent && parent !== feed) parent = parent.parent;
          if (parent === feed) moving.push(solid(o));
          else if (!/bolt|head-recess/.test(o.name)) fixed.push(solid(o));
        });
        const rows = new Map<
          string,
          {
            moving: string;
            fixed: string;
            from: number;
            to: number;
            at: number;
            depth: number;
            samples: number;
          }
        >();
        for (const time of times) {
          updateActualScene(model, time, spec, revision.id, head.id);
          const boxes = new Map(
            [...moving, ...fixed].map((s) => {
              s.mesh.geometry.computeBoundingBox();
              return [
                s,
                s.mesh.geometry
                  .boundingBox!.clone()
                  .applyMatrix4(s.mesh.matrixWorld),
              ] as const;
            }),
          );
          for (const m of moving)
            for (const f of fixed) {
              if (!boxes.get(m)!.intersectsBox(boxes.get(f)!)) continue;
              const hit = collision(m, f);
              if (!hit || hit.depth <= epsilon + 1e-5) continue;
              const key = `${m.mesh.name}/${f.mesh.name}`;
              const row = rows.get(key) ?? {
                moving: m.mesh.name,
                fixed: f.mesh.name,
                from: time,
                to: time,
                at: time,
                depth: 0,
                samples: 0,
              };
              row.to = time;
              row.samples++;
              if (hit.depth > row.depth) {
                row.depth = hit.depth;
                row.at = time;
              }
              rows.set(key, row);
            }
        }
        results.push({
          revision: revision.code,
          spec: spec.id,
          head: head.id,
          collisions: [...rows.values()],
        });
        if (rows.size)
          failures.push({
            revision: revision.code,
            spec: spec.id,
            head: head.id,
            collisions: [...rows.values()],
          });
      }
    }
  writeFileSync(
    `${reportPrefix}-stow-audit.json`,
    JSON.stringify(results, null, 2),
  );
  expect(failures).toEqual([]);
}, 240000);

test("actual mesh contacts support both jaws and every holder sector across handover", () => {
  const results: object[] = [];
  const failures: object[] = [];
  for (const revision of REVISIONS)
    for (const spec of PRESETS) {
      const heads = revision.features.includes("drive") ? HEADS : [HEADS[0]];
      for (const head of heads) {
        const model = makeRevisionGripper(revision.id, spec, head.id);
        model.root.scale.setScalar(1);
        const shank = solid(model.root.getObjectByName("bolt-shank") as T.Mesh);
        const headMesh = solid(
          model.root.getObjectByName(
            head.id === "hex" ? "hex-bolt-head" : "head-recess-floor",
          ) as T.Mesh,
        );
        const pads = ["jaw-slide-left", "jaw-slide-right"].map((name) => {
          const meshes: T.Mesh[] = [];
          model.root.getObjectByName(name)!.traverse((o) => {
            if (
              o instanceof T.Mesh &&
              /^(?:flat-contact-pad|U-contact-face)$/.test(o.name)
            )
              meshes.push(o);
          });
          expect(meshes.length, name).toBeGreaterThan(0);
          return meshes;
        });
        const retainers = [0, 1, 2].map((i) => {
          const meshes: T.Mesh[] = [];
          model.root.getObjectByName(`head-retainer-${i}`)!.traverse((o) => {
            if (
              o instanceof T.Mesh &&
              /^(?:head-contact|under-head-retainer)$/.test(o.name)
            )
              meshes.push(o);
          });
          expect(meshes.length, `head-retainer-${i}`).toBeGreaterThan(0);
          return meshes;
        });
        const rows: object[] = [];
        for (const time of [
          0, 3, 4, 5, 8, 10, 12, 14, 16, 20, 20.5, 21, 21.5, 22, 22.1, 22.25,
          22.5, 22.75, 23, 25, 29, 31, 36, 39, 50, 55, 56,
        ]) {
          updateActualScene(model, time, spec, revision.id, head.id);
          function gap(target: Solid, meshes: T.Mesh[]) {
            return Math.min(
              ...meshes.map(
                (m) =>
                  target.bvh.closestPointToGeometry(
                    m.geometry,
                    target.mesh.matrixWorld
                      .clone()
                      .invert()
                      .multiply(m.matrixWorld),
                  )?.distance ?? Infinity,
              ),
            );
          }
          const bodyPadGaps = pads.map((meshes) => gap(shank, meshes));
          const headRetainerGaps = retainers.map((meshes) =>
            gap(headMesh, meshes),
          );
          const row = { time, bodyPadGaps, headRetainerGaps };
          rows.push(row);
          const supportingGaps =
            time < 5 ? [] : time <= 22 ? bodyPadGaps : headRetainerGaps;
          if (supportingGaps.some((distance) => distance >= 0.04))
            failures.push({
              revision: revision.code,
              spec: spec.id,
              head: head.id,
              ...row,
            });
        }
        results.push({
          revision: revision.code,
          spec: spec.id,
          head: head.id,
          gaps: rows,
        });
      }
    }
  writeFileSync(
    `${reportPrefix}-support-audit.json`,
    JSON.stringify(results, null, 2),
  );
  expect(failures).toEqual([]);
}, 240000);

test("fixed scene solids support the external bolt before pickup and after release", () => {
  for (const spec of PRESETS)
    for (const head of HEADS) {
      const model = makeRevisionGripper("integrated", spec, head.id);
      model.root.scale.setScalar(1);
      const fixture = makeRevisionFixtures(spec, head.id);
      fixture.root.scale.setScalar(1000);
      const shank = solid(model.root.getObjectByName("bolt-shank") as T.Mesh);
      const headSolid = solid(
        model.root.getObjectByName(
          head.id === "hex" ? "hex-bolt-head" : "head-recess-floor",
        ) as T.Mesh,
      );
      for (const time of [0, 2, 3, 4.9, 63, 64, 65, 67, 70]) {
        updateActualScene(model, time, spec, "integrated", head.id);
        const scene = revisionScenePose(time, spec, "integrated", head.id);
        fixture.root.position.copy(scene.tool).multiplyScalar(-1000);
        fixture.root.updateMatrixWorld(true);
        const supports =
          scene.owner === "pickup"
            ? ([
                [shank, "shank-rest"],
                [headSolid, "head-rest"],
              ] as const)
            : ([[headSolid, "workpiece-plate"]] as const);
        for (const [target, name] of supports) {
          const support = fixture.root.getObjectByName(name) as T.Mesh;
          const gap =
            target.bvh.closestPointToGeometry(
              support.geometry,
              target.mesh.matrixWorld
                .clone()
                .invert()
                .multiply(support.matrixWorld),
            )?.distance ?? Infinity;
          expect(gap, `${spec.id}/${head.id} ${name} t=${time}`).toBeLessThan(
            0.04,
          );
        }
      }
    }
}, 240000);

test("parts with relative motion never penetrate each other's solid geometry", () => {
  const cases = REVISIONS.flatMap((revision) =>
    PRESETS.flatMap((spec) =>
      (revision.features.includes("drive") ? HEADS : [HEADS[0]]).map(
        ({ id: head }) => ({ id: revision.id, spec, head }),
      ),
    ),
  ).filter(
    ({ id, spec, head }) =>
      !process.env.CLEARANCE_CASE ||
      process.env.CLEARANCE_CASE === `${id}/${spec.id}/${head}`,
  );
  expect(
    cases.length,
    "CLEARANCE_CASE must select an existing configuration",
  ).toBeGreaterThan(0);
  const times = [
    0, 4, 5, 8, 8.1, 8.3, 9, 11, 14, 17, 19, 20, 21, 22, 22.5, 23, 23.5, 24,
    24.2, 24.5, 24.8, 25, 28, 29.5, 31, 36.2, 36.8, 37.5, 38.2, 39.1, 40.1,
    42.7, 47.3, 51.1, 55.7, 56.5, 57.5, 58.5, 59, 60, 63, 64, 65, 65.5, 66,
    66.5, 67, 67.5, 68, 69, 70,
  ];
  const results: object[] = [];
  for (const { id, spec, head } of cases) {
    const model = makeRevisionGripper(id, spec, head);
    model.root.scale.setScalar(1);
    const solids: Solid[] = [];
    model.root.traverse((o) => {
      if (o instanceof T.Mesh && !/bolt|head-recess/.test(o.name))
        solids.push(solid(o));
    });
    updateActualScene(model, 0, spec, id, head);
    const initial = solids.map((s) => s.mesh.matrixWorld.clone().invert());
    const motion = solids.map(() => [] as number[]);
    for (const time of times) {
      updateActualScene(model, time, spec, id, head);
      solids.forEach((s, i) => {
        const displacement = s.mesh.matrixWorld.clone().multiply(initial[i]);
        motion[i].push(
          ...displacement.elements.map((v) => Math.round(v * 1e5)),
        );
      });
    }
    const signatures = motion.map((values) => values.join(","));
    const pairs: [number, number][] = [];
    for (let i = 0; i < solids.length; i++)
      for (let j = i + 1; j < solids.length; j++)
        if (signatures[i] !== signatures[j]) pairs.push([i, j]);
    const rows = new Map<
      string,
      {
        a: string;
        b: string;
        from: number;
        to: number;
        at: number;
        depth: number;
        witness: number[] | null;
      }
    >();
    for (const time of times) {
      updateActualScene(model, time, spec, id, head);
      const boxes = solids.map((s) => {
        s.mesh.geometry.computeBoundingBox();
        return s.mesh.geometry
          .boundingBox!.clone()
          .applyMatrix4(s.mesh.matrixWorld);
      });
      for (const [i, j] of pairs) {
        if (!boxes[i].intersectsBox(boxes[j])) continue;
        const a = solids[i],
          b = solids[j];
        const hit = collision(a, b);
        if (!hit || hit.depth <= epsilon + 1e-5) continue;
        const key = [a.mesh.name, b.mesh.name].sort().join("/");
        const row = rows.get(key) ?? {
          a: a.mesh.name,
          b: b.mesh.name,
          from: time,
          to: time,
          at: time,
          depth: 0,
          witness: null,
        };
        row.to = time;
        if (hit.depth > row.depth) {
          row.depth = hit.depth;
          row.at = time;
          row.witness = hit.witness
            ? new T.Vector3()
                .fromArray(hit.witness)
                .applyMatrix4(b.mesh.matrixWorld)
                .toArray()
            : null;
        }
        rows.set(key, row);
      }
    }
    results.push({
      id,
      spec: spec.id,
      head,
      movingPairs: pairs.length,
      collisions: [...rows.values()].sort((a, b) => b.depth - a.depth),
    });
  }
  writeFileSync(
    `${reportPrefix}-mechanism-audit.json`,
    JSON.stringify(results, null, 2),
  );
  expect(results.flatMap((r: any) => r.collisions)).toEqual([]);
}, 240000);

test("linear bearings stay engaged on their actual guide shafts across the complete stroke", () => {
  const bearingShaftNames = [
    ["feed-linear-bearing", "feed-guide"],
    ["feed-drive-nut", "feed-screw"],
    ["radial-linear-bearing", "radial-guide-left|radial-guide-right"],
    ["pivot-bearing", "shoe-pivot-shaft"],
    ["holder-withdraw-bushing", "holder-withdraw-guide"],
    ["tool-feed-guide-bushing", "tool-feed-guide"],
    ["axial-guide-bushing", "axial-guide"],
  ];
  for (const spec of PRESETS)
    for (const head of HEADS) {
      const model = makeRevisionGripper("integrated", spec, head.id);
      model.root.scale.setScalar(1);
      for (const [bearingName, shaftNames] of bearingShaftNames) {
        const bearings: T.Mesh[] = [],
          shafts: Solid[] = [];
        model.root.traverse((o) => {
          if (!(o instanceof T.Mesh)) return;
          if (o.name === bearingName) bearings.push(o);
          if (shaftNames.split("|").includes(o.name)) shafts.push(solid(o));
        });
        expect(bearings.length, bearingName).toBeGreaterThan(0);
        expect(shafts.length, shaftNames).toBeGreaterThan(0);
        for (const time of [
          0, 5, 8.1, 14, 16, 20, 22, 22.5, 23, 24, 25, 30, 39, 57, 59, 64, 66,
          67, 68.5, 70,
        ]) {
          updateActualScene(model, time, spec, "integrated", head.id);
          for (const bearing of bearings) {
            bearing.geometry.computeBoundingBox();
            const z = bearing.geometry.boundingBox!;
            const ends = [z.min.z + 0.001, z.max.z - 0.001].map((v) =>
              new T.Vector3(0, 0, v).applyMatrix4(bearing.matrixWorld),
            );
            const supported = shafts.some((shaft) => {
              const inverse = shaft.mesh.matrixWorld.clone().invert();
              return ends.every((point) =>
                inside(shaft, point.clone().applyMatrix4(inverse)),
              );
            });
            expect(
              supported,
              `${spec.id}/${head.id} ${bearingName} t=${time}`,
            ).toBe(true);
          }
        }
      }
    }
}, 240000);

test("rotor journals retain coaxial bearing support while turning and withdrawing", () => {
  for (const spec of PRESETS)
    for (const head of HEADS) {
      const model = makeRevisionGripper("integrated", spec, head.id);
      model.root.scale.setScalar(1);
      for (const [bearingName, journalName] of [
        ["rear-spindle-bearing", "hollow-splined-shaft"],
        ["front-spindle-bearing", "hollow-splined-shaft"],
        ["holder-rear-bearing", "holder-journal-tube"],
        ["holder-front-bearing", "holder-journal-tube"],
      ]) {
        const bearing = model.root.getObjectByName(bearingName) as T.Mesh;
        const journal = model.root.getObjectByName(journalName)!;
        expect(bearing, bearingName).toBeDefined();
        expect(journal, journalName).toBeDefined();
        const journalSolids: Solid[] = [];
        journal.traverse((o) => {
          if (o instanceof T.Mesh) journalSolids.push(solid(o));
        });
        expect(journalSolids.length, journalName).toBeGreaterThan(0);
        bearing.geometry.computeBoundingBox();
        for (const time of [
          0, 27, 29, 31, 36.5, 39.7, 46.4, 57, 58.5, 60, 63, 65,
        ]) {
          updateActualScene(model, time, spec, "integrated", head.id);
          const matrix = journal.matrixWorld
            .clone()
            .invert()
            .multiply(bearing.matrixWorld);
          const axis = new T.Vector3(0, 0, 1).transformDirection(matrix);
          const centre = new T.Vector3().applyMatrix4(matrix);
          expect(Math.hypot(axis.x, axis.y)).toBeLessThan(1e-6);
          expect(Math.hypot(centre.x, centre.y)).toBeLessThan(1e-6);
          // Both bearing ends need material around their entire inner circumference.
          const radius = bearingName.includes("spindle") ? 5.45 : 13.95;
          for (const z of [
            bearing.geometry.boundingBox!.min.z + 0.001,
            bearing.geometry.boundingBox!.max.z - 0.001,
          ])
            for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 6) {
              const point = new T.Vector3(
                radius * Math.cos(angle),
                radius * Math.sin(angle),
                z,
              ).applyMatrix4(bearing.matrixWorld);
              expect(
                journalSolids.some((s) =>
                  inside(
                    s,
                    point
                      .clone()
                      .applyMatrix4(s.mesh.matrixWorld.clone().invert()),
                  ),
                ),
                `${bearingName} t=${time} z=${z} angle=${angle}`,
              ).toBe(true);
            }
        }
      }
    }
}, 240000);
