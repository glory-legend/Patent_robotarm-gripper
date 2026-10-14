import { Matrix4 } from "three";
import { ramp, type BoltSpec } from "./timeline";
import { hasFeature, type HeadType, type RevisionId } from "./revision-config";

export const REVISION_BODY = {
  radius: 39,
  length: 148,
  nose: 18,
  grasp: 2.5,
  feed: 24,
  stow: 36,
};
export const HEAD_ANGLE = (38 * Math.PI) / 180;
/** Uniform steel shank + hex prism; dimensions mm, mass kg, inertia kg m². Threads/fillets excluded. */
export function boltMassProperties(spec: BoltSpec) {
  const r = spec.diameter * 500,
    l = spec.length * 1000,
    h = spec.headHeight * 1000,
    w = spec.headWidth * 1000;
  const shank = Math.PI * r * r * l * 7.85e-6,
    head = (Math.sqrt(3) / 2) * w * w * h * 7.85e-6;
  const mass = shank + head,
    centre = ((shank * l) / 2 - (head * h) / 2) / mass;
  const pivot = REVISION_BODY.grasp;
  const inertia =
    (shank * ((3 * r * r + l * l) / 12 + (l / 2 - pivot) ** 2) +
      head * ((w * w + h * h) / 12 + (-h / 2 - pivot) ** 2)) *
    1e-6;
  return {
    mass,
    centre,
    inertia,
    gravityTorque: (mass * 9.81 * (centre - pivot)) / 1000,
  };
}
const gravitySamples = new Map<string, number[]>();
/** Damped pendulum approximation; balanced shoes assumed. End guide supplies final alignment. */
export function gravityAngle(seconds: number, spec: BoltSpec) {
  let samples = gravitySamples.get(spec.id);
  if (!samples) {
    const { inertia, gravityTorque } = boltMassProperties(spec);
    const damping = 1.4 * Math.sqrt(gravityTorque * inertia),
      dt = 1 / 240;
    let angle = -Math.PI / 2,
      velocity = 0;
    samples = [angle];
    for (let i = 0; i < 960; i++) {
      velocity +=
        ((-gravityTorque * Math.sin(angle) - damping * velocity) / inertia) *
        dt;
      angle = Math.min(0, angle + velocity * dt);
      samples.push(angle);
    }
    gravitySamples.set(spec.id, samples);
  }
  const index = Math.max(
      0,
      Math.min(960, Number.isFinite(seconds) ? seconds * 240 : 0),
    ),
    i = Math.floor(index);
  return (
    samples[i] + (samples[Math.min(i + 1, 960)] - samples[i]) * (index - i)
  );
}
export function nearestDriveAngle(
  target: number,
  current: number,
  head: HeadType,
) {
  const period =
    head === "slotted"
      ? Math.PI
      : head === "phillips"
        ? Math.PI / 2
        : Math.PI / 3;
  return (
    current +
    ((((target - current + period / 2) % period) + period) % period) -
    period / 2
  );
}
export function revisionPose(
  input: number,
  spec: BoltSpec,
  id: RevisionId,
  head: HeadType = "hex",
) {
  const time = Math.max(0, Math.min(70, Number.isFinite(input) ? input : 0));
  const grip = ramp(time, 3, 5),
    feed = ramp(time, 16, 20),
    release = ramp(time, 22, 23);
  const stow = ramp(time, 23, 25),
    reload = ramp(time, 65, 68.5),
    close = ramp(time, 68.5, 70);
  const clamp = ramp(time, 20, 22) * (1 - ramp(time, 63, 64));
  const angle = hasFeature(id, "gravity")
    ? gravityAngle(time - 8, spec) * (1 - ramp(time, 12, 14))
    : (-Math.PI / 2) * (1 - ramp(time, 8, 14));
  const align = 1 + angle / (Math.PI / 2);
  const shoeAngle =
    angle * (1 - ramp(time, 24, 25)) - (Math.PI / 2) * ramp(time, 24, 25);
  const run = ramp(time, 39, 60);
  const pilot = ramp(time, 36, 39) * 4 * Math.PI;
  const spin =
    pilot + run * Math.max(0, spec.length / spec.pitch - 2) * 2 * Math.PI;
  const inserted = spin / ((spec.length / spec.pitch) * 2 * Math.PI);
  const bitAngle =
    nearestDriveAngle(HEAD_ANGLE, 0, head) * ramp(time, 27, 29) + spin;
  const retainOpen = ramp(time, 56, 58);
  const compression =
    hasFeature(id, "compliance") || hasFeature(id, "damping")
      ? 2 * ramp(time, 36, 39) * (1 - ramp(time, 63, 65))
      : 0;
  const closed = spec.diameter * 500 + 2;
  const gap = (closed + 4 - 4 * grip) * (1 - release) + 23 * release;
  return {
    time,
    grip,
    feed,
    release,
    stow,
    clamp,
    align,
    angle,
    shoeAngle,
    spin,
    bitAngle,
    inserted,
    gap: gap + (closed + 4 - gap) * close,
    carriageZ:
      (REVISION_BODY.feed * (1 - feed) - REVISION_BODY.stow * stow) *
        (1 - reload) +
      REVISION_BODY.feed * reload,
    lock: time < 8 || (time >= 14 && time < 23.8) || time >= 25,
    home: time < 8 || time >= 25,
    brake: time < 31 || time >= 63,
    bitSeat: ramp(time, 29, 31) * (1 - ramp(time, 63, 65)),
    vision: time >= 25 && time < 27 && head !== "hex",
    retainOpen,
    compression,
  };
}
export type RevisionPose = ReturnType<typeof revisionPose>;
export function revisionBoltMatrix(s: RevisionPose) {
  return new Matrix4()
    .makeTranslation(
      0,
      0,
      REVISION_BODY.grasp + REVISION_BODY.feed * (1 - s.feed) - s.compression,
    )
    .multiply(new Matrix4().makeRotationX(s.angle))
    .multiply(new Matrix4().makeTranslation(0, 0, -REVISION_BODY.grasp))
    .multiply(new Matrix4().makeRotationZ(HEAD_ANGLE + s.spin));
}
