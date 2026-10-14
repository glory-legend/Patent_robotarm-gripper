import * as T from "three";
import { ramp, type BoltSpec } from "./timeline";
import type { HeadType } from "./revision-config";
import { HEAD_ANGLE, type RevisionPose } from "./revision-motion";

type Materials = Record<
  "alu" | "dark" | "steel" | "teal" | "orange" | "green" | "black",
  T.Material
>;

/** Connected concept mechanisms in millimetres; the caller supplies the compliant cartridge mounting. */
export function makeRevisionHeadDrive({
  spindle,
  spec,
  head,
  improved,
  mat,
}: {
  spindle: T.Group;
  frame: T.Group;
  spec: BoltSpec;
  head: HeadType;
  improved: boolean;
  mat: Materials;
}) {
  const h = spec.headHeight * 1000,
    r = spec.diameter * 500,
    w = spec.headWidth * 1000;
  function group(name: string, parent: T.Object3D) {
    const g = new T.Group();
    g.name = name;
    parent.add(g);
    return g;
  }
  function mesh(
    parent: T.Object3D,
    geometry: T.BufferGeometry,
    material: T.Material,
    name: string,
    at = [0, 0, 0],
  ) {
    const m = new T.Mesh(geometry, material);
    m.name = name;
    m.position.fromArray(at);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(
    parent: T.Object3D,
    size: number[],
    at: number[],
    material: T.Material,
    name: string,
  ) {
    return mesh(
      parent,
      new T.BoxGeometry(size[0], size[1], size[2]),
      material,
      name,
      at,
    );
  }
  function boredPlate(
    parent: T.Object3D,
    size: number[],
    at: number[],
    material: T.Material,
    name: string,
    holes: number[][],
  ) {
    const shape = new T.Shape();
    shape.moveTo(-size[0] / 2, -size[1] / 2);
    shape.lineTo(size[0] / 2, -size[1] / 2);
    shape.lineTo(size[0] / 2, size[1] / 2);
    shape.lineTo(-size[0] / 2, size[1] / 2);
    shape.closePath();
    for (const [x, y, radius] of holes) {
      const hole = new T.Path();
      hole.absarc(x, y, radius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    return mesh(
      parent,
      new T.ExtrudeGeometry(shape, {
        depth: size[2],
        bevelEnabled: false,
        curveSegments: 32,
      }),
      material,
      name,
      [at[0], at[1], at[2] - size[2] / 2],
    );
  }
  function cylinder(
    parent: T.Object3D,
    radius: number,
    length: number,
    at: number[],
    material: T.Material,
    name: string,
    axis = "z",
  ) {
    const m = mesh(
      parent,
      new T.CylinderGeometry(radius, radius, length, 32),
      material,
      name,
      at,
    );
    if (axis === "z") m.rotation.x = Math.PI / 2;
    if (axis === "x") m.rotation.z = Math.PI / 2;
    return m;
  }
  function ring(
    parent: T.Object3D,
    outer: number,
    inner: number,
    z: number,
    depth: number,
    material: T.Material,
    name: string,
    xy = [0, 0],
  ) {
    const shape = new T.Shape();
    shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new T.Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    return mesh(
      parent,
      new T.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        curveSegments: 32,
      }),
      material,
      name,
      [xy[0], xy[1], z],
    );
  }
  function rod(
    parent: T.Object3D,
    a: number[],
    b: number[],
    radius: number,
    material: T.Material,
    name: string,
  ) {
    const start = new T.Vector3().fromArray(a),
      end = new T.Vector3().fromArray(b);
    const m = cylinder(
      parent,
      radius,
      start.distanceTo(end),
      start.clone().lerp(end, 0.5).toArray(),
      material,
      name,
      "y",
    );
    m.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      end.sub(start).normalize(),
    );
    return m;
  }
  function hexagon(radius: number, clockwise = false) {
    const path = new T.Path();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + ((clockwise ? -1 : 1) * k * Math.PI) / 3;
      if (k) path.lineTo(radius * Math.cos(a), radius * Math.sin(a));
      else path.moveTo(radius * Math.cos(a), radius * Math.sin(a));
    }
    path.closePath();
    return path;
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
          radius * Math.cos((i / 120) * 12 * Math.PI),
          radius * Math.sin((i / 120) * 12 * Math.PI),
          (i / 120) * length,
        ),
    );
    const geometry = new T.TubeGeometry(
      new T.CatmullRomCurve3(points),
      120,
      0.4,
      6,
      false,
    );
    const positions = geometry.getAttribute("position");
    // Ground spring ends meet the seat planes without penetrating them.
    for (let i = 0; i < positions.count; i++)
      positions.setZ(i, T.MathUtils.clamp(positions.getZ(i), 0, length));
    geometry.computeVertexNormals();
    return mesh(parent, geometry, mat.steel, name, at);
  }

  const carrier = group("stationary-spindle-carrier", spindle);
  ring(carrier, 23.8, 5, -166, 5, mat.alu, "spindle-rear-mount");
  const bearingHousing = group("spindle-bearing-housing", carrier);
  for (const [z, depth] of [
    [-162, 13],
    [-141, 8],
    [-106, 10],
  ])
    ring(bearingHousing, 14, 10, z, depth, mat.dark, "spindle-housing-section");
  for (const angle of [0, (2 * Math.PI) / 3, -Math.PI / 3])
    cylinder(
      bearingHousing,
      1.4,
      8,
      [12 * Math.cos(angle), 12 * Math.sin(angle), -145],
      mat.alu,
      "belt-window-post",
    );
  for (const [x, y] of [
    [-12, 0],
    [12, 0],
    [0, -12],
  ])
    cylinder(
      bearingHousing,
      2,
      27,
      [x, y, -119.5],
      mat.alu,
      "tool-feed-window-post",
    );
  ring(carrier, 10, 5.7, -100, 4, mat.alu, "spindle-nose-shoulder");
  ring(carrier, 8, 5.7, -96, 53, mat.dark, "stationary-spindle-nose");
  ring(carrier, 10, 5.5, -139, 6, mat.orange, "rear-spindle-bearing");
  ring(carrier, 8, 5.5, -43, 6, mat.orange, "front-spindle-bearing");
  ring(carrier, 23.8, 6, -101, 4, mat.alu, "holder-guide-rear-mount");
  // The motor bracket takes stator torque into the nonrotating cartridge.
  box(
    carrier,
    [37, 8, 2.5],
    [-17, -16, -132.75],
    mat.alu,
    "motor-reaction-bracket",
  );
  box(carrier, [8, 15, 2.5], [-28, -19, -132.75], mat.alu, "motor-mount-foot");
  cylinder(carrier, 9.5, 43, [-28, -32, -110], mat.teal, "spindle-motor");
  ring(carrier, 13, 9.5, -134, 2.5, mat.dark, "motor-mount-flange", [-28, -32]);
  ring(carrier, 9.5, 2.1, -141.5, 10, mat.dark, "spindle-gearhead", [-28, -32]);
  const driver = group("driver-rotor", spindle);
  const shaftShape = new T.Shape();
  shaftShape.absarc(0, 0, 5.5, 0, Math.PI * 2, false);
  shaftShape.holes.push(hexagon(3.55, true));
  const driveShaft = group("hollow-splined-shaft", driver);
  for (const [z, depth] of [
    [-142, 10],
    [-106, 72],
  ])
    mesh(
      driveShaft,
      new T.ExtrudeGeometry(shaftShape, {
        depth,
        bevelEnabled: false,
        curveSegments: 32,
      }),
      mat.steel,
      "splined-shaft-section",
      [0, 0, z],
    );
  for (const side of [-1, 1])
    box(
      driveShaft,
      [1.5, 4, 26],
      [side * 4.5, 0, -119],
      mat.steel,
      "shaft-feed-slot-web",
    );
  ring(driver, 7, 5.5, -142, 3, mat.steel, "shaft-rear-retaining-collar");
  ring(driver, 6.7, 5.5, -37, 2, mat.steel, "shaft-front-retaining-collar");
  // A rear belt plane stays clear of the full feed-carriage stroke.
  ring(driver, 8, 5.5, -147, 4, mat.orange, "spindle-pulley");
  ring(driver, 5.5, 3.55, -147, 5, mat.steel, "spindle-pulley-hub");
  const motorRotor = group("motor-output-rotor", carrier);
  motorRotor.position.set(-28, -32, 0);
  cylinder(motorRotor, 2, 12, [0, 0, -140], mat.steel, "motor-output-shaft");
  ring(motorRotor, 6, 2, -147, 4, mat.orange, "motor-pulley");
  const across = new T.Vector2(-28, -32),
    centreAngle = Math.atan2(across.y, across.x),
    tangentAngle = Math.acos(2 / across.length());
  for (const sign of [-1, 1]) {
    const a = centreAngle + sign * tangentAngle;
    rod(
      carrier,
      [8.65 * Math.cos(a), 8.65 * Math.sin(a), -145],
      [-28 + 6.65 * Math.cos(a), -32 + 6.65 * Math.sin(a), -145],
      0.65,
      mat.black,
      "timing-belt",
    );
  }
  for (const [x, y, radius, start, end] of [
    [
      0,
      0,
      8.65,
      centreAngle + tangentAngle,
      centreAngle - tangentAngle + 2 * Math.PI,
    ],
    [-28, -32, 6.65, centreAngle - tangentAngle, centreAngle + tangentAngle],
  ]) {
    const points = Array.from({ length: 81 }, (_, i) => {
      const angle = start + ((end - start) * i) / 80;
      return new T.Vector3(
        x + radius * Math.cos(angle),
        y + radius * Math.sin(angle),
        -145,
      );
    });
    mesh(
      carrier,
      new T.TubeGeometry(new T.CatmullRomCurve3(points), 80, 0.65, 8, false),
      mat.black,
      "timing-belt",
    );
  }

  const holderCarrier = group("holder-axial-carrier", carrier);
  const holderHousing = group("holder-bearing-housing", holderCarrier);
  ring(holderHousing, 20, 18, -69, 10, mat.dark, "holder-housing-rear");
  ring(holderHousing, 20, 18, -53, 18, mat.dark, "holder-housing-front");
  const brakeWindow = new T.Shape();
  brakeWindow.absarc(0, 0, 20, 0.2, 2 * Math.PI - 0.2, false);
  brakeWindow.absarc(0, 0, 18, 2 * Math.PI - 0.2, 0.2, true);
  brakeWindow.closePath();
  mesh(
    holderHousing,
    new T.ExtrudeGeometry(brakeWindow, { depth: 6, bevelEnabled: false }),
    mat.dark,
    "holder-brake-window",
    [0, 0, -59],
  );
  ring(holderCarrier, 18, 14, -68, 6, mat.orange, "holder-rear-bearing");
  ring(holderCarrier, 18, 14, -42, 6, mat.orange, "holder-front-bearing");
  for (const side of [-1, 1]) {
    cylinder(
      carrier,
      0.65,
      58,
      [side * 22.8, 6, -70],
      mat.steel,
      "holder-withdraw-guide",
    );
    for (const z of [-65, -48]) {
      ring(
        holderCarrier,
        1,
        0.65,
        z - 3,
        6,
        mat.teal,
        "holder-withdraw-bushing",
        [side * 22.8, 6],
      );
      box(
        holderCarrier,
        [3, 3, 5],
        [side * 20.5, 6, z],
        mat.alu,
        "holder-guide-ear",
      );
    }
    cylinder(
      carrier,
      1,
      2,
      [side * 22.8, 6, -40],
      mat.dark,
      "holder-guide-end-stop",
    );
  }
  ring(
    carrier,
    2,
    1.1,
    -97,
    23,
    mat.teal,
    "holder-withdraw-actuator",
    [0, -23.5],
  );
  box(
    carrier,
    [7, 8, 4],
    [0, -20.5, -98],
    mat.alu,
    "holder-withdraw-actuator-mount",
  );
  cylinder(
    holderCarrier,
    1,
    18,
    [0, -23.5, -70],
    mat.steel,
    "holder-withdraw-rod",
  );
  box(
    holderCarrier,
    [4, 6, 4],
    [0, -21.5, -61],
    mat.alu,
    "holder-withdraw-clevis",
  );

  const holder = group("head-holder", holderCarrier);
  const journal = group("holder-journal", holder);
  ring(journal, 14, 12.5, -70, 38, mat.steel, "holder-journal-tube");
  ring(holder, 21, 12.5, -35, 3, mat.steel, "holder-front-spider");
  const brake = cylinder(
    holderCarrier,
    2.2,
    5,
    [19.5, 0, -56],
    mat.green,
    "holder-brake",
    "x",
  );
  const brakeBody = ring(
    holderCarrier,
    3.2,
    2.2,
    0,
    4,
    mat.dark,
    "holder-brake-actuator",
  );
  brakeBody.rotation.y = Math.PI / 2;
  brakeBody.position.set(19.5, 0, -56);
  ring(holder, 17, 14, -59, 6, mat.steel, "holder-brake-drum");

  const drawsleeve = group("holder-draw-sleeve", holder);
  ring(drawsleeve, 11.5, 9, -77, 57, mat.steel, "holder-draw-tube");
  ring(drawsleeve, 15, 9, -80, 3, mat.orange, "holder-draw-thrust-inner");
  const drawYoke = group("holder-draw-yoke", holderCarrier);
  ring(drawYoke, 17, 15, -80, 3, mat.dark, "holder-draw-thrust-bearing");
  ring(
    holderCarrier,
    1.3,
    0.7,
    -67,
    20,
    mat.teal,
    "holder-jaw-actuator",
    [0, 23.5],
  );
  box(
    holderCarrier,
    [4, 4, 4],
    [0, 20.7, -60],
    mat.alu,
    "holder-jaw-actuator-mount",
  );
  cylinder(
    drawYoke,
    0.6,
    25,
    [0, 23.5, -69.5],
    mat.steel,
    "holder-jaw-actuator-rod",
  );
  box(drawYoke, [3, 8.5, 3], [0, 20.25, -78.5], mat.alu, "holder-draw-clevis");
  const retainers: T.Group[] = [];
  for (let k = 0; k < 3; k++) {
    const sector = group(`retainer-sector-${k}`, holder);
    sector.rotation.z = (k * 2 * Math.PI) / 3;
    const offset = head === "hex" ? 5 : 0,
      q = w / 2 + 1.25 + offset,
      contactY = (k === 1 ? -1 : 1) * 1.7;
    const guide = group("holder-radial-guide", sector);
    guide.position.x = q + 3;
    box(guide, [10, 5.5, 1], [0, 0, -18], mat.dark, "holder-guide-floor");
    for (const side of [-1, 1])
      box(
        guide,
        [10, 1, 2],
        [0, side * 2.3, -16.5],
        mat.dark,
        "holder-guide-rail",
      );
    box(
      sector,
      [2, 3, 13.5],
      [Math.max(14, q + 6), 0, -25.25],
      mat.steel,
      "holder-guide-support",
    );
    const jaw = group(`head-retainer-${k}`, sector);
    box(jaw, [3, 3.4, 3], [offset, 0, -16], mat.steel, "holder-jaw-slider");
    box(
      jaw,
      [2.2, 1.2, 14],
      [offset, contactY, -8],
      mat.dark,
      "retainer-flexure",
    );
    if (offset)
      box(
        jaw,
        [5, 1.2, 1.2],
        [2.5, contactY, -0.65],
        mat.dark,
        "retainer-radial-bridge",
      );
    box(
      jaw,
      [2.5, 1.2, head === "hex" ? 1.25 : h],
      [0, contactY, head === "hex" ? -0.625 : -h / 2],
      mat.orange,
      "head-contact",
    );
    if (improved)
      box(
        jaw,
        [Math.max(1, w / 2 - r), 0.8, 1],
        [-(w / 2 - r) / 2, contactY, 0.5],
        mat.orange,
        "under-head-retainer",
      );
    cylinder(
      jaw,
      0.65,
      9,
      [offset, 0, -14.5],
      mat.orange,
      "holder-cam-follower",
      "y",
    );
    retainers.push(jaw);
    const cam = group(`holder-opening-cam-${k}`, drawsleeve);
    cam.rotation.z = sector.rotation.z;
    // Side rollers leave the slider floor and central tool passage unobstructed.
    for (const side of [-1, 1]) {
      box(
        cam,
        [19, 2, 2],
        [12.5, side * 9, -22],
        mat.steel,
        "holder-cam-radial-arm",
      );
      for (const wall of [-1, 1]) {
        const x = q - 1.5 + wall * 1.35;
        rod(
          cam,
          [x, side * 9, -22],
          [x, side * 4.2, -16],
          0.3,
          mat.steel,
          "holder-cam-support",
        );
        rod(
          cam,
          [x, side * 4.2, -16],
          [q + 7.5 + wall * 1.35, side * 4.2, -7],
          0.3,
          mat.orange,
          "holder-opening-cam-track",
        );
      }
    }
  }

  const socket = group("socket-cartridge", driver),
    bit = group("bit-cartridge", driver);
  const tool = head === "hex" ? socket : bit;
  const quillShape = new T.Shape(hexagon(3.45).getPoints());
  mesh(
    tool,
    new T.ExtrudeGeometry(quillShape, {
      depth: 142 - h - (head === "hex" ? 3 : 26),
      bevelEnabled: false,
    }),
    mat.steel,
    "tool-spline-quill",
    [0, 0, -142],
  );
  if (head === "hex") {
    const shape = new T.Shape();
    shape.absarc(0, 0, w / Math.sqrt(3) + 2.2, 0, Math.PI * 2, false);
    shape.holes.push(hexagon(w / Math.sqrt(3) + 0.16, true));
    mesh(
      socket,
      new T.ExtrudeGeometry(shape, { depth: h - 1.6, bevelEnabled: false }),
      improved ? mat.orange : mat.steel,
      "hex-form-socket",
      [0, 0, -h],
    );
    ring(
      socket,
      w / Math.sqrt(3) + 2.2,
      3.2,
      -h - 3,
      3,
      mat.steel,
      "socket-back",
    );
    ring(socket, 5.5, 3.2, -h - 8, 5, mat.steel, "socket-shank");
  } else {
    cylinder(bit, 2.2, 26, [0, 0, -h - 13], mat.steel, "bit-shaft");
    const length = 1.4,
      arm = Math.min(w * 0.27, 3.8),
      thick = Math.max(0.65, r * 0.18);
    box(
      bit,
      [arm * 2, thick, length],
      [0, 0, -h + length / 2],
      mat.steel,
      head === "slotted" ? "slotted-bit" : "phillips-bit",
    );
    if (head === "phillips")
      box(
        bit,
        [thick, arm * 2, length],
        [0, 0, -h + length / 2],
        mat.steel,
        "phillips-cross-bit",
      );
  }
  ring(tool, 6.8, 5.6, -112, 3, mat.steel, "tool-feed-thrust-inner");
  cylinder(
    tool,
    0.65,
    13,
    [0, 0, -110.5],
    mat.steel,
    "tool-feed-cross-pin",
    "y",
  );
  const toolYoke = group("tool-feed-yoke", carrier);
  ring(toolYoke, 8.5, 6.8, -112, 3, mat.orange, "tool-feed-thrust-bearing");
  box(toolYoke, [5, 20, 1], [0, 18, -109.5], mat.alu, "tool-feed-yoke-arm");
  ring(carrier, 3.5, 1.1, -105, 26, mat.teal, "tool-feed-actuator", [0, 31]);
  boredPlate(
    carrier,
    [20, 15, 4],
    [7, 26, -99],
    mat.alu,
    "tool-feed-actuator-mount",
    [[-7, 5, 1.1]],
  );
  const piston = group("tool-feed-piston", carrier);
  cylinder(piston, 1, 35, [0, 31, -99], mat.steel, "tool-feed-piston-rod");
  ring(piston, 4, 1, -117, 2, mat.green, "bit-axis-load-cell", [0, 31]);
  ring(piston, 4, 1, -115, 1, mat.dark, "bit-spring-fixed-seat", [0, 31]);
  const seatingSpring = spring(
    piston,
    2.3,
    4,
    [0, 31, -114],
    "bit-seating-spring",
  );
  ring(toolYoke, 4, 1.2, -110, 1, mat.steel, "bit-spring-moving-seat", [0, 31]);
  cylinder(carrier, 1, 38, [8.5, 31, -118], mat.steel, "tool-feed-guide");
  ring(toolYoke, 2, 1, -114, 7, mat.dark, "tool-feed-guide-bushing", [8.5, 31]);
  box(
    toolYoke,
    [3.5, 3, 1],
    [5.25, 31, -109.5],
    mat.alu,
    "tool-feed-guide-ear",
  );
  box(
    carrier,
    [4, 5, 20],
    [14.5, 31, -121],
    mat.green,
    "relative-bit-depth-sensor",
  );
  box(carrier, [4, 5, 12], [14.5, 31, -105], mat.alu, "bit-depth-sensor-mount");
  box(toolYoke, [2, 3, 3], [10.5, 31, -110.5], mat.steel, "bit-depth-target");

  function update(p: RevisionPose) {
    const opening = 1 - p.clamp * (1 - p.retainOpen),
      withdrawal = -6 * ramp(p.time, 58, 59);
    driver.rotation.z = p.bitAngle;
    motorRotor.rotation.z = (p.bitAngle * 8) / 6;
    holder.rotation.z = HEAD_ANGLE + p.spin;
    holderCarrier.position.z = withdrawal;
    drawsleeve.position.z = -6 * opening;
    drawYoke.position.z = -6 * opening;
    retainers.forEach((jaw) => {
      jaw.position.x = w / 2 + 1.25 + 6 * opening;
    });
    brake.position.x = p.brake ? 19.5 : 21.5;
    const travel = -(head === "hex" ? 10 : 18) * (1 - p.bitSeat);
    tool.position.z = travel;
    toolYoke.position.z = travel;
    const preload = 0.5 * p.bitSeat;
    piston.position.z = travel + preload;
    seatingSpring.scale.z = (4 - preload) / 4;
  }
  return {
    holder,
    driver,
    bit,
    socket,
    brake,
    retainers,
    carrier,
    holderCarrier,
    update,
  };
}
