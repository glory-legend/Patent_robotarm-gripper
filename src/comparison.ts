import "./revision.css";
import "./comparison.css";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeCompactProduct } from "./product-compact";
import { makeRevisionGripper } from "./revision-model";
import { REVISION_BODY } from "./revision-motion";
import { HEADS, type HeadType, type InspectionMode } from "./revision-config";
import { PRESETS } from "./timeline";
import { disposeObject } from "./models";
import { palette } from "./theme";

const $ = <E extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as E;
let head: HeadType =
  HEADS.find(
    (item) => item.id === new URLSearchParams(location.search).get("head"),
  )?.id ?? "hex";
let mode: InspectionMode = "assembled";
let amount = 0.5;
let ready = false;

$("app").innerHTML = `
<a class="skip-link" href="#main">본문으로 건너뛰기</a>
<header class="topbar">
  <a class="brand" href="./" aria-label="볼트 그리퍼 처음으로"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 3 11 6.5v13L16 29 5 22.5v-13Z"/><circle cx="16" cy="16" r="5"/><path d="M16 3v8m0 10v8"/></svg><span>볼트 그리퍼<small>제품 형태 비교</small></span></a>
  <nav aria-label="페이지 목차"><a id="animation-link" href="./?revision=integrated">구조·동작 보기 ↗</a><a href="./patents.html">유사 특허 ↗</a></nav>
</header>
<main id="main" class="comparison" tabindex="-1">
  <div class="comparison-intro"><div><p class="eyebrow">소형 모듈형 · 확장 통합형</p><h1>몸체 안에, 어디까지 담을까</h1><p>원형 몸체를 유지한 배치와 기능을 넓게 펼친 배치를 같은 크기 기준으로 살펴보세요.</p></div><span class="comparison-status">설계 배치안</span></div>
  <section class="comparison-sheet" aria-label="같은 축척의 제품 형태 비교">
    <div class="comparison-toolbar">
      <div class="comparison-control-group" role="group" aria-label="구조 보기"><button data-inspection="assembled" aria-pressed="true" disabled>조립</button><button data-inspection="section" aria-pressed="false" disabled>단면</button><button data-inspection="exploded" aria-pressed="false" disabled>분해</button></div>
      <div class="comparison-control-group" role="group" aria-label="시점 선택"><button data-view="perspective" aria-pressed="true" disabled>입체</button><button data-view="front" aria-pressed="false" disabled>정면</button><button data-view="side" aria-pressed="false" disabled>측면</button></div>
      <label class="comparison-head" for="head"><span>M8 × 35 · 헤드</span><select id="head" disabled>${HEADS.map((item) => `<option value="${item.id}">${item.label}</option>`).join("")}</select></label>
    </div>
    <div class="comparison-adjustment"><div id="inspection-range" hidden><label id="inspection-label" for="inspection-amount">단면 위치</label><input id="inspection-amount" type="range" min="0" max="1" step="0.01" value="0.5" disabled><output id="inspection-value" for="inspection-amount">50%</output></div><p id="inspection-note">두 모델의 시점과 축척이 함께 움직입니다.</p><div class="comparison-control-group" role="group" aria-label="카메라 조작"><button id="rotate-left" aria-label="시점 왼쪽으로 회전" title="시점 왼쪽으로 회전" disabled>↶</button><button id="rotate-right" aria-label="시점 오른쪽으로 회전" title="시점 오른쪽으로 회전" disabled>↷</button><button id="zoom-in" aria-label="확대" title="확대" disabled>＋</button><button id="zoom-out" aria-label="축소" title="축소" disabled>−</button></div></div>
    <div class="comparison-models">
      <article class="product-panel" aria-labelledby="compact-title"><header class="product-heading"><div><p class="eyebrow">원형 몸체 · 교환식 카트리지</p><h2 id="compact-title">소형 모듈형</h2></div><p class="product-dimensions"><strong id="compact-size">Ø96 × 180</strong><span>mm · 몸체 배치 기준</span></p></header><div id="compact-viewport" class="comparison-viewport"><span class="viewport-corner">COMPACT / M8</span><div class="scale-mark" aria-hidden="true"><span></span>50 mm</div></div><div class="product-caption"><strong>중앙 구동축 + 앞쪽 교환 모듈</strong><p>헤드에 맞는 소켓·비트 카트리지를 교체합니다. 집게와 회전 슈는 몸체 앞쪽에 모읍니다.</p></div></article>
      <article class="product-panel" aria-labelledby="integrated-title"><header class="product-heading"><div><p class="eyebrow">넓은 몸체 · 기능 통합</p><h2 id="integrated-title">확장 통합형</h2></div><p class="product-dimensions"><strong>Ø${REVISION_BODY.radius * 2} × ${REVISION_BODY.length}</strong><span>mm · 몸체 배치 기준</span></p></header><div id="integrated-viewport" class="comparison-viewport"><span class="viewport-corner">INTEGRATED / M8</span><div class="scale-mark" aria-hidden="true"><span></span>50 mm</div></div><div class="product-caption"><strong>측면 모터 + 분리된 이송·순응부</strong><p>파지·회전·헤드 인계·가체결 구동을 함께 배치합니다. 각 장치의 설치·정비 공간을 확보합니다.</p></div></article>
      <div id="loading" class="loading" role="status"><span class="loader" aria-hidden="true"></span><strong id="loading-title">두 모델을 준비하고 있습니다</strong><p id="loading-text">같은 시점과 축척으로 구조를 비교합니다.</p><button id="retry" hidden disabled>다시 불러오기</button></div>
    </div>
    <div class="comparison-footnote"><p>드래그로 회전 · 스크롤로 확대 · 위 버튼으로도 조작할 수 있습니다.</p><p>치수는 외장·배치 기준이며 돌출 집게·카메라·볼트는 별도입니다.</p></div>
  </section>
  <section class="comparison-details" aria-labelledby="differences-title"><div class="comparison-details-heading"><h2 id="differences-title">배치를 바꾸면 달라지는 점</h2><p>두 안 모두 가체결용 설계 배치안입니다. 소형은 교환식 끝단으로 공간을 줄이고, 통합형은 구동·센서의 설치 공간을 넓게 둡니다.</p></div><div class="comparison-table-wrap" tabindex="0" role="region" aria-label="설계 비교표, 좁은 화면에서 가로로 스크롤"><table class="comparison-table"><thead><tr><th scope="col">비교 항목</th><th scope="col">소형 모듈형</th><th scope="col">확장 통합형</th></tr></thead><tbody><tr><th scope="row">크기 기준</th><td>Ø96 × 180 mm<br><span>원안 Ø78 × 148 mm보다 키운 재배치</span></td><td>Ø140 × 210 mm<br><span>측면 모터와 별도 이송부를 위한 공간</span></td></tr><tr><th scope="row">헤드 대응</th><td>육각·십자·일자별 카트리지 교환</td><td>회전 홀더 + 독립 이송 소켓·비트</td></tr><tr><th scope="row">가체결 구동</th><td>중앙 감속 스핀들<br><span>모터와 감속기를 공구축에 배치</span></td><td>측면 모터 → 벨트 → 중공 구동축<br><span>축과 이송부의 공간을 분리</span></td></tr><tr><th scope="row">순응·관측</th><td>짧은 순응부와 소형 관측 모듈<br><span>센서와 케이블의 설치 여유가 작음</span></td><td>스프링·댐퍼·축력 감지와 외장 카메라<br><span>설치·조정 공간이 더 큼</span></td></tr><tr><th scope="row">설계의 부담</th><td>작은 외경 안에서 구동·센서·배선을 맞춰야 함</td><td>무게·관성과 주변 볼트에 닿는 범위가 커짐</td></tr></tbody></table></div></section>
  <div class="comparison-next"><p>통합형의 볼트 파지부터 가체결까지</p><a id="sequence-link" href="./?revision=integrated">전체 동작 살펴보기 →</a></div>
</main><footer class="footer"><span id="app-status" role="status">모델 불러오는 중</span><span>동일 축척 · 정적 구조 비교</span></footer>`;

