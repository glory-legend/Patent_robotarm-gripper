import * as T from "three";
import { makeRevisionGrip } from "./revision-grip";
import { makeRevisionHeadDrive } from "./revision-head-drive";
import { ramp, type BoltSpec } from "./timeline";
import {
  hasFeature,
  type RevisionId,
  type HeadType,
  type InspectionMode,
} from "./revision-config";
import {
  REVISION_BODY as B,
  revisionBoltMatrix,
  revisionPose,
} from "./revision-motion";

/** Millimetre concept assembly. The outer group converts to metres; +Z points toward the work. */
export function makeRevisionGripper(
  id: RevisionId,
  spec: BoltSpec,
  requestedHead: HeadType,
) {
  const head: HeadType = hasFeature(id, "drive") ? requestedHead : "hex";
  const gravity = hasFeature(id, "gravity"),
    capture = hasFeature(id, "retention");
  const improved = hasFeature(id, "head"),
    compliant = hasFeature(id, "compliance"),
    damped = hasFeature(id, "damping");
  const root = new T.Group();
  root.name = `revision-${id}`;
  root.scale.setScalar(0.001);
  const materials: T.MeshStandardMaterial[] = [];
  function material(color: string, metalness = 0.65) {
    const m = new T.MeshStandardMaterial({
      color,
      metalness,
      roughness: 0.36,
      side: T.DoubleSide,
    });
    materials.push(m);
    return m;
  }
  const alu = material("#c1cdd3"),
    dark = material("#354b59"),
    steel = material("#71828c"),
    teal = material("#287d81"),
    orange = material("#c3732e"),
    gold = material("#d5b45f"),
    black = material("#182c39", 0.15),
    green = material("#399482", 0.25);
  function group(name: string, parent: T.Object3D = root) {
    const g = new T.Group();
    g.name = name;
    parent.add(g);
    return g;
  }
  function mesh(
    parent: T.Object3D,
    geometry: T.BufferGeometry,
    mat: T.Material,
    name: string,
    at = [0, 0, 0],
  ) {
    const m = new T.Mesh(geometry, mat);
    m.name = name;
    m.position.fromArray(at);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const box = (
    p: T.Object3D,
    size: number[],
    at: number[],
    m: T.Material,
    n: string,
  ) =>
    mesh(p, new T.BoxGeometry(...(size as [number, number, number])), m, n, at);
  function cyl(
    p: T.Object3D,
    r: number,
    l: number,
    at: number[],
    m: T.Material,
    n: string,
    axis = "z",
  ) {
    const o = mesh(p, new T.CylinderGeometry(r, r, l, 32), m, n, at);
    o.rotation.x = axis === "z" ? Math.PI / 2 : 0;
    if (axis === "x") o.rotation.z = Math.PI / 2;
    return o;
  }
  const circle = (r: number) => {
    const p = new T.Path();
    p.absarc(0, 0, r, 0, Math.PI * 2, true);
    return p;
  };
  function ring(
    p: T.Object3D,
    outer: number,
    inner: number,
    z: number,
    depth: number,
    m: T.Material,
    n: string,
  ) {
    const s = new T.Shape();
    s.absarc(0, 0, outer, 0, Math.PI * 2, false);
    s.holes.push(circle(inner));
    return mesh(
      p,
      new T.ExtrudeGeometry(s, {
        depth,
        bevelEnabled: false,
        curveSegments: 36,
      }),
      m,
      n,
      [0, 0, z],
    );
  }
  function boredBox(
    p: T.Object3D,
    size: number[],
    at: number[],
    holes: number[][],
    m: T.Material,
    name: string,
  ) {
    const shape = new T.Shape();
    const [x, y, z] = size;
    shape.moveTo(-x / 2, -y / 2);
    shape.lineTo(x / 2, -y / 2);
    shape.lineTo(x / 2, y / 2);
    shape.lineTo(-x / 2, y / 2);
    shape.closePath();
    for (const [hx, hy, radius] of holes) {
      const h = new T.Path();
      h.absarc(hx, hy, radius, 0, 2 * Math.PI, true);
      shape.holes.push(h);
    }
    return mesh(
      p,
      new T.ExtrudeGeometry(shape, { depth: z, bevelEnabled: false }),
      m,
      name,
      [at[0], at[1], at[2] - z / 2],
    );
  }
  function spring(
    p: T.Object3D,
    r: number,
    l: number,
    at: number[],
    name: string,
  ) {
    const pts = Array.from(
      { length: 181 },
      (_, i) =>
        new T.Vector3(
          r * Math.cos((i / 180) * 12 * Math.PI),
          r * Math.sin((i / 180) * 12 * Math.PI),
          (i / 180) * l,
        ),
    );
    return mesh(
      p,
      new T.TubeGeometry(new T.CatmullRomCurve3(pts), 180, 0.55, 6, false),
      steel,
      name,
      at,
    );
  }
  function rod(
    p: T.Object3D,
    a: T.Vector3,
    b: T.Vector3,
    r: number,
    m: T.Material,
    n: string,
  ) {
    const o = cyl(
      p,
      r,
      a.distanceTo(b),
      a.clone().lerp(b, 0.5).toArray(),
      m,
      n,
      "y",
    );
    o.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    return o;
  }
  const frame = group("fixed-frame"),
    cover = group("cover-assembly"),
    spindle = group("spindle-assembly"),
    feed = group("feed-carriage");
  const h = spec.headHeight * 1000,
    r = spec.diameter * 500,
    w = spec.headWidth * 1000;
  const mat = { alu, dark, steel, teal, orange, green, black };
  ring(frame, B.radius, 12, -B.length, 7, dark, "robot-adapter");
  ring(
    cover,
    B.radius,
    B.radius - 2,
    -B.length + 7,
    B.length - 67,
    alu,
    "housing",
  );
  const portStart = T.MathUtils.degToRad(115),
    portEnd = T.MathUtils.degToRad(425);
  const frontShell = new T.Shape();
  frontShell.absarc(0, 0, B.radius, portStart, portEnd, false);
  frontShell.lineTo(
    (B.radius - 2) * Math.cos(portEnd),
    (B.radius - 2) * Math.sin(portEnd),
  );
  frontShell.absarc(0, 0, B.radius - 2, portEnd, portStart, true);
  frontShell.closePath();
  mesh(
    cover,
    new T.ExtrudeGeometry(frontShell, {
      depth: 38,
      bevelEnabled: false,
      curveSegments: 48,
    }),
    alu,
    "housing-optical-port",
    [0, 0, -60],
  );
  const grip = makeRevisionGrip(frame, feed, spec, id, mat);
  const { shoes } = grip;
  const headDrive = makeRevisionHeadDrive({
    frame,
    spindle,
    spec,
    head,
    improved,
    mat,
  });
  const { holder, driver, bit, socket } = headDrive;
  let axialSpring: T.Mesh | undefined;
  let damperRod: T.Mesh | undefined;
  const damper = group("damper-assembly", frame);
  if (compliant || damped) {
    ring(frame, 16, 6, -203, 4, green, "axial-load-cell");
    ring(frame, 16, 6, -199, 4, dark, "axial-fixed-seat");
    axialSpring = spring(frame, 8, 22.9, [0, 0, -194.45], "axial-spring");
    ring(spindle, 24, 6, -171, 5, alu, "axial-moving-seat");
    for (const x of [-29, 29]) {
      cyl(frame, 1.6, 43, [x, 0, -181.5], steel, "axial-guide");
      const bush = ring(
        spindle,
        3,
        1.65,
        -177,
        10,
        orange,
        "axial-guide-bushing",
      );
      bush.position.x = x;
      boredBox(
        spindle,
        [12, 8, 5],
        [Math.sign(x) * 25, 0, -168.5],
        [[Math.sign(x) * 4, 0, 1.65]],
        alu,
        "axial-seat-guide-link",
      );
      const rest = ring(frame, 4, 1.65, -166, 2, dark, "axial-rest-stop");
      rest.position.x = x;
      const stop = ring(frame, 4, 1.65, -185, 2, orange, "axial-hard-stop");
      stop.position.x = x;
    }
    box(frame, [5, 6, 14], [34, -10, -184], green, "axial-displacement-sensor");
    box(spindle, [2, 4, 4], [30, -10, -171], steel, "sensor-target");
    box(frame, [24, 6, 5], [25, -10, -200.5], alu, "sensor-frame-mount");
    box(frame, [4, 6, 14], [34, -10, -191], alu, "sensor-frame-post");
    box(spindle, [10, 4, 3], [26, -10, -171], alu, "sensor-target-arm");
  } else {
    for (const x of [-12, 12])
      cyl(frame, 2.5, 37, [x, 0, -184.5], alu, "rigid-spindle-mount");
  }
  if (damped) {
    const barrel = ring(damper, 5, 2, -201, 20, teal, "axial-damper-cylinder");
    barrel.position.x = 42;
    const cap = ring(damper, 5, 1.85, -181, 2, dark, "damper-rod-guide");
    cap.position.x = 42;
    damperRod = cyl(damper, 1.8, 30, [42, 0, -186], steel, "axial-damper-rod");
    boredBox(
      frame,
      [32, 8, 5],
      [29, 0, -200.5],
      [[13, 0, 2]],
      alu,
      "damper-frame-mount",
    );
    boredBox(
      spindle,
      [24, 6, 4],
      [33, 0, -169],
      [[-4, 0, 1.65]],
      alu,
      "damper-link",
    );
    cyl(spindle, 1.95, 2, [42, 0, -198], orange, "damper-piston");
  }
  const cameraModule = group("vision-module");
  const sight = group("optical-path", cameraModule);
  if (hasFeature(id, "drive")) {
    const camera = box(
      cameraModule,
      [11, 13, 12],
      [0, 80, -38],
      teal,
      "camera",
    );
    camera.lookAt(new T.Vector3(0, 0, -h));
    rod(
      cameraModule,
      new T.Vector3(0, 82, -203),
      new T.Vector3(0, 82, -38),
      2,
      alu,
      "camera-bracket",
    );
    const lens = cyl(
      cameraModule,
      4,
      4,
      [0, 72, -32],
      black,
      "camera-lens",
      "y",
    );
    lens.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      new T.Vector3(0, -72, 32 - h).normalize(),
    );
    box(cameraModule, [8, 24, 5], [0, 74, -205.5], alu, "camera-adapter-mount");
    const light = ring(
      cameraModule,
      6,
      3.8,
      0,
      1.5,
      green,
      "diffuse-ring-light",
    );
    light.position.copy(lens.position);
    light.quaternion.setFromUnitVectors(
      new T.Vector3(0, 0, 1),
      new T.Vector3(0, -72, 32 - h).normalize(),
    );
    const pts = [new T.Vector3(0, 72, -32), new T.Vector3(0, 0, -h)];
    const line = new T.Line(
      new T.BufferGeometry().setFromPoints(pts),
      new T.LineDashedMaterial({ color: "#288c88", dashSize: 2, gapSize: 1 }),
    );
    line.computeLineDistances();
    sight.add(line);
  }
  // Bolt uses a genuine recessed top, not a cross drawn on a solid head.
  const bolt = group("held-bolt");
  bolt.matrixAutoUpdate = false;
  const headShape = new T.Shape();
  if (head === "hex") {
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3,
        rr = w / Math.sqrt(3);
      if (k) headShape.lineTo(rr * Math.cos(a), rr * Math.sin(a));
      else headShape.moveTo(rr * Math.cos(a), rr * Math.sin(a));
    }
    headShape.closePath();
  } else headShape.absarc(0, 0, w / 2, 0, Math.PI * 2, false);
  const recessDepth = 1.6;
  if (head !== "hex") {
    const a = Math.min(w * 0.27, 3.8) + 0.18,
      b = Math.max(0.65, r * 0.18) / 2 + 0.13;
    const points =
      head === "slotted"
        ? [
            [a, b],
            [a, -b],
            [-a, -b],
            [-a, b],
          ]
        : [
            [a, b],
            [a, -b],
            [b, -b],
            [b, -a],
            [-b, -a],
            [-b, -b],
            [-a, -b],
            [-a, b],
            [-b, b],
            [-b, a],
            [b, a],
            [b, b],
          ];
    const hole = new T.Path();
    points.forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
    hole.closePath();
    headShape.holes.push(hole);
    cyl(
      bolt,
      w / 2,
      h - recessDepth,
      [0, 0, -(h - recessDepth) / 2],
      gold,
      "head-recess-floor",
    );
  }
  mesh(
    bolt,
    new T.ExtrudeGeometry(headShape, {
      depth: head === "hex" ? h : recessDepth,
      bevelEnabled: false,
    }),
    gold,
    head === "hex" ? "hex-bolt-head" : "head-recess",
    [0, 0, -h],
  );
  cyl(
    bolt,
    r,
    spec.length * 1000,
    [0, 0, spec.length * 500],
    gold,
    "bolt-shank",
  );
  const helix = Array.from({ length: 350 }, (_, i) => {
    const z = (i / 349) * spec.length * 1000,
      a = (z / (spec.pitch * 1000)) * 2 * Math.PI;
    return new T.Vector3((r + 0.08) * Math.cos(a), (r + 0.08) * Math.sin(a), z);
  });
  bolt.add(
    new T.Line(
      new T.BufferGeometry().setFromPoints(helix),
      new T.LineBasicMaterial({ color: "#7d5d26" }),
    ),
  );

  // Each exploded module stays a connected subassembly with its own fasteners and bearings.
  const modules = [
    {
      object: cover,
      offset: new T.Vector3(-115, -65, 0),
      label: "분리형 외장",
    },
    {
      object: frame,
      offset: new T.Vector3(0, 0, -30),
      label: "가이드·고정 프레임",
    },
    {
      object: spindle,
      offset: new T.Vector3(-35, 0, -15),
      label: "스핀들·축방향 순응부",
    },
    {
      object: feed,
      offset: new T.Vector3(60, 0, 28),
      label: gravity ? "ㄴ자 집게·회전 슈" : "파지 집게·회전 구동축",
    },
    {
      object: cameraModule,
      offset: new T.Vector3(65, -35, -15),
      label: "카메라·조명",
    },
    {
      object: holder,
      offset: new T.Vector3(28, 0, 32),
      label: "회전 머리 홀더",
    },
    {
      object: head === "hex" ? socket : bit,
      offset: new T.Vector3(-20, 0, 28),
      label: "교환 공구",
    },
    { object: bolt, offset: new T.Vector3(0, 0, 48), label: "대상 볼트" },
  ];
  const labels = [
    { text: "헤드 홀더 / 교환 공구", object: holder },
    { text: gravity ? "ㄴ자 회전 슈" : "파지 접촉부", object: shoes[0].pivot },
    { text: "측면 체결 모터", object: root.getObjectByName("spindle-motor")! },
    ...(compliant
      ? [
          {
            text: "축력·변위 감지",
            object: root.getObjectByName("axial-load-cell")!,
          },
        ]
      : []),
    ...(damped ? [{ text: "축방향 댐퍼", object: damper }] : []),
    ...(hasFeature(id, "drive")
      ? [{ text: "홈 관측 카메라", object: cameraModule }]
      : []),
  ];
  const sectionPlane = new T.Plane();
  const contours = new T.LineSegments(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({ color: "#c16a20", depthTest: false }),
  );
  contours.name = "section-contours";
  contours.renderOrder = 5;
  root.add(contours);
  function sectionLines(cut: number) {
    const lines: number[] = [],
      inverse = root.matrixWorld.clone().invert();
    root.traverse((o) => {
      if (!(o instanceof T.Mesh) || !o.visible) return;
      const positions = o.geometry.getAttribute("position"),
        index = o.geometry.index;
      if (!positions) return;
      const matrix = inverse.clone().multiply(o.matrixWorld),
        count = index ? index.count : positions.count;
      for (let i = 0; i < count; i += 3) {
        const v = [0, 1, 2].map((j) =>
          new T.Vector3()
            .fromBufferAttribute(positions, index ? index.getX(i + j) : i + j)
            .applyMatrix4(matrix),
        );
        const hits: T.Vector3[] = [];
        for (let j = 0; j < 3; j++) {
          const a = v[j],
            b = v[(j + 1) % 3],
            da = a.y - cut,
            db = b.y - cut;
          if ((da < 0 && db >= 0) || (db < 0 && da >= 0))
            hits.push(a.clone().lerp(b, da / (da - db)));
        }
        if (hits.length === 2)
          lines.push(...hits[0].toArray(), ...hits[1].toArray());
      }
    });
    contours.geometry.dispose();
    contours.geometry = new T.BufferGeometry();
    contours.geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(lines, 3),
    );
  }
  function update(
    time: number,
    mode: InspectionMode = "assembled",
    amount = 0.5,
    boltMatrix?: T.Matrix4,
  ) {
    const p = revisionPose(time, spec, id, head),
      exp = mode === "exploded" ? T.MathUtils.clamp(amount, 0, 1) : 0;
    for (const m of modules) m.object.position.set(0, 0, 0);
    grip.update(p);
    spindle.position.z = -p.compression;
    if (axialSpring) axialSpring.scale.z = (22.9 - p.compression) / 22.9;
    if (damperRod) damperRod.position.z = -186 - p.compression;
    headDrive.update(p);
    const bp = revisionPose(Math.min(time, 63), spec, id, head);
    bolt.matrix.copy(boltMatrix ?? revisionBoltMatrix(bp));
    bolt.matrix.premultiply(new T.Matrix4().makeTranslation(0, 0, 48 * exp));
    for (const m of modules)
      if (m.object !== bolt) m.object.position.addScaledVector(m.offset, exp);
    sight.visible = p.vision && mode === "assembled";
    root.updateMatrixWorld(true);
    const cut = (T.MathUtils.clamp(amount, 0, 1) - 0.5) * 2 * (B.radius + 20);
    sectionPlane
      .set(new T.Vector3(0, -1, 0), cut)
      .applyMatrix4(root.matrixWorld);
    for (const m of materials) {
      m.clippingPlanes = mode === "section" ? [sectionPlane] : [];
      m.clipShadows = true;
    }
    contours.visible = mode === "section";
    if (mode === "section") sectionLines(cut);
    return p;
  }
  update(0);
  return { root, update, labels, modules, head, bolt };
}

export function makeRevisionWorkpiece(spec: BoltSpec) {
  const group = new T.Group();
  const shape = new T.Shape();
  shape.absarc(0, 0, 0.045, 0, Math.PI * 2, false);
  const hole = new T.Path();
  // shortcut: nominal bore and thread line explain seating; manufacturing needs the actual thread profile.
  const radius = spec.diameter / 2 + 0.00005;
  hole.absarc(0, 0, radius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const plate = new T.Mesh(
    new T.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: false }),
    new T.MeshStandardMaterial({
      color: "#b0bec6",
      metalness: 0.65,
      roughness: 0.5,
    }),
  );
  plate.name = "workpiece-plate";
  group.add(plate);
  const points = Array.from({ length: 241 }, (_, i) => {
    const z = (i / 240) * 0.008,
      a = (z / spec.pitch) * 2 * Math.PI;
    return new T.Vector3(radius * Math.cos(a), radius * Math.sin(a), z);
  });
  group.add(
    new T.Line(
      new T.BufferGeometry().setFromPoints(points),
      new T.LineBasicMaterial({ color: "#607681" }),
    ),
  );
  return group;
}
