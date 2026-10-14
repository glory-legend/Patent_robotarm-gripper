import { expect, test } from "vitest";
import { Box3, Line3, Mesh, Raycaster, Triangle, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { makeCompactProduct } from "../src/product-compact";

function distance(
  root: ReturnType<typeof makeCompactProduct>["root"],
  a: string,
  b: string,
) {
  const first = root.getObjectByName(a) as Mesh;
  const second = root.getObjectByName(b) as Mesh;
  const relative = first.matrixWorld
    .clone()
    .invert()
    .multiply(second.matrixWorld);
  return new MeshBVH(first.geometry).closestPointToGeometry(
    second.geometry,
    relative,
  )!.distance;
}

test("compact product internals fit the actual housing bore with a reserved cable passage", () => {
  const g = makeCompactProduct();
  g.root.scale.setScalar(1);
  g.root.updateMatrixWorld(true);
  const housing = g.root.getObjectByName("compact-housing") as Mesh;
  housing.geometry.computeBoundingBox();
  expect(housing.geometry.boundingBox!.max.x).toBeCloseTo(48);
  expect(g.dimensions).toMatchObject({ diameter: 96, length: 180 });
  for (const part of g.parts.filter((p) => p.category === "internal")) {
    const bounds = new Box3().setFromObject(part.object);
    expect(bounds.min.z, part.id).toBeGreaterThanOrEqual(-175.01);
    expect(bounds.max.z, part.id).toBeLessThanOrEqual(-17.99);
    part.object.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const vertices = o.geometry.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const p = new Vector3()
          .fromBufferAttribute(vertices, i)
          .applyMatrix4(o.matrixWorld);
        expect(Math.hypot(p.x, p.y), o.name).toBeLessThan(45.9);
      }
    });
  }
  expect(g.root.getObjectByName("cable-service-duct")).toBeDefined();
});

test("structural mounts and both L shoes have real material connections", () => {
  const g = makeCompactProduct();
  g.root.scale.setScalar(1);
  g.root.updateMatrixWorld(true);
  for (const [a, b] of [
    ["compact-adapter", "feed-reaction-post"],
    ["compliance-moving-seat", "motor-reaction-neck"],
    ["motor-reaction-neck", "coaxial-spindle-motor"],
    ["left-rack", "left-rack-link"],
    ["right-rack", "right-rack-link"],
    ["left-finger-stem", "left-finger-foot"],
    ["right-finger-stem", "right-finger-foot"],
    ["left-shoe-hub", "left-shoe-pad"],
    ["right-shoe-hub", "right-shoe-pad"],
  ])
    expect(distance(g.root, a, b), `${a}/${b}`).toBeLessThan(0.03);
});

test("guide and actuator shafts pass through physical bores", () => {
  const g = makeCompactProduct("phillips");
  g.root.scale.setScalar(1);
  g.root.updateMatrixWorld(true);
  for (const [name, x, y] of [
    ["left-feed-bushing", -30, 0],
    ["right-feed-bushing", 30, 0],
    ["common-feed-cylinder", 0, 32],
    ["bit-feed-cylinder", 25, 0],
  ] as const) {
    const ray = new Raycaster(new Vector3(x, y, -180), new Vector3(0, 0, 1));
    expect(
      ray.intersectObject(g.root.getObjectByName(name)!, false),
      name,
    ).toEqual([]);
  }
});

test("inspection modes separate assemblies and restore their exact assembled placement", () => {
  const g = makeCompactProduct();
  g.setInspection("assembled", 0.5);
  const positions = g.parts.map((p) => p.object.position.clone());
  g.setInspection("exploded", 1);
  expect(
    g.parts.some((p, i) => p.object.position.distanceTo(positions[i]) > 10),
  ).toBe(true);
  g.setInspection("assembled", 0.5);
  g.parts.forEach((p, i) =>
    expect(p.object.position.distanceTo(positions[i])).toBeLessThan(1e-9),
  );
  g.setInspection("section", 0.5);
  const housing = g.root.getObjectByName("compact-housing") as Mesh;
  expect((housing.material as any).clippingPlanes).toHaveLength(1);
});

