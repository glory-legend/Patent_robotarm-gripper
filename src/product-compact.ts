import * as T from "three";
import type { HeadType, InspectionMode } from "./revision-config";

/** Millimetre packaging concept for M8 preliminary threading; no selected actuator or torque rating. */
export function makeCompactProduct(head: HeadType = "hex") {
  const root = new T.Group();
  root.name = "compact-product";
  root.scale.setScalar(0.001);
  const colors = {
    alu: "#c1cdd3",
    dark: "#354b59",
    steel: "#71828c",
    teal: "#287d81",
    orange: "#c3732e",
    green: "#399482",
    black: "#182c39",
  };
  const materials = Object.fromEntries(
    Object.entries(colors).map(([k, color]) => [
      k,
      new T.MeshStandardMaterial({
        color,
        metalness: k === "black" ? 0.1 : 0.65,
        roughness: 0.36,
        side: T.DoubleSide,
      }),
    ]),
  ) as Record<keyof typeof colors, T.MeshStandardMaterial>;
  type Color = keyof typeof colors;
  const parts: {
    id: string;
    label: string;
    category: "internal" | "external" | "tool" | "workpiece";
    object: T.Group;
    footprint: { min: number[]; max: number[] };
  }[] = [];
  const offsets = new Map<T.Group, T.Vector3>();
  function assembly(
    id: string,
    label: string,
    category: (typeof parts)[number]["category"],
    offset: number[],
  ) {
    const g = new T.Group();
    g.name = id;
    root.add(g);
    parts.push({
      id,
      label,
      category,
      object: g,
      footprint: { min: [], max: [] },
    });
    offsets.set(g, new T.Vector3().fromArray(offset));
    return g;
  }
  function mesh(
    parent: T.Object3D,
    geometry: T.BufferGeometry,
    at: number[],
    color: Color,
    name: string,
  ) {
    const o = new T.Mesh(geometry, materials[color]);
    o.name = name;
    o.position.fromArray(at);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function box(
    parent: T.Object3D,
    size: number[],
    at: number[],
    color: Color,
    name: string,
  ) {
    return mesh(
      parent,
      new T.BoxGeometry(size[0], size[1], size[2]),
      at,
      color,
      name,
    );
  }
  function cylinder(
    parent: T.Object3D,
    radius: number,
    depth: number,
    at: number[],
    color: Color,
    name: string,
    axis = "z",
  ) {
    const o = mesh(
      parent,
      new T.CylinderGeometry(radius, radius, depth, 40),
      at,
      color,
      name,
    );
    if (axis === "z") o.rotation.x = Math.PI / 2;
    if (axis === "x") o.rotation.z = Math.PI / 2;
    return o;
  }
  function circle(radius: number, x = 0, y = 0) {
    const p = new T.Path();
    p.absarc(x, y, radius, 0, Math.PI * 2, true);
    return p;
  }
  function plate(
    parent: T.Object3D,
    outer: number,
    depth: number,
    at: number[],
    holes: number[][],
    color: Color,
    name: string,
  ) {
    const shape = new T.Shape();
    shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    for (const [x, y, radius] of holes) shape.holes.push(circle(radius, x, y));
    return mesh(
      parent,
      new T.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        curveSegments: 32,
      }),
      at,
      color,
      name,
    );
  }
  function tube(
    parent: T.Object3D,
    outer: number,
    inner: number,
    depth: number,
    at: number[],
    color: Color,
    name: string,
    axis = "z",
  ) {
    const o = plate(parent, outer, depth, at, [[0, 0, inner]], color, name);
    if (axis === "x") o.rotation.y = Math.PI / 2;
    return o;
  }
  function wire(
    parent: T.Object3D,
    points: T.Vector3[],
    radius: number,
    color: Color,
    name: string,
  ) {
    return mesh(
      parent,
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points),
        points.length * 2,
        radius,
        8,
        false,
      ),
      [0, 0, 0],
      color,
      name,
    );
  }
  function spring(
    parent: T.Object3D,
    radius: number,
    length: number,
    at: number[],
    name: string,
  ) {
    const points = Array.from(
      { length: 121 },
      (_, i) =>
        new T.Vector3(
          radius * Math.cos((i * Math.PI) / 10),
          radius * Math.sin((i * Math.PI) / 10),
          (length * i) / 120,
        ),
    );
    const o = wire(parent, points, 0.55, "steel", name);
    o.position.fromArray(at);
    const v = o.geometry.getAttribute("position");
    for (let i = 0; i < v.count; i++)
      v.setZ(i, T.MathUtils.clamp(v.getZ(i), 0, length));
    o.geometry.computeVertexNormals();
    return o;
  }
  function hex(radius: number) {
    const p = new T.Path();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      if (i) p.lineTo(radius * Math.cos(a), radius * Math.sin(a));
      else p.moveTo(radius * Math.cos(a), radius * Math.sin(a));
    }
    p.closePath();
    return p;
  }
  function sector(
    parent: T.Object3D,
    outer: number,
    inner: number,
    start: number,
    end: number,
    z: number,
    depth: number,
    color: Color,
    name: string,
  ) {
    const s = new T.Shape();
    s.absarc(0, 0, outer, start, end, false);
    s.absarc(0, 0, inner, end, start, true);
    s.closePath();
    return mesh(
      parent,
      new T.ExtrudeGeometry(s, {
        depth,
        bevelEnabled: false,
        curveSegments: 24,
      }),
      [0, 0, z],
      color,
      name,
    );
  }

  const cover = assembly(
    "compact-cover",
    "Ø96 원통 외장",
    "external",
    [-65, 0, 0],
  );
  tube(cover, 48, 46, 115, [0, 0, -175], "alu", "compact-housing");
  sector(
    cover,
    48,
    46,
    (-5 * Math.PI) / 12,
    (17 * Math.PI) / 12,
    -60,
    28,
    "alu",
    "housing-camera-window",
  );
  tube(cover, 48, 46, 14, [0, 0, -32], "alu", "compact-front-shell");
  const frame = assembly(
    "compact-frame",
    "고정 프레임·공통 가이드",
    "external",
    [0, 0, -24],
  );
  plate(
    frame,
    48,
    5,
    [0, 0, -180],
    [
      [0, 0, 6],
      [34, -20, 3],
    ],
    "dark",
    "compact-adapter",
  );
  plate(
    frame,
    44,
    4,
    [0, 0, -24],
    [
      [0, 0, 26],
      [-30, 0, 2.1],
      [30, 0, 2.1],
      [34, -20, 4.2],
    ],
    "dark",
    "compact-front-frame",
  );
  for (const side of [-1, 1]) {
    cylinder(
      frame,
      2,
      155,
      [side * 30, 0, -97.5],
      "steel",
      `${side < 0 ? "left" : "right"}-common-guide`,
    );
    tube(frame, 3.5, 2, 2, [side * 30, 0, -20], "dark", "guide-front-clamp");
  }
  tube(frame, 4, 3, 155, [34, -20, -175], "black", "cable-service-duct");
  cylinder(frame, 4, 45, [0, 32, -152.5], "alu", "feed-reaction-post");
  tube(frame, 5, 2.2, 60, [0, 32, -130], "teal", "common-feed-cylinder");
  tube(frame, 15, 6, 3, [0, 0, -175], "green", "compact-axial-load-cell");
  spring(frame, 9, 8, [0, 0, -172], "compact-compliance-spring");
  box(
    frame,
    [3, 6, 16],
    [-27, -12, -166],
    "green",
    "compact-displacement-sensor",
  );
  box(frame, [3, 6, 9], [-30, -12, -170.5], "alu", "displacement-sensor-mount");

  const cartridge = assembly(
    "compact-cartridge",
    "공통 순응부·동축 감속 스핀들",
    "internal",
    [0, 0, -16],
  );
  tube(cartridge, 24, 8, 6, [0, 0, -164], "alu", "compliance-moving-seat");
  for (const side of [-1, 1]) {
    tube(
      cartridge,
      4.5,
      2.15,
      12,
      [side * 30, 0, -170],
      "orange",
      "compliance-guide-bushing",
    );
    box(
      cartridge,
      [8, 6, 6],
      [side * 23.5, 0, -161],
      "alu",
      "compliance-guide-ear",
    );
  }
  box(cartridge, [8, 3, 3], [-20, -12, -160], "steel", "displacement-target");
  for (const a of [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6])
    cylinder(
      cartridge,
      2,
      18,
      [14 * Math.cos(a), 14 * Math.sin(a), -149],
      "alu",
      "motor-reaction-neck",
    );
  tube(cartridge, 18, 5.6, 35, [0, 0, -140], "teal", "coaxial-spindle-motor");
  tube(
    cartridge,
    18,
    8,
    15,
    [0, 0, -105],
    "dark",
    "coaxial-reduction-envelope",
  );
  tube(cartridge, 8, 5.6, 5, [0, 0, -105], "orange", "spindle-rear-bearing");
  tube(cartridge, 8, 5.6, 5, [0, 0, -95], "orange", "spindle-output-bearing");
  tube(cartridge, 10, 5.7, 54, [0, 0, -90], "dark", "compact-spindle-nose");
  tube(cartridge, 10, 5.6, 6, [0, 0, -36], "orange", "compact-front-bearing");
  const rotor = new T.Group();
  rotor.name = "compact-driver-rotor";
  cartridge.add(rotor);
  const shaftShape = new T.Shape();
  shaftShape.absarc(0, 0, 5.5, 0, Math.PI * 2, false);
  shaftShape.holes.push(hex(3.55));
  mesh(
    rotor,
    new T.ExtrudeGeometry(shaftShape, { depth: 86, bevelEnabled: false }),
    [0, 0, -110],
    "steel",
    "compact-keyed-output-shaft",
  );
  tube(rotor, 7, 5.5, 2, [0, 0, -30], "steel", "compact-output-retainer");

  const tool = assembly(
    "compact-head-tool",
    head === "hex" ? "교환 소켓·잠금 볼" : "교환 외주 콜릿·독립 비트",
    "tool",
    [0, 0, 25],
  );
  const quillStart = head === "hex" ? -110 : -153;
  mesh(
    tool,
    new T.ExtrudeGeometry(new T.Shape(hex(3.45).getPoints()), {
      depth: (head === "hex" ? -10 : -35) - quillStart,
      bevelEnabled: false,
    }),
    [0, 0, quillStart],
    "steel",
    "compact-tool-quill",
  );
  if (head === "hex") {
    tube(tool, 10, 3.2, 2, [0, 0, -10], "steel", "socket-back");
    for (let i = 0; i < 6; i++) {
      const face = new T.Group();
      face.rotation.z = (i * Math.PI) / 3;
      tool.add(face);
      const wall = new T.Shape();
      wall.moveTo(-3, -4.15);
      wall.lineTo(8, -4.15);
      wall.lineTo(8, 4.15);
      wall.lineTo(-3, 4.15);
      wall.closePath();
      if (i % 2 === 0) wall.holes.push(circle(1.65, -1, 0));
      const w = mesh(
        face,
        new T.ExtrudeGeometry(wall, {
          depth: 2.4,
          bevelEnabled: false,
          curveSegments: 32,
        }),
        [6.6, 0, 0],
        "orange",
        "socket-wall-with-ball-bore",
      );
      w.rotation.y = Math.PI / 2;
      if (i % 2 === 0)
        mesh(
          face,
          new T.SphereGeometry(1.6, 24, 16),
          [7.8, 0, 1],
          "steel",
          "positive-detent-ball",
        );
    }
    const lockShape = new T.Shape();
    lockShape.absarc(0, 0, 11.5, 0, Math.PI * 2, false);
    lockShape.holes.push(hex(18.8 / Math.sqrt(3)));
    mesh(
      tool,
      new T.ExtrudeGeometry(lockShape, { depth: 5, bevelEnabled: false }),
      [0, 0, -1],
      "dark",
      "detent-lock-sleeve",
    );

    tube(tool, 11.5, 9.8, 1.5, [0, 0, -8], "steel", "detent-spring-rear-seat");
    spring(tool, 10.7, 5.5, [0, 0, -6.5], "detent-return-spring");
  } else {
    tube(cartridge, 18, 9.5, 3, [0, 0, -73], "alu", "holder-reaction-flange");
    tube(cartridge, 18, 16, 16, [0, 0, -70], "dark", "compact-holder-housing");
    for (const z of [-68, -60])
      tube(
        cartridge,
        16,
        12.1,
        4,
        [0, 0, z],
        "orange",
        "compact-holder-bearing",
      );
    tube(tool, 12, 10.2, 45, [0, 0, -68], "steel", "compact-holder-journal");
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      cylinder(
        tool,
        1,
        13,
        [11 * Math.cos(a), 11 * Math.sin(a), -16.5],
        "steel",
        "holder-optical-window-post",
      );
      sector(
        tool,
        8.7,
        6.7,
        a + 0.08,
        a + (2 * Math.PI) / 3 - 0.08,
        -8,
        9,
        "orange",
        "split-holder-finger",
      );
      sector(
        tool,
        8.7,
        5.6,
        a + 0.08,
        a + (2 * Math.PI) / 3 - 0.08,
        0,
        1,
        "orange",
        "split-holder-retention-lip",
      );
    }
    tube(tool, 12, 6.7, 2, [0, 0, -10], "steel", "split-holder-rear-bridge");
    tube(tool, 11, 8.7, 4, [0, 0, -6], "dark", "split-holder-release-sleeve");
    cylinder(tool, 2.2, 22, [0, 0, -24], "steel", "independent-bit-shank");
    box(tool, [6, 0.8, 1.8], [0, 0, -12.1], "steel", "compact-bit-tip");
    if (head === "phillips")
      box(tool, [0.8, 6, 1.8], [0, 0, -12.1], "steel", "compact-cross-bit-tip");
    tube(tool, 6, 3.2, 3, [0, 0, -153], "steel", "bit-feed-thrust-inner");
    tube(cartridge, 8, 6, 3, [0, 0, -153], "orange", "bit-feed-thrust-bearing");
    tube(cartridge, 9, 8, 3, [0, 0, -153], "alu", "bit-feed-thrust-yoke");
    box(cartridge, [17, 4, 3], [16.5, 0, -151.5], "alu", "bit-feed-yoke-arm");
    tube(cartridge, 3, 1.1, 20, [25, 0, -145], "teal", "bit-feed-cylinder");
    box(
      cartridge,
      [3, 5, 13],
      [21.5, 4.6, -151.5],
      "alu",
      "bit-feed-cylinder-mount",
    );
    cylinder(cartridge, 1, 22, [25, 0, -143], "steel", "bit-feed-piston");
    box(cartridge, [2, 4, 8], [29, -5, -143], "green", "bit-engagement-sensor");
    box(cartridge, [7, 3, 3], [25.5, -3.5, -146], "alu", "bit-sensor-bracket");
  }

  const grip = assembly(
    "compact-grip",
    "단일 실린더·대향 랙·ㄴ자 회전 슈",
    "external",
    [55, 0, 10],
  );
  plate(
    grip,
    38,
    4,
    [0, 0, -48],
    [
      [0, 0, 22],
      [-30, 0, 2.15],
      [30, 0, 2.15],
      [0, -25, 2.1],
    ],
    "alu",
    "compact-feed-carriage",
  );
  cylinder(grip, 2, 50, [0, 32, -73], "steel", "common-feed-piston");
  for (const side of [-1, 1])
    tube(
      grip,
      4.5,
      2.15,
      14,
      [side * 30, 0, -58],
      "orange",
      `${side < 0 ? "left" : "right"}-feed-bushing`,
    );
  for (const y of [-13.5, 13.5]) {
    cylinder(grip, 1.2, 70, [0, y, -40], "steel", "opposed-slide-guide", "x");
    for (const side of [-1, 1])
      box(
        grip,
        [5, 5, 8],
        [side * 35, y, -40],
        "alu",
        "radial-guide-end-mount",
      );
  }
  tube(grip, 5, 1.4, 36, [-18, -25, -62], "teal", "single-grip-cylinder", "x");
  cylinder(
    grip,
    1.2,
    22,
    [-18, -25, -62],
    "steel",
    "grip-cylinder-piston",
    "x",
  );
  for (const x of [-14, 14])
    box(
      grip,
      [4, 5, 13],
      [x, -25, -50.5],
      "alu",
      "grip-actuator-reaction-mount",
    );
  for (const x of [-16, 12])
    tube(
      grip,
      8,
      5,
      4,
      [x, -25, -62],
      "alu",
      "grip-cylinder-mount-flange",
      "x",
    );
  box(grip, [4, 7, 22], [-27, -27.5, -51], "steel", "grip-piston-rack-clevis");
  tube(grip, 4, 2.1, 4, [0, -25, -48], "orange", "rack-pinion-bearing");
  cylinder(grip, 2, 12, [0, -25, -44], "steel", "rack-pinion-shaft");
  const gear = new T.Shape();
  for (let i = 0; i < 48; i++) {
    const a = (i * Math.PI) / 24,
      r = i % 4 === 1 || i % 4 === 2 ? 5.5 : 4.5;
    if (i) gear.lineTo(r * Math.cos(a), r * Math.sin(a));
    else gear.moveTo(r, 0);
  }
  gear.closePath();
  mesh(
    grip,
    new T.ExtrudeGeometry(gear, { depth: 3, bevelEnabled: false }),
    [0, -25, -42],
    "orange",
    "opposed-rack-pinion",
  );
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right",
      y = side < 0 ? -31.5 : -18.5;
    box(grip, [34, 2, 3], [side * 10, y, -40.5], "steel", `${prefix}-rack`);
    for (let i = -6; i <= 6; i++)
      box(
        grip,
        [0.5, 0.8, 3],
        [side * 10 + i * 2.4, y - Math.sign(y + 25) * 1.4, -40.5],
        "steel",
        `${prefix}-rack-tooth`,
      );
    box(
      grip,
      [5, Math.abs(y + 16) + 2, 4],
      [side * 20, (y - 16) / 2, -40.5],
      "alu",
      `${prefix}-rack-link`,
    );
    box(grip, [7, 22, 5], [side * 20, 0, -40], "alu", "radial-slider-bridge");
    for (const railY of [-13.5, 13.5])
      tube(
        grip,
        3,
        1.3,
        7,
        [side * 20 - 3.5, railY, -40],
        "orange",
        "radial-slider-bearing",
        "x",
      );
    box(
      grip,
      [3, 5, 46],
      [side * 20, 0, -17],
      "steel",
      `${prefix}-finger-stem`,
    );
    box(grip, [10, 5, 3], [side * 15, 0, 4], "steel", `${prefix}-finger-foot`);
    tube(
      grip,
      3,
      1.1,
      4,
      [side < 0 ? -12 : 8, 0, 7],
      "orange",
      `${prefix}-shoe-hinge-bearing`,
      "x",
    );
    cylinder(
      grip,
      1,
      6,
      [side * 9, 0, 7],
      "steel",
      `${prefix}-shoe-pivot`,
      "x",
    );
    box(grip, [2, 4, 5], [side * 6, 0, 7], "teal", `${prefix}-shoe-hub`);
    const a = side < 0 ? Math.PI : 0;
    sector(
      grip,
      5.6,
      4.05,
      a - 0.65,
      a + 0.65,
      4.5,
      5,
      "teal",
      `${prefix}-shoe-pad`,
    );
    box(
      grip,
      [4, 5, 2],
      [side * 7, 2, 7],
      "steel",
      "gravity-return-follower-arm",
    );
    cylinder(
      grip,
      0.9,
      2,
      [side * 10, 4, 7],
      "orange",
      "gravity-return-follower",
      "x",
    );
    box(
      frame,
      [8.2, 5, 3],
      [side * 25.9, 0, -21.5],
      "alu",
      "gravity-cam-frame-bridge",
    );
    box(frame, [2.4, 5, 7], [side * 23, 0, -16.5], "alu", "gravity-cam-mount");
    for (const wall of [-1, 1])
      wire(
        frame,
        Array.from({ length: 41 }, (_, i) => {
          const t = i / 40;
          return new T.Vector3(
            side * 22,
            4 * Math.cos((t * Math.PI) / 2) + wall * 1.25,
            7 - 16 * t - 4 * Math.sin((t * Math.PI) / 2),
          );
        }),
        0.25,
        "orange",
        "gravity-return-cam-track",
      );
  }

  const camera = assembly(
    "compact-camera",
    "선택형 사선 카메라",
    "external",
    [0, -32, 0],
  );
  box(camera, [10, 10, 14], [0, -51, -48], "dark", "compact-camera-body");
  tube(camera, 49, 48, 5, [0, 0, -53], "alu", "camera-housing-clamp");
  box(camera, [4, 4, 5], [0, -50, -50.5], "alu", "compact-camera-bracket");
  const lens = cylinder(
    camera,
    3.5,
    6,
    [0, -44, -43],
    "black",
    "compact-camera-lens",
    "y",
  );
  lens.quaternion.setFromUnitVectors(
    new T.Vector3(0, 1, 0),
    new T.Vector3(0, 44, 37.7).normalize(),
  );

  const bolt = assembly(
    "compact-reference-bolt",
    "M8×35 비교 기준 볼트",
    "workpiece",
    [0, 0, 40],
  );
  cylinder(bolt, 4, 35, [0, 0, 17.5], "steel", "compact-bolt-shank");
  if (head === "hex")
    mesh(
      bolt,
      new T.ExtrudeGeometry(new T.Shape(hex(13 / Math.sqrt(3)).getPoints()), {
        depth: 5.3,
        bevelEnabled: false,
      }),
      [0, 0, -5.3],
      "steel",
      "compact-bolt-head",
    );
  else {
    cylinder(bolt, 6.5, 3.5, [0, 0, -1.75], "steel", "compact-bolt-head-base");
    const s = new T.Shape();
    s.absarc(0, 0, 6.5, 0, Math.PI * 2, false);
    const recess = new T.Path();
    const points =
      head === "slotted"
        ? [
            [-3.4, -0.55],
            [3.4, -0.55],
            [3.4, 0.55],
            [-3.4, 0.55],
          ]
        : [
            [-0.55, -3.4],
            [0.55, -3.4],
            [0.55, -0.55],
            [3.4, -0.55],
            [3.4, 0.55],
            [0.55, 0.55],
            [0.55, 3.4],
            [-0.55, 3.4],
            [-0.55, 0.55],
            [-3.4, 0.55],
            [-3.4, -0.55],
            [-0.55, -0.55],
          ];
    points.forEach(([x, y], i) =>
      i ? recess.lineTo(x, y) : recess.moveTo(x, y),
    );
    recess.closePath();
    s.holes.push(recess);
    mesh(
      bolt,
      new T.ExtrudeGeometry(s, { depth: 1.8, bevelEnabled: false }),
      [0, 0, -5.3],
      "steel",
      "compact-recessed-head",
    );
  }
  const sectionPlane = new T.Plane();
  function setInspection(mode: InspectionMode, amount = 0.5) {
    const n = T.MathUtils.clamp(amount, 0, 1);
    for (const part of parts)
      part.object.position
        .copy(offsets.get(part.object)!)
        .multiplyScalar(mode === "exploded" ? n : 0);
    root.updateMatrixWorld(true);
    sectionPlane
      .set(new T.Vector3(0, -1, 0), (n - 0.5) * 96)
      .applyMatrix4(root.matrixWorld);
    for (const material of Object.values(materials)) {
      material.clippingPlanes = mode === "section" ? [sectionPlane] : [];
      material.clipShadows = true;
    }
  }
  setInspection("assembled");
  for (const part of parts) {
    const bounds = new T.Box3().setFromObject(part.object);
    part.footprint = {
      min: bounds.min.multiplyScalar(1000).toArray(),
      max: bounds.max.multiplyScalar(1000).toArray(),
    };
  }
  return {
    root,
    setInspection,
    dimensions: { diameter: 96, length: 180 },
    parts,
  };
}
