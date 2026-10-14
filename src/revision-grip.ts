import * as T from "three";
import type { BoltSpec } from "./timeline";
import { ramp } from "./timeline";
import { hasFeature, type RevisionId } from "./revision-config";
import { REVISION_BODY as B, type RevisionPose } from "./revision-motion";

type Materials = Record<
  "alu" | "dark" | "steel" | "teal" | "orange" | "green" | "black",
  T.Material
>;
export function makeRevisionGrip(
  frame: T.Group,
  feed: T.Group,
  spec: BoltSpec,
  id: RevisionId,
  mat: Materials,
) {
  const r = spec.diameter * 500,
    headRadius = (spec.headWidth * 1000) / Math.sqrt(3);
  const capture = hasFeature(id, "retention"),
    gravity = hasFeature(id, "gravity");
  function mesh(
    parent: T.Object3D,
    geometry: T.BufferGeometry,
    material: T.Material,
    name: string,
    at: number[] = [0, 0, 0],
  ) {
    const object = new T.Mesh(geometry, material);
    object.name = name;
    object.position.fromArray(at);
    parent.add(object);
    return object;
  }
  const box = (
    p: T.Object3D,
    size: number[],
    at: number[],
    material: T.Material,
    name: string,
  ) =>
    mesh(
      p,
      new T.BoxGeometry(...(size as [number, number, number])),
      material,
      name,
      at,
    );
  function cylinder(
    p: T.Object3D,
    radius: number,
    length: number,
    at: number[],
    material: T.Material,
    name: string,
    axis = "z",
  ) {
    const m = mesh(
      p,
      new T.CylinderGeometry(radius, radius, length, 32),
      material,
      name,
      at,
    );
    m.rotation.x = axis === "z" ? Math.PI / 2 : 0;
    if (axis === "x") m.rotation.z = Math.PI / 2;
    return m;
  }
  function tube(
    p: T.Object3D,
    outer: number,
    inner: number,
    depth: number,
    at: number[],
    material: T.Material,
    name: string,
    axis = "z",
  ) {
    const s = new T.Shape();
    s.absarc(0, 0, outer, 0, 2 * Math.PI, false);
    const h = new T.Path();
    h.absarc(0, 0, inner, 0, 2 * Math.PI, true);
    s.holes.push(h);
    const m = mesh(
      p,
      new T.ExtrudeGeometry(s, { depth, bevelEnabled: false }),
      material,
      name,
      at,
    );
    if (axis === "x") m.rotation.y = Math.PI / 2;
    return m;
  }
  const yoke = new T.Shape();
  yoke.absarc(0, 0, 66, 0, 2 * Math.PI, false);
  for (const [x, y, radius] of [
    [0, 0, 36],
    [-48, -40, 2.4],
    [48, -40, 2.4],
    [0, -56, 1.6],
  ]) {
    const hole = new T.Path();
    hole.absarc(x, y, radius, 0, 2 * Math.PI, true);
    yoke.holes.push(hole);
  }
  mesh(
    feed,
    new T.ExtrudeGeometry(yoke, { depth: 5, bevelEnabled: false }),
    mat.alu,
    "feed-yoke",
    [0, 0, -44],
  );
  for (const side of [-1, 1]) {
    const x = side * 48;
    cylinder(frame, 2.2, 196, [x, -40, -105], mat.steel, "feed-guide");
    box(frame, [8, 8, 7], [x, -40, -10.5], mat.dark, "feed-guide-front-mount");
    box(frame, [8, 8, 7], [x, -40, -206.5], mat.dark, "feed-guide-rear-mount");
    tube(feed, 4, 2.3, 14, [x, -40, -87], mat.orange, "feed-linear-bearing");
    tube(feed, 4, 2.3, 34, [x, -40, -73], mat.alu, "carriage-post");
  }
  tube(frame, 5, 1.45, 18, [0, -56, -172], mat.teal, "feed-motor");
  box(frame, [12, 12, 5], [0, -56, -174.5], mat.alu, "feed-motor-mount");
  box(frame, [8, 8, 26], [0, -56, -190], mat.alu, "feed-motor-support-post");
  const screw = cylinder(
    frame,
    1.4,
    154,
    [0, -56, -84],
    mat.steel,
    "feed-screw",
  );
  tube(frame, 3, 1.45, 5, [0, -56, -156], mat.orange, "feed-thrust-bearing");
  tube(frame, 3, 1.45, 5, [0, -56, -12], mat.orange, "feed-front-bearing");
  box(frame, [8, 9, 4], [0, -63.5, -10], mat.alu, "feed-bearing-bridge");
  box(frame, [8, 2, 16], [0, -69, -16], mat.alu, "feed-bearing-frame-mount");
  tube(feed, 4, 1.45, 10, [0, -56, -85], mat.orange, "feed-drive-nut");
  box(feed, [5, 4, 41], [0, -61, -60.5], mat.alu, "nut-to-carriage");
  const slides: {
    side: number;
    slide: T.Group;
    pivot: T.Group;
    pin: T.Mesh;
    rod: T.Mesh;
    piston: T.Mesh;
    clutch: T.Mesh;
  }[] = [];
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "left" : "right";
    const slide = new T.Group();
    slide.name = `jaw-slide-${suffix}`;
    feed.add(slide);
    for (const y of [-5, 5]) {
      box(
        feed,
        [16, 5, 5],
        [side * 32, y, -41.5],
        mat.alu,
        "radial-mount-yoke-bridge",
      );
      cylinder(
        feed,
        1.2,
        42,
        [side * 45, y, -31],
        mat.steel,
        `radial-guide-${suffix}`,
        "x",
      );
      box(
        feed,
        [4, 5, 12],
        [side * 26, y, -36],
        mat.alu,
        "radial-guide-inner-mount",
      );
      box(
        feed,
        [4, 5, 12],
        [side * 64, y, -36],
        mat.alu,
        "radial-guide-outer-mount",
      );
      tube(
        slide,
        2.6,
        1.25,
        7,
        [-3.5, y, -31],
        mat.orange,
        "radial-linear-bearing",
        "x",
      );
    }
    box(slide, [7, 6, 7], [0, 0, -31], mat.dark, "grip-slider");
    const actuator = new T.Group();
    actuator.position.set(0, side * 32, -31);
    actuator.rotation.z = side < 0 ? Math.PI : 0;
    feed.add(actuator);
    tube(
      actuator,
      4,
      2,
      40,
      [-16, 0, 0],
      mat.teal,
      "grip-actuator-barrel",
      "x",
    );
    cylinder(
      actuator,
      4,
      2,
      [-17, 0, 0],
      mat.dark,
      "grip-actuator-rear-cap",
      "x",
    );
    tube(
      actuator,
      4,
      1.55,
      2,
      [24, 0, 0],
      mat.dark,
      "grip-actuator-gland",
      "x",
    );
    const rod = cylinder(
      actuator,
      1.5,
      40,
      [13, 0, 0],
      mat.steel,
      "grip-actuator-rod",
      "x",
    );
    const piston = cylinder(
      actuator,
      1.95,
      4,
      [-5, 0, 0],
      mat.orange,
      "grip-actuator-piston",
      "x",
    );
    for (const x of [-12, 20])
      box(
        feed,
        [5, 9, 9],
        [side * x, side * 32, -39.5],
        mat.alu,
        "grip-actuator-mount",
      );
    box(slide, [5, 32, 4], [0, side * 16, -26], mat.alu, "grip-rod-clevis");
    box(slide, [5, 5, 9], [0, side * 32, -28.5], mat.alu, "grip-rod-end-link");
    box(
      slide,
      [2.8, 5, 28],
      [0, 0, -14.5],
      mat.steel,
      gravity ? "L-finger-stem" : "finger-stem",
    );
    const closed = r + 2,
      bearingX = headRadius + 5;
    const footEnd = side * (bearingX - closed - 28);
    const footShape = new T.Shape();
    footShape.moveTo(-3.5, -5);
    footShape.lineTo(3.5, -5);
    footShape.lineTo(3.5, 5);
    footShape.lineTo(-3.5, 5);
    footShape.closePath();
    const footBore = new T.Path();
    footBore.absarc(0, 0, 2.8, 0, 2 * Math.PI, true);
    footShape.holes.push(footBore);
    const foot = mesh(
      slide,
      new T.ExtrudeGeometry(footShape, {
        depth: Math.abs(footEnd) + 2,
        bevelEnabled: false,
      }),
      mat.steel,
      gravity ? "L-finger-foot" : "finger-foot",
      [Math.min(footEnd, 0) - 1, 0, B.grasp],
    );
    foot.rotation.y = Math.PI / 2;
    const pivot = new T.Group();
    pivot.name = capture ? `rotating-shoe-${suffix}` : `contact-pad-${suffix}`;
    pivot.position.set(-side * 28, 0, B.grasp);
    slide.add(pivot);
    const offset = bearingX - closed;
    const supportX = side * (offset - 28);
    tube(
      slide,
      2.8,
      1.05,
      3,
      [supportX - 1.5, 0, B.grasp],
      mat.orange,
      "pivot-bearing",
      "x",
    );
    cylinder(
      pivot,
      1,
      offset + 3,
      [(side * (offset + 3)) / 2, 0, 0],
      mat.steel,
      "shoe-pivot-shaft",
      "x",
    );
    if (capture) {
      box(pivot, [2.4, 4, 4], [0, 0, 0], mat.teal, "shoe-centre");
      for (const a of [-28, 28]) {
        const angle = (side < 0 ? Math.PI : 0) + T.MathUtils.degToRad(a);
        const pad = box(
          pivot,
          [1.1, 2.8, 4],
          [
            (r + 0.55) * Math.cos(angle) - side * closed,
            (r + 0.55) * Math.sin(angle),
            0,
          ],
          mat.teal,
          "U-contact-face",
        );
        pad.rotation.z = angle;
      }
      box(
        pivot,
        [1.8, 4.6, 0.8],
        [-side * 0.8, 0, -2.05],
        mat.teal,
        "shoe-head-lip",
      );
    } else
      cylinder(pivot, 1.5, 4, [0, 0, 0], mat.black, "flat-contact-pad", "x");
    const diskShape = new T.Shape();
    diskShape.absarc(0, 0, 4.5, 0, 2 * Math.PI, false);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const hole = new T.Path();
      hole.absarc(
        3.2 * Math.cos(a),
        3.2 * Math.sin(a),
        0.7,
        0,
        2 * Math.PI,
        true,
      );
      diskShape.holes.push(hole);
    }
    const disc = mesh(
      pivot,
      new T.ExtrudeGeometry(diskShape, { depth: 1.4, bevelEnabled: false }),
      mat.steel,
      "shoe-index-disc",
      [side * 30.5, 0, 0],
    );
    disc.rotation.y = (side * Math.PI) / 2;
    const pin = cylinder(
      slide,
      0.5,
      4,
      [side * 5.7, 3.2, B.grasp],
      mat.green,
      `pivot-lock-${suffix}`,
      "x",
    );
    tube(
      slide,
      1.4,
      0.55,
      5,
      [side * 8 - 2.5, 3.2, B.grasp],
      mat.teal,
      "pivot-lock-actuator",
      "x",
    );
    box(
      slide,
      [12, 2, 3],
      [side * 2, 6, B.grasp],
      mat.dark,
      "index-lock-mount",
    );
    box(
      slide,
      [3, 2.2, 3],
      [side * 8, 5.4, B.grasp],
      mat.dark,
      "index-lock-mount-end",
    );
    box(
      slide,
      [3, 3, 3],
      [-side * 3, 4.5, B.grasp],
      mat.dark,
      "index-lock-mount-root",
    );
    const drive = new T.Group();
    drive.position.set(0, 0, B.grasp);
    drive.rotation.z = side < 0 ? Math.PI : 0;
    slide.add(drive);
    tube(
      drive,
      4.5,
      2.15,
      8,
      [-8, 0, 0],
      mat.teal,
      gravity ? "shoe-reset-servo" : "righting-servo",
      "x",
    );
    tube(
      drive,
      2.1,
      1.1,
      7.8,
      [-7.9, 0, 0],
      mat.steel,
      "shoe-servo-rotor",
      "x",
    );
    tube(
      drive,
      1.8,
      1.1,
      0.8,
      [-8.7, 0, 0],
      mat.steel,
      "clutch-input-hub",
      "x",
    );
    tube(
      drive,
      2,
      1.1,
      0.4,
      [-8.8, 0, 0],
      mat.orange,
      "clutch-input-face",
      "x",
    );
    tube(drive, 2.2, 2.05, 2, [-10, 0, 0], mat.dark, "shoe-drive-clutch", "x");
    const clutchOutput = new T.Group();
    clutchOutput.position.x = side * 28;
    clutchOutput.rotation.z = side < 0 ? Math.PI : 0;
    pivot.add(clutchOutput);
    const clutchShape = new T.Shape();
    clutchShape.absarc(0, 0, 2, 0, 2 * Math.PI, false);
    const clutchKeyway = new T.Path();
    for (let k = 0; k < 6; k++) {
      const a = (-k * Math.PI) / 3;
      if (k) clutchKeyway.lineTo(1.05 * Math.cos(a), 1.05 * Math.sin(a));
      else clutchKeyway.moveTo(1.05, 0);
    }
    clutchKeyway.closePath();
    clutchShape.holes.push(clutchKeyway);
    const clutch = mesh(
      clutchOutput,
      new T.ExtrudeGeometry(clutchShape, { depth: 0.4, bevelEnabled: false }),
      mat.orange,
      "clutch-output-face",
      [-9.6, 0, 0],
    );
    clutch.rotation.y = Math.PI / 2;
    const shaftEnd = 32;
    const outputShaft = cylinder(
      pivot,
      1,
      shaftEnd - offset,
      [side * (offset + (shaftEnd - offset) / 2), 0, 0],
      mat.steel,
      "righting-output-shaft",
      "x",
    );
    outputShaft.geometry.dispose();
    outputShaft.geometry = new T.CylinderGeometry(1, 1, shaftEnd - offset, 6);
    slides.push({ side, slide, pivot, pin, rod, piston, clutch });
  }
  const update = (p: RevisionPose) => {
    feed.position.z = p.carriageZ;
    screw.rotation.y = (2 * Math.PI * p.carriageZ) / 2;
    for (const s of slides) {
      const jaw = p.gap + 28;
      s.slide.position.x = s.side * jaw;
      s.pivot.rotation.x = p.shoeAngle;
      const clutchEngaged = !gravity || p.time < 8 || p.time >= 12;
      s.clutch.position.x = clutchEngaged ? -9.2 : -9.6;
      const engagement =
        p.time >= 12 && p.time < 14 ? ramp(p.time, 12, 14) : p.lock ? 1 : 0;
      s.pin.position.x = s.side * (5.7 + 3 * (1 - engagement));
      s.rod.position.x = jaw - 20;
      s.piston.position.x = jaw - 38;
    }
  };
  return { update, shoes: slides };
}
