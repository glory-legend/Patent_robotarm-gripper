import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { disposeObject } from "./models";
import { loadWrist } from "./r11-real";
import { PRESETS, ramp, type BoltSpec } from "./timeline";
import { makeRevisionGripper, makeRevisionWorkpiece } from "./revision-model";
import { HEAD_ANGLE, REVISION_BODY, revisionPose } from "./revision-motion";
import {
  hasFeature,
  type RevisionId,
  type HeadType,
  type InspectionMode,
} from "./revision-config";

export class RevisionViewer {
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(36, 1, 0.002, 5);
  private renderer: T.WebGLRenderer;
  private controls: OrbitControls;
  private holder = new T.Group();
  private model = makeRevisionGripper("integrated", PRESETS[1], "hex");
  private wrist: T.Group | null = null;
  private spec: BoltSpec = PRESETS[1];
  private revision: RevisionId = "integrated";
  private head: HeadType = "hex";
  private time = 0;
  private mode: InspectionMode = "assembled";
  private amount = 0.5;
  private resizeObserver: ResizeObserver;
  private labels: HTMLSpanElement[] = [];
  private vision = document.createElement("div");
  private environment: T.WebGLRenderTarget;
  private workpiece = makeRevisionWorkpiece(PRESETS[1]);
  private disposed = false;
  private invalid = false;
  constructor(
    private host: HTMLElement,
    onError: (message: string) => void,
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor("#e9edef");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute("role", "img");
    this.renderer.domElement.setAttribute(
      "aria-label",
      "볼트 그리퍼 구조와 동작 3D 장면",
    );
    this.host.prepend(this.renderer.domElement);
    this.vision.className = "vision-alignment";
    this.vision.hidden = true;
    this.host.append(this.vision);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.controls.minDistance = 0.13;
    this.controls.maxDistance = 1.2;
    this.controls.target.set(0, 0.052, 0);
    const pmrem = new T.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    room.dispose();
    pmrem.dispose();
    this.scene.add(new T.HemisphereLight("#ffffff", "#93a8b5", 2));
    const key = new T.DirectionalLight("#fff8ed", 3.2);
    key.position.set(-0.4, 0.5, 0.6);
    this.scene.add(key);
    const fill = new T.DirectionalLight("#d6edff", 1.8);
    fill.position.set(0.5, 0.1, -0.4);
    this.scene.add(fill);
    this.holder.rotation.x = Math.PI / 2;
    this.holder.add(this.model.root);
    this.scene.add(this.holder);
    this.holder.add(this.workpiece);
    this.syncLabels();
    this.setView("perspective");
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.invalid = true;
      onError("3D 연결이 중단되었습니다. 다시 불러오면 모델을 복원합니다.");
    });
  }
  async load() {
    const wrist = await loadWrist(0.55);
    if (this.disposed) {
      disposeObject(wrist);
      return;
    }
    wrist.position.z = -REVISION_BODY.length / 1000;
    this.wrist = wrist;
    this.holder.add(wrist);
    this.update();
  }
  private resize() {
    const w = Math.max(1, this.host.clientWidth),
      h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  private syncLabels() {
    this.labels.forEach((l) => l.remove());
    this.labels = this.model.labels.map(({ text }) => {
      const label = document.createElement("span");
      label.className = "model-part-label";
      label.textContent = text;
      label.setAttribute("aria-hidden", "true");
      this.host.append(label);
      return label;
    });
  }
  private rebuild() {
    this.holder.remove(this.model.root);
    disposeObject(this.model.root);
    this.model = makeRevisionGripper(this.revision, this.spec, this.head);
    this.holder.add(this.model.root);
    this.syncLabels();
    this.update();
  }
  setRevision(id: RevisionId) {
    if (id === this.revision) return;
    this.revision = id;
    if (!hasFeature(id, "drive")) this.head = "hex";
    this.rebuild();
  }
  setSpec(spec: BoltSpec) {
    this.spec = spec;
    this.time = 0;
    this.holder.remove(this.workpiece);
    disposeObject(this.workpiece);
    this.workpiece = makeRevisionWorkpiece(spec);
    this.holder.add(this.workpiece);
    this.rebuild();
  }
  setHead(head: HeadType) {
    const next = hasFeature(this.revision, "drive") ? head : "hex";
    if (next === this.head) return;
    this.head = next;
    this.time = 0;
    this.rebuild();
  }
  setTime(seconds: number) {
    this.time = T.MathUtils.clamp(
      Number.isFinite(seconds) ? seconds : 0,
      0,
      70,
    );
    this.update();
  }
  setInspection(mode: InspectionMode, amount: number) {
    this.mode = mode;
    this.amount = T.MathUtils.clamp(
      Number.isFinite(amount) ? amount : 0.5,
      0,
      1,
    );
    this.update();
  }
  private update() {
    this.holder.updateMatrixWorld(true);
    this.model.update(this.time, this.mode, this.amount);
    if (this.wrist) this.wrist.visible = this.mode === "assembled";
    const p = revisionPose(this.time, this.spec, this.revision, this.head);
    this.vision.hidden = !(
      this.head !== "hex" &&
      this.time >= 25 &&
      this.time <= 31 &&
      this.mode === "assembled"
    );
    if (!this.vision.hidden) {
      const degrees = (p.bitAngle * 180) / Math.PI;
      const cross = this.head === "phillips" ? '<path d="M0 -15V15"/>' : "";
      this.vision.innerHTML = `<strong>홈 방향 정렬 · 예시</strong><svg viewBox="0 0 180 72" aria-hidden="true"><circle cx="42" cy="35" r="24"/><circle cx="133" cy="35" r="24"/><g transform="translate(42 35) rotate(${(-HEAD_ANGLE * 180) / Math.PI})" class="groove"><path d="M-15 0H15"/>${cross}</g><g transform="translate(133 35) rotate(${-degrees})" class="driver"><path d="M-15 0H15"/>${cross}</g><path class="arrow" d="M78 35h20m-5-5 5 5-5 5"/></svg><p>홈 38° <span>비트 ${degrees.toFixed(0)}°</span></p><small>${this.time < 27 ? "비트 후퇴 · 홈 촬영" : this.time < 29 ? "홀더 잠금 · 비트만 정렬" : "상대 깊이 확인 · 비트 삽입"}</small>`;
    }
    this.workpiece.visible =
      this.mode === "assembled" && this.time >= 31 && this.time < 68;
    const compression =
      this.time > 63
        ? revisionPose(63, this.spec, this.revision, this.head).compression
        : p.compression;
    this.workpiece.position.z =
      (this.spec.length * 1000 * (1 - p.inserted) -
        compression +
        30 * (1 - ramp(this.time, 31, 36)) +
        50 * ramp(this.time, 63, 67)) /
      1000;
  }
  setView(view: "perspective" | "front" | "side") {
    const target = new T.Vector3(0, 0.052, 0);
    const offset =
      view === "front"
        ? new T.Vector3(0, 0.025, 0.46)
        : view === "side"
          ? new T.Vector3(0.46, 0.025, 0)
          : new T.Vector3(0.25, 0.125, 0.39);
    this.camera.position.copy(target).add(offset);
    this.controls.target.copy(target);
    this.controls.update();
  }
  rotate(direction: number) {
    const v = this.camera.position.clone().sub(this.controls.target);
    v.applyAxisAngle(new T.Vector3(0, 1, 0), direction * 0.2);
    this.camera.position.copy(this.controls.target).add(v);
    this.controls.update();
  }
  zoom(factor: number) {
    const v = this.camera.position
      .clone()
      .sub(this.controls.target)
      .multiplyScalar(factor);
    v.clampLength(0.13, 1.2);
    this.camera.position.copy(this.controls.target).add(v);
    this.controls.update();
  }
  render() {
    if (this.disposed || this.invalid) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    const width = this.host.clientWidth,
      height = this.host.clientHeight;
    this.model.labels.forEach(({ object }, i) => {
      const pos = object.getWorldPosition(new T.Vector3()).project(this.camera),
        label = this.labels[i];
      const x = (pos.x * 0.5 + 0.5) * width,
        y = (-pos.y * 0.5 + 0.5) * height;
      const show =
        this.mode !== "assembled" &&
        pos.z < 1 &&
        x > 30 &&
        x < width - 30 &&
        y > 55 &&
        y < height - 55;
      label.hidden = !show;
      label.style.left = `${Math.max(5, Math.min(width - 150, x + 10))}px`;
      label.style.top = `${y}px`;
    });
  }
  dispose() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.labels.forEach((l) => l.remove());
    this.vision.remove();
    disposeObject(this.scene);
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