interface Panel {
  scene: T.Scene;
  camera: T.OrthographicCamera;
  renderer: T.WebGLRenderer;
  controls: OrbitControls;
  holder: T.Group;
  host: HTMLElement;
  environment: T.WebGLRenderTarget;
}
const panels: Panel[] = [];
let compact: ReturnType<typeof makeCompactProduct> | undefined;
let integrated: ReturnType<typeof makeRevisionGripper> | undefined;
let observer: ResizeObserver | undefined;
let syncing = false;
let viewHeight = 0.32;

function render() {
  if (!ready) return;
  for (const panel of panels) {
    panel.renderer.render(panel.scene, panel.camera);
    const width =
      (0.05 * panel.host.clientHeight * panel.camera.zoom) / viewHeight;
    panel.host.querySelector<HTMLElement>(".scale-mark span")!.style.width =
      `${width}px`;
  }
}
function syncCamera(source: Panel) {
  if (syncing) return;
  syncing = true;
  for (const panel of panels) {
    if (panel === source) continue;
    panel.camera.position.copy(source.camera.position);
    panel.camera.quaternion.copy(source.camera.quaternion);
    panel.camera.zoom = source.camera.zoom;
    panel.controls.target.copy(source.controls.target);
    panel.camera.updateProjectionMatrix();
    panel.controls.update();
  }
  syncing = false;
  render();
}
function resize() {
  const minimumAspect = Math.min(
    ...panels.map(({ host }) => host.clientWidth / host.clientHeight),
  );
  viewHeight = Math.max(
    mode === "exploded" ? 0.4 : 0.32,
    (mode === "exploded" ? 0.35 : 0.22) / minimumAspect,
  );
  for (const panel of panels) {
    const width = Math.max(1, panel.host.clientWidth),
      height = Math.max(1, panel.host.clientHeight);
    panel.renderer.setSize(width, height);
    panel.camera.top = viewHeight / 2;
    panel.camera.bottom = -viewHeight / 2;
    panel.camera.left = (-viewHeight * width) / height / 2;
    panel.camera.right = (viewHeight * width) / height / 2;
    panel.camera.updateProjectionMatrix();
  }
  render();
}
function setReady(value: boolean) {
  ready = value;
  document
    .querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
      ".comparison-toolbar button, .comparison-adjustment button, #head, #inspection-amount",
    )
    .forEach((control) => (control.disabled = !value));
}
function dispose() {
  setReady(false);
  observer?.disconnect();
  for (const panel of panels) {
    panel.controls.dispose();
    disposeObject(panel.scene);
    panel.environment.dispose();
    panel.renderer.dispose();
    panel.renderer.domElement.remove();
  }
  panels.length = 0;
  compact = undefined;
  integrated = undefined;
}
function showError() {
  setReady(false);
  $("loading").hidden = false;
  $("loading").classList.add("failed");
  $("loading-title").textContent = "3D 화면을 표시할 수 없습니다";
  $("loading-text").textContent =
    "WebGL을 사용할 수 있는 브라우저에서 다시 불러오세요. 아래 비교표는 계속 볼 수 있습니다.";
  $("retry").hidden = false;
  $<HTMLButtonElement>("retry").disabled = false;
  $("app-status").textContent = "3D 모델을 불러오지 못했습니다";
}
function applyInspection() {
  compact?.setInspection(mode, amount);
  integrated?.update(22, mode, amount);
  panels.forEach(({ host }) => (host.dataset.inspection = mode));
  $("app-status").textContent =
    `${mode === "assembled" ? "조립" : mode === "section" ? "단면" : "분해"} 보기 · 동일 축척`;
  resize();
}
function rebuild() {
  for (const { holder } of panels) {
    holder.children.forEach((object) => disposeObject(object));
    holder.clear();
  }
  compact = makeCompactProduct(head);
  integrated = makeRevisionGripper("integrated", PRESETS[1], head);
  panels[0].holder.add(compact.root);
  panels[1].holder.add(integrated.root);
  $("compact-size").textContent =
    `Ø${compact.dimensions.diameter} × ${compact.dimensions.length}`;
  panels.forEach(({ host, holder }) => {
    host.dataset.head = head;
    holder.updateMatrixWorld(true);
  });
  applyInspection();
}
function setView(view: string) {
  const first = panels[0];
  if (!first) return;
  first.controls.target.set(0, 0.085, 0);
  first.camera.position
    .copy(first.controls.target)
    .add(
      view === "front"
        ? new T.Vector3(0, 0, 0.7)
        : view === "side"
          ? new T.Vector3(0.7, 0, 0)
          : new T.Vector3(0.34, 0.13, 0.6),
    );
  first.controls.update();
  syncCamera(first);
  document
    .querySelectorAll<HTMLButtonElement>("[data-view]")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.view === view)),
    );
}
function syncHead() {
  $<HTMLSelectElement>("head").value = head;
  const url = new URL(location.href);
  url.searchParams.set("head", head);
  history.replaceState(null, "", url);
  for (const id of ["animation-link", "sequence-link"])
    $<HTMLAnchorElement>(id).href = `./?revision=integrated&head=${head}`;
}
async function load() {
  dispose();
  $("loading").hidden = false;
  $("loading").classList.remove("failed");
  $("loading-title").textContent = "두 모델을 준비하고 있습니다";
  $("loading-text").textContent = "같은 시점과 축척으로 구조를 비교합니다.";
  $("retry").hidden = true;
  $<HTMLButtonElement>("retry").disabled = true;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  try {
    for (const [index, id] of [
      "compact-viewport",
      "integrated-viewport",
    ].entries()) {
      const host = $(id),
        scene = new T.Scene(),
        camera = new T.OrthographicCamera(-0.2, 0.2, 0.16, -0.16, 0.01, 4);
      const renderer = new T.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
      renderer.setClearColor(palette().surface);
      renderer.localClippingEnabled = true;
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute(
        "aria-label",
        `${index === 0 ? "소형 모듈형" : "확장 통합형"} 그리퍼 3D 모델`,
      );
      host.prepend(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false;
      controls.enablePan = false;
      controls.minZoom = 0.65;
      controls.maxZoom = 2.5;
      const pmrem = new T.PMREMGenerator(renderer),
        room = new RoomEnvironment();
      const environment = pmrem.fromScene(room, 0.04);
      scene.environment = environment.texture;
      room.dispose();
      pmrem.dispose();
      scene.add(new T.HemisphereLight("#ffffff", "#93a8b5", 2));
      const key = new T.DirectionalLight("#fff8ed", 3.2);
      key.position.set(-0.4, 0.5, 0.6);
      scene.add(key);
      const fill = new T.DirectionalLight("#d6edff", 1.8);
      fill.position.set(0.5, 0.1, -0.4);
      scene.add(fill);
      const holder = new T.Group();
      holder.rotation.x = Math.PI / 2;
      scene.add(holder);
      const panel = {
        scene,
        camera,
        renderer,
        controls,
        holder,
        host,
        environment,
      };
      panels.push(panel);
      controls.addEventListener("change", () => syncCamera(panel));
      renderer.domElement.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        showError();
      });
    }
    rebuild();
    setView("perspective");
    setReady(true);
    observer = new ResizeObserver(resize);
    panels.forEach(({ host }) => observer!.observe(host));
    resize();
    $("loading").hidden = true;
  } catch (error) {
    console.error(error);
    showError();
  }
}