test("moving shafts, shoes, and the locking sleeve have real running clearance", () => {
  for (const head of ["hex", "phillips", "slotted"] as const) {
    const g = makeCompactProduct(head);
    g.root.scale.setScalar(1);
    g.root.updateMatrixWorld(true);
    for (const [a, b] of [
      ["left-shoe-pivot", "left-finger-foot"],
      ["right-shoe-pivot", "right-finger-foot"],
      ["grip-cylinder-piston", "grip-actuator-reaction-mount"],
      ...(head !== "hex"
        ? [
            ["bit-feed-piston", "bit-feed-cylinder-mount"],
            ["compact-holder-journal", "compact-spindle-nose"],
          ]
        : []),
    ])
      expect(distance(g.root, a, b), `${head} ${a}/${b}`).toBeGreaterThan(0.02);
    if (head === "hex") {
      const sleeve = g.root.getObjectByName("detent-lock-sleeve") as Mesh;
      const bvh = new MeshBVH(sleeve.geometry);
      g.root.traverse((o) => {
        if (
          !(o instanceof Mesh) ||
          !/socket-wall-with-ball-bore|shoe-pad|shoe-hub/.test(o.name)
        )
          return;
        const relative = sleeve.matrixWorld
          .clone()
          .invert()
          .multiply(o.matrixWorld);
        expect(
          bvh.closestPointToGeometry(o.geometry, relative)!.distance,
          o.name,
        ).toBeGreaterThan(0.02);
      });
    }
  }
});

test("all three head configurations clear the actual M8 bolt surfaces", () => {
  for (const head of ["hex", "phillips", "slotted"] as const) {
    const g = makeCompactProduct(head);
    g.root.scale.setScalar(1);
    g.root.updateMatrixWorld(true);
    const bolt = g.root.getObjectByName("compact-reference-bolt")!;
    const bolts: Mesh[] = [],
      mechanisms: Mesh[] = [];
    bolt.traverse((o) => {
      if (o instanceof Mesh) bolts.push(o);
    });
    g.root.traverse((o) => {
      if (o instanceof Mesh && !bolts.includes(o)) mechanisms.push(o);
    });
    for (const b of bolts) {
      const bounds = new Box3().setFromObject(b),
        bvh = new MeshBVH(b.geometry);
      for (const m of mechanisms) {
        const otherBounds = new Box3().setFromObject(m);
        if (!bounds.intersectsBox(otherBounds)) continue;
        if (
          m.name === "split-holder-retention-lip" &&
          b.name === "compact-bolt-head-base"
        ) {
          expect(otherBounds.min.z, head).toBeGreaterThanOrEqual(
            bounds.max.z - 1e-6,
          );
          continue;
        }
        // Coplanar cap triangles can produce a spurious BVH zero outside the
        // bolt's radius. Prove this annular sector's complete triangulated
        // radial footprint lies outside the cylindrical shank instead.
        if (
          m.name === "split-holder-retention-lip" &&
          b.name === "compact-bolt-shank"
        ) {
          const vertices = m.geometry.getAttribute("position"),
            index = m.geometry.index;
          for (let i = 0; i < (index?.count ?? vertices.count); i += 3) {
            const points = [0, 1, 2].map((j) =>
              new Vector3()
                .fromBufferAttribute(
                  vertices,
                  index ? index.getX(i + j) : i + j,
                )
                .applyMatrix4(m.matrixWorld)
                .setZ(0),
            );
            const triangle = new Triangle(points[0], points[1], points[2]);
            const origin = new Vector3();
            const radius =
              triangle.getArea() > 1e-9
                ? triangle.closestPointToPoint(origin, new Vector3()).length()
                : Math.min(
                    ...points.map((p, j) =>
                      new Line3(p, points[(j + 1) % 3])
                        .closestPointToPoint(origin, true, new Vector3())
                        .length(),
                    ),
                  );
            expect(radius, `${head} lip triangle ${i}`).toBeGreaterThan(5.59);
          }
          continue;
        }
        const relative = b.matrixWorld.clone().invert().multiply(m.matrixWorld);
        expect(
          bvh.closestPointToGeometry(m.geometry, relative)!.distance,
          `${head} ${m.name}/${b.name}`,
        ).toBeGreaterThan(0.02);
      }
    }
  }
});

