import * as T from "three";
import { ramp, type BoltSpec } from "./timeline";
import {
  hasFeature,
  type RevisionId,
  type HeadType,
  type InspectionMode,
} from "./revision-config";
import {
  HEAD_ANGLE,
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
  ring(frame, 39, 12, -148, 7, dark, "robot-adapter");
  ring(cover, 39, 37, -141, 119, alu, "housing");
  // Front cut-outs are real gaps between beams, giving the optical path and jaws a clear exit.
  for (const x of [-32, 32]) {
    box(frame, [8, 16, 7], [x, 0, -19], alu, "front-bearing-support");
    cyl(frame, 2.5, 112, [x, 0, -82], steel, "feed-guide");
    box(frame, [8, 12, 14], [x, 0, -126], teal, "feed-motor");
    cyl(frame, 1.6, 100, [x, 8, -70], steel, "feed-screw");
  }
  for (const y of [-25, 25])
    box(frame, [50, 6, 6], [0, y, -138], alu, "rear-cross-member");
  ring(frame, 17.5, 15.3, -23, 7, dark, "nose-bearing");
  ring(frame, 18.5, 15.3, -26, 3, alu, "nose-shell");
  // Offset motor leaves the bit axis and camera sight line open.
  cyl(spindle, 9.5, 43, [-23, -10, -86], teal, "spindle-motor");
  cyl(spindle, 9.5, 13, [-23, -10, -58], dark, "spindle-gearhead");
  box(spindle, [34, 6, 6], [-11.5, -10, -52], alu, "drive-bearing-bridge");
  const pulley = group("belt-transmission", spindle);
  ring(pulley, 8, 4, -52, 5, orange, "spindle-pulley");
  const motorPulley = ring(pulley, 6, 2, -52, 5, orange, "motor-pulley");
  motorPulley.position.x = -23;
  motorPulley.position.y = -10;
  for (const y of [-7, 7])
    rod(
      pulley,
      new T.Vector3(0, y, -49),
      new T.Vector3(-23, -10 + y * 0.75, -49),
      0.8,
      black,
      "timing-belt",
    );
  const driver = group("driver-rotor", spindle);
  ring(driver, 5.5, 3.5, -96, 62, steel, "hollow-splined-shaft");
  ring(spindle, 9, 5.7, -76, 5, orange, "rear-spindle-bearing");
  ring(spindle, 9, 5.7, -42, 6, orange, "front-spindle-bearing");
  box(frame, [12, 6, 12], [10, -5, -77], dark, "bearing-guide-key");
  let axialSpring: T.Mesh | undefined;
  if (compliant || damped) {
    ring(frame, 12, 6, -129, 4, dark, "axial-fixed-seat");
    axialSpring = spring(frame, 8, 24, [0, 0, -125], "axial-spring");
    ring(spindle, 12, 6, -101, 4, alu, "axial-moving-seat");
    for (const x of [-12, 12])
      cyl(frame, 1.4, 34, [x, 0, -115], steel, "axial-guide");
    box(frame, [4, 6, 6], [14, 0, -98], orange, "axial-hard-stop");
  }
  if (compliant) {
    ring(frame, 13, 6, -133, 3, green, "axial-load-cell");
    box(frame, [5, 6, 14], [17, 0, -117], green, "axial-displacement-sensor");
    box(spindle, [2, 4, 4], [14, 0, -103], steel, "sensor-target");
  }
  const damper = group("damper-assembly", frame);
  let damperRod: T.Mesh | undefined;
  if (damped) {
    cyl(damper, 5, 24, [23, 0, -119], teal, "axial-damper-cylinder");
    damperRod = cyl(damper, 1.8, 19, [23, 0, -101], steel, "axial-damper-rod");
    box(spindle, [13, 6, 5], [18, 0, -94], alu, "damper-link");
  }
  const holder = group("head-holder", spindle);
  ring(holder, 15, 12, -20, 5, orange, "holder-rotor-ring");
  ring(spindle, 16.8, 15.2, -20, 5, steel, "holder-bearing");
  ring(holder, 14.5, 12, -25, 3, steel, "holder-spring-seat");
  const brake = box(frame, [5, 7, 7], [17, 0, -22], green, "holder-brake");
  const h = spec.headHeight * 1000,
    r = spec.diameter * 500,
    w = spec.headWidth * 1000;
  const retainers: T.Group[] = [];
  for (let k = 0; k < 3; k++) {
    const sector = group(`retainer-sector-${k}`, holder);
    sector.rotation.z = (k * 2 * Math.PI) / 3;
    const jaw = group(`head-retainer-${k}`, sector);
    const offset = head === "hex" ? 5 : 0;
    box(jaw, [2.2, 3.4, 14], [offset, 0, -8], dark, "retainer-flexure");
    if (offset)
      box(jaw, [5, 3.4, 1.2], [2.5, 0, -0.65], dark, "retainer-radial-bridge");
    box(
      jaw,
      [2.5, 3.4, head === "hex" ? 1.2 : Math.max(2, h - 1)],
      [0, 0, head === "hex" ? -0.65 : -h / 2],
      orange,
      "head-contact",
    );
    if (improved)
      box(
        jaw,
        [Math.max(1, w / 2 - r), 3.4, 1],
        [-(w / 2 - r) / 2, 0, 0.5],
        orange,
        "under-head-retainer",
      );
    retainers.push(jaw);
  }
  const socket = group("socket-cartridge", driver);
  if (head === "hex") {
    const s = new T.Shape();
    s.absarc(0, 0, w / Math.sqrt(3) + 2.2, 0, Math.PI * 2, false);
    const hole = new T.Path();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 - (k * Math.PI) / 3,
        rr = w / Math.sqrt(3) + 0.16;
      if (k === 0) hole.moveTo(rr * Math.cos(a), rr * Math.sin(a));
      else hole.lineTo(rr * Math.cos(a), rr * Math.sin(a));
    }
    hole.closePath();
    s.holes.push(hole);
    mesh(
      socket,
      new T.ExtrudeGeometry(s, { depth: h - 1.6, bevelEnabled: false }),
      improved ? orange : steel,
      "hex-form-socket",
      [0, 0, -h],
    );
    ring(socket, w / Math.sqrt(3) + 2.2, 4, -h - 3, 3, steel, "socket-back");
    ring(socket, 5.5, 3.5, -35, 35 - h - 3, steel, "socket-shank");
  }
  const bit = group("bit-cartridge", driver);
  if (head !== "hex") {
    cyl(bit, 2.2, 33, [0, 0, -h - 16.5], steel, "bit-shaft");
    const tipLength = 1.4,
      arm = Math.min(w * 0.27, 3.8),
      thick = Math.max(0.65, r * 0.18);
    box(
      bit,
      [arm * 2, thick, tipLength],
      [0, 0, -h + tipLength / 2],
      steel,
      head === "slotted" ? "slotted-bit" : "phillips-bit",
    );
    if (head === "phillips")
      box(
        bit,
        [thick, arm * 2, tipLength],
        [0, 0, -h + tipLength / 2],
        steel,
        "phillips-cross-bit",
      );
    spring(bit, 4, 12, [0, 0, -69], "bit-seating-spring");
    ring(bit, 6, 2.5, -72, 3, green, "bit-axis-load-cell");
    box(spindle, [3, 5, 16], [8, 0, -69], green, "relative-bit-depth-sensor");
  }
  const cameraModule = group("vision-module");
  const sight = group("optical-path", cameraModule);
  if (hasFeature(id, "drive")) {
    const camera = box(
      cameraModule,
      [11, 13, 12],
      [0, 20, -38],
      teal,
      "camera",
    );
    camera.lookAt(new T.Vector3(0, 0, -h));
    rod(
      cameraModule,
      new T.Vector3(0, 26, -44),
      new T.Vector3(0, 37, -55),
      2,
      alu,
      "camera-bracket",
    );
    const lens = cyl(
      cameraModule,
      4,
      4,
      [0, 14, -32],
      black,
      "camera-lens",
      "y",
    );
    lens.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      new T.Vector3(0, -14, 32 - h).normalize(),
    );
    ring(cameraModule, 16, 14, -10, 1.5, green, "diffuse-ring-light");
    const pts = [new T.Vector3(0, 14, -32), new T.Vector3(0, 0, -h)];
    const line = new T.Line(
      new T.BufferGeometry().setFromPoints(pts),
      new T.LineDashedMaterial({ color: "#288c88", dashSize: 2, gapSize: 1 }),
    );
    line.computeLineDistances();
    sight.add(line);
  }
  const shoes: { slide: T.Group; pivot: T.Group; pin: T.Mesh; side: number }[] =
    [];
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "left" : "right",
      slide = group(`jaw-slide-${suffix}`, feed);
    box(slide, [7, 10, 6], [0, 0, -29], dark, "grip-slider");
    box(slide, [9, 10, 9], [0, -10, -29], teal, "grip-actuator");
    // A bent blade with a true perpendicular foot, leaving the central drive axis free.
    box(
      slide,
      [capture ? 2.8 : 1.2, 5, 31],
      [0, 0, -12.5],
      steel,
      gravity ? "L-finger-stem" : "finger-stem",
    );
    box(
      slide,
      [10.5, 5, 2.8],
      [-side * 4.6, 0, 2],
      steel,
      gravity ? "L-finger-foot" : "finger-foot",
    );
    const pivot = group(
      capture ? `rotating-shoe-${suffix}` : `contact-pad-${suffix}`,
      slide,
    );
    pivot.position.set(-side * 9.5, 0, B.grasp);
    cyl(slide, 2.7, 3.5, [-side * 7, 0, B.grasp], orange, "pivot-bearing", "x");
    if (capture) {
      box(pivot, [2, 3, 3], [0, 0, 0], teal, "shoe-centre");
      for (const a of [-28, 28]) {
        const angle = (side < 0 ? Math.PI : 0) + T.MathUtils.degToRad(a);
        const pad = box(
          pivot,
          [1.1, 2.8, 4],
          [
            (r + 0.55) * Math.cos(angle) - side * (r + 2),
            (r + 0.55) * Math.sin(angle),
            0,
          ],
          teal,
          "U-contact-face",
        );
        pad.rotation.z = angle;
      }
      // The lip travels with the captured bolt, supporting its underside through righting.
      box(
        pivot,
        [1.8, 4.6, 0.8],
        [-side * 0.8, 0, -2.05],
        teal,
        "shoe-head-lip",
      );
    } else cyl(pivot, 1.5, 4, [0, 0, 0], black, "flat-contact-pad", "x");
    const pin = cyl(
      slide,
      0.8,
      5,
      [-side * 5, 0, B.grasp],
      green,
      `pivot-lock-${suffix}`,
      "x",
    );
    shoes.push({ slide, pivot, pin, side });
    if (capture) {
      const cam = box(
        frame,
        [3, 8, 24],
        [side * 26, 0, -25],
        orange,
        `reset-cam-${suffix}`,
      );
      cam.rotation.y = side * 0.35;
      box(frame, [4, 5, 5], [side * 26, -7, -34], green, "shoe-home-sensor");
      box(pivot, [2, 2, 5], [side * 2.3, 0, 1.5], steel, "cam-follower");
    }
  }
  const correction = group("end-alignment-guide", feed);
  if (gravity) {
    for (const side of [-1, 1]) {
      const face = box(
        correction,
        [3, 4, 9],
        [side * (r + 4), 4, 7],
        orange,
        "vertical-correction-face",
      );
      face.rotation.x = -0.18;
      box(
        correction,
        [3, 9, 3],
        [side * (r + 4), 8, 2],
        steel,
        "vertical-hard-stop",
      );
    }
    box(correction, [10, 6, 7], [0, 12, -3], teal, "alignment-guide-actuator");
    box(
      correction,
      [2 * r + 11, 4, 3],
      [0, 8, 2],
      steel,
      "alignment-guide-crossbar",
    );
  }
  const thumb = group("thumb-assembly", feed);
  let thumb1: T.Mesh | undefined, thumb2: T.Mesh | undefined;
  if (!gravity) {
    box(thumb, [8, 8, 12], [0, -24, -24], teal, "thumb-actuator");
    thumb1 = cyl(thumb, 2.3, 20, [0, 0, 0], teal, "thumb-link", "y");
    thumb2 = cyl(thumb, 1.8, 20, [0, 0, 0], teal, "thumb-distal", "y");
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
      label: gravity ? "ㄴ자 집게·회전 슈" : "파지 집게·보조 엄지",
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
  ) {
    const p = revisionPose(time, spec, id, head),
      exp = mode === "exploded" ? T.MathUtils.clamp(amount, 0, 1) : 0;
    for (const m of modules) m.object.position.set(0, 0, 0);
    feed.position.z = p.carriageZ;
    correction.position.y =
      10 * (1 - ramp(time, 12, 14)) + 10 * ramp(time, 15, 16);
    spindle.position.z = -p.compression;
    if (axialSpring) axialSpring.scale.z = (24 - p.compression) / 24;
    if (damperRod) damperRod.position.z = -101 - p.compression;
    driver.rotation.z = p.bitAngle;
    holder.rotation.z = HEAD_ANGLE + p.spin;
    holder.position.z = -6 * ramp(time, 58, 59);
    const engaged = p.clamp * (1 - p.retainOpen);
    retainers.forEach((j) => (j.position.x = w / 2 + 1.2 + (1 - engaged) * 6));
    brake.position.x = 17 + (p.brake ? 0 : 2.5);
    bit.position.z = -18 * (1 - p.bitSeat);
    socket.position.z = -10 * (1 - p.bitSeat);
    for (const s of shoes) {
      s.slide.position.x = s.side * (p.gap + 9.5);
      s.pivot.rotation.x = p.shoeAngle;
      s.pin.position.x = -s.side * (p.lock ? 5 : 2.5);
    }
    if (thumb1 && thumb2) {
      const active = ramp(time, 7, 8) * (1 - ramp(time, 14, 16));
      const base = new T.Vector3(0, -24, -18),
        end = new T.Vector3(0, 0, spec.length * 1000 - 3).applyMatrix4(
          revisionBoltMatrix({ ...p, spin: 0, feed: 1, compression: 0 }),
        );
      end.z += 4;
      end.lerp(new T.Vector3(0, -24, -14), 1 - active);
      const elbow = base
        .clone()
        .lerp(end, 0.5)
        .add(new T.Vector3(0, -9, 0));
      for (const [o, a, b] of [
        [thumb1, base, elbow],
        [thumb2, elbow, end],
      ] as const) {
        o.position.copy(a).lerp(b, 0.5);
        o.scale.y = a.distanceTo(b) / 20;
        o.quaternion.setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          b.clone().sub(a).normalize(),
        );
      }
    }
    const bp = revisionPose(Math.min(time, 63), spec, id, head);
    bolt.matrix.copy(revisionBoltMatrix(bp));
    if (time > 63)
      bolt.matrix.premultiply(
        new T.Matrix4().makeTranslation(0, 0, 50 * ramp(time, 63, 67)),
      );
    bolt.matrix.premultiply(new T.Matrix4().makeTranslation(0, 0, 48 * exp));
    for (const m of modules)
      if (m.object !== bolt) m.object.position.addScaledVector(m.offset, exp);
    sight.visible = p.vision && mode === "assembled";
    root.updateMatrixWorld(true);
    const cut = (T.MathUtils.clamp(amount, 0, 1) - 0.5) * 72;
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
  return { root, update, labels, modules, head };
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