document
  .querySelectorAll<HTMLButtonElement>("[data-inspection]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      mode = button.dataset.inspection as InspectionMode;
      amount = mode === "exploded" ? 0.6 : 0.5;
      document
        .querySelectorAll<HTMLButtonElement>("button[data-inspection]")
        .forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
      $("inspection-range").hidden = mode === "assembled";
      $("inspection-note").hidden = mode !== "assembled";
      $("inspection-label").textContent =
        mode === "section" ? "단면 위치" : "분해 거리";
      $<HTMLInputElement>("inspection-amount").value = String(amount);
      $("inspection-value").textContent = `${Math.round(amount * 100)}%`;
      applyInspection();
    }),
  );
$("inspection-amount").addEventListener("input", () => {
  amount = Number($<HTMLInputElement>("inspection-amount").value);
  $("inspection-value").textContent = `${Math.round(amount * 100)}%`;
  applyInspection();
});
document
  .querySelectorAll<HTMLButtonElement>("[data-view]")
  .forEach((button) =>
    button.addEventListener("click", () => setView(button.dataset.view!)),
  );
for (const [id, direction] of [
  ["rotate-left", -1],
  ["rotate-right", 1],
] as const)
  $(id).addEventListener("click", () => {
    const { camera, controls } = panels[0];
    camera.position
      .sub(controls.target)
      .applyAxisAngle(new T.Vector3(0, 1, 0), direction * 0.2)
      .add(controls.target);
    controls.update();
  });
for (const [id, factor] of [
  ["zoom-in", 1.2],
  ["zoom-out", 1 / 1.2],
] as const)
  $(id).addEventListener("click", () => {
    const first = panels[0];
    first.camera.zoom = T.MathUtils.clamp(
      first.camera.zoom * factor,
      0.65,
      2.5,
    );
    first.camera.updateProjectionMatrix();
    syncCamera(first);
  });
$("head").addEventListener("change", () => {
  head =
    HEADS.find((item) => item.id === $<HTMLSelectElement>("head").value)?.id ??
    "hex";
  syncHead();
  try {
    rebuild();
  } catch (error) {
    console.error(error);
    showError();
  }
});
$("retry").addEventListener("click", () => {
  void load();
});
window.addEventListener("pagehide", dispose);
syncHead();
void load();