test("the recessed-head camera has a real aperture and an unobstructed ray to the recess", () => {
  for (const head of ["phillips", "slotted"] as const) {
    const g = makeCompactProduct(head);
    g.root.scale.setScalar(1);
    g.root.updateMatrixWorld(true);
    const camera = g.root.getObjectByName("compact-camera")!;
    const bolt = g.root.getObjectByName("compact-reference-bolt")!;
    const origin = g.root
      .getObjectByName("compact-camera-lens")!
      .getWorldPosition(new Vector3());
    const target = new Vector3(0, 0, -5.3),
      vector = target.clone().sub(origin);
    const blockers: Mesh[] = [];
    g.root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      let p = o.parent;
      while (p && p !== camera && p !== bolt) p = p.parent;
      if (!p) blockers.push(o);
    });
    const ray = new Raycaster(
      origin,
      vector.clone().normalize(),
      0.01,
      vector.length() - 0.01,
    );
    expect(
      ray.intersectObjects(blockers).map((h) => h.object.name),
      head,
    ).toEqual([]);
  }
});

test("the radial guide shafts clear the independently mounted head holder", () => {
  const g = makeCompactProduct("phillips");
  g.root.scale.setScalar(1);
  g.root.updateMatrixWorld(true);
  const holder = g.root.getObjectByName("compact-holder-housing") as Mesh;
  const journal = g.root.getObjectByName("compact-holder-journal") as Mesh;
  for (const body of [holder, journal]) {
    const bvh = new MeshBVH(body.geometry);
    g.root.traverse((o) => {
      if (!(o instanceof Mesh) || o.name !== "opposed-slide-guide") return;
      const relative = body.matrixWorld
        .clone()
        .invert()
        .multiply(o.matrixWorld);
      expect(
        bvh.closestPointToGeometry(o.geometry, relative)!.distance,
        body.name,
      ).toBeGreaterThan(0.02);
    });
  }
});

test("moving slides and bit yoke clear their fixed supports", () => {
  const g = makeCompactProduct("phillips");
  g.root.scale.setScalar(1);
  g.root.updateMatrixWorld(true);
  const groups: [string[], string[]][] = [
    [
      ["opposed-slide-guide"],
      ["radial-slider-bridge", "left-rack-link", "right-rack-link"],
    ],
    [
      ["left-finger-stem", "right-finger-stem"],
      [
        "gravity-cam-frame-bridge",
        "gravity-cam-mount",
        "gravity-return-cam-track",
      ],
    ],
    [["bit-feed-yoke-arm"], ["bit-feed-cylinder-mount"]],
  ];
  for (const [movingNames, fixedNames] of groups) {
    const moving: Mesh[] = [],
      fixed: Mesh[] = [];
    g.root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      if (movingNames.includes(o.name)) moving.push(o);
      if (fixedNames.includes(o.name)) fixed.push(o);
    });
    for (const a of moving)
      for (const b of fixed) {
        const relative = a.matrixWorld.clone().invert().multiply(b.matrixWorld);
        expect(
          new MeshBVH(a.geometry).closestPointToGeometry(b.geometry, relative)!
            .distance,
          `${a.name}/${b.name}`,
        ).toBeGreaterThan(0.02);
      }
  }
  const sensor = new Box3().setFromObject(
    g.root.getObjectByName("compact-displacement-sensor")!,
  );
  const mount = new Box3().setFromObject(
    g.root.getObjectByName("displacement-sensor-mount")!,
  );
  expect(mount.max.x).toBeCloseTo(sensor.min.x);
  for (const [a, b] of [
    ["bit-feed-cylinder-mount", "bit-feed-cylinder"],
    ["bit-feed-cylinder-mount", "compliance-moving-seat"],
    ["displacement-sensor-mount", "compact-adapter"],
    ["gravity-cam-frame-bridge", "gravity-cam-mount"],
    ["gravity-cam-mount", "gravity-return-cam-track"],
    ["radial-slider-bridge", "radial-slider-bearing"],
  ])
    expect(distance(g.root, a, b), `${a}/${b}`).toBeLessThan(0.03);
});
