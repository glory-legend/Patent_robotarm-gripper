import "./revision.css";
import { DURATION, PRESETS } from "./timeline";
import {
  REVISIONS,
  HEADS,
  REVISION_STAGES,
  getRevision,
  revisionStageText,
  type HeadType,
} from "./revision-config";
import { RevisionViewer } from "./revision-viewer";

type Inspection = "assembled" | "section" | "exploded";
const params = new URLSearchParams(location.search);
let revision = getRevision(params.get("revision"));
let head: HeadType =
  HEADS.find((item) => item.id === params.get("head"))?.id ?? "hex";
const supportsBits = () => ["drive", "integrated"].includes(revision.id);
if (!supportsBits()) head = "hex";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
<a class="skip-link" href="#main">본문으로 건너뛰기</a>
<header class="topbar">
  <a class="brand" href="./" aria-label="볼트 그리퍼 처음으로"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 3 11 6.5v13L16 29 5 22.5v-13Z"/><circle cx="16" cy="16" r="5"/><path d="M16 3v8m0 10v8"/></svg><span>볼트 그리퍼<small>구조와 동작</small></span></a>
  <nav aria-label="페이지 목차"><a href="./comparison.html">제품 형태 비교</a><a href="#explanation">설계 설명</a><a href="./patents.html">유사 특허 ↗</a></nav>
</header>
<main id="main" class="workspace" tabindex="-1">
  <div class="model-column">
    <section class="model-sheet" aria-labelledby="model-title">
      <div class="scene-heading"><div><p class="eyebrow">집기 · 정렬 · 인계 · 가체결</p><h1 id="model-title">${revision.title}</h1><p id="model-summary">${revision.summary}</p></div><div class="drawing-mark" aria-label="선택한 설계안"><span>설계안</span><strong id="revision-code">${revision.code}</strong></div></div>
      <div id="viewport" class="viewport" aria-label="그리퍼 3D 모델">
        <div class="view-controls" role="group" aria-label="시점 선택"><button data-view="perspective" aria-pressed="true" disabled>입체</button><button data-view="front" aria-pressed="false" disabled>정면</button><button data-view="side" aria-pressed="false" disabled>측면</button></div>
        <div class="camera-controls" role="group" aria-label="카메라 조작"><button id="rotate-left" aria-label="시점 왼쪽으로 회전" title="시점 왼쪽으로 회전" disabled>↶</button><button id="rotate-right" aria-label="시점 오른쪽으로 회전" title="시점 오른쪽으로 회전" disabled>↷</button><button id="zoom-in" aria-label="확대" title="확대" disabled>＋</button><button id="zoom-out" aria-label="축소" title="축소" disabled>−</button></div>
        <div id="loading" class="loading" role="status"><span class="loader" aria-hidden="true"></span><strong id="loading-title">3D 모델을 준비하고 있습니다</strong><p id="loading-text">잠시 후 구조와 동작을 살펴볼 수 있습니다.</p><button id="retry" hidden>다시 불러오기</button></div>
        <p class="model-caption">구조·동작 개념 모델</p><span class="orbit-hint">드래그로 회전 · 스크롤로 확대</span>
      </div>
      <div class="inspection-bar">
        <div class="inspection-controls" role="group" aria-label="구조 보기"><button data-inspection="assembled" aria-pressed="true" disabled>조립</button><button data-inspection="section" aria-pressed="false" disabled>단면</button><button data-inspection="exploded" aria-pressed="false" disabled>분해</button></div>
        <div id="inspection-range" class="inspection-range" hidden><label id="inspection-label" for="inspection-amount">단면 위치</label><input id="inspection-amount" type="range" min="0" max="1" step="0.01" value="0.5" disabled><output id="inspection-value" for="inspection-amount" aria-live="off">50%</output></div>
        <p id="inspection-note">단면과 분해 보기로 내부 구조를 살펴보세요.</p>
      </div>
    </section>
    <section class="transport" aria-label="동작 재생">
      <div class="transport-top"><div class="play-actions"><button id="play" class="primary" disabled>▶ 재생</button><button id="reset" aria-label="처음으로" title="처음으로" disabled>↺</button><div class="time-readout"><output id="current-time" for="timeline" aria-live="off">0.0</output><span>/ ${DURATION}초</span></div></div><label class="speed-control" for="speed">속도<select id="speed" disabled><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label></div>
      <label class="sr-only" for="timeline">동작 시간</label><input id="timeline" type="range" min="0" max="${DURATION}" step="0.1" value="0" disabled>
      <div class="phase-track" aria-label="동작 단계">${REVISION_STAGES.map((stage, index) => `<button data-stage="${index}" title="${stage.name}" disabled><span>${String(index + 1).padStart(2, "0")}</span>${stage.short}</button>`).join("")}</div>
      <div class="phase-explanation"><div class="phase-heading"><span id="step-count">01 / ${REVISION_STAGES.length}</span><h2 id="phase-title">${REVISION_STAGES[0].name}</h2><div class="phase-nav"><button id="prev" aria-label="이전 단계" title="이전 단계" disabled>←</button><button id="next" aria-label="다음 단계" title="다음 단계" disabled>→</button></div></div><p id="phase-description"></p></div>
    </section>
  </div>
  <aside class="sidebar" aria-label="설계안 선택과 설명">
    <section class="revision-section"><div class="section-heading"><h2>설계안 비교</h2><span>6개 개선안 + 통합안</span></div><div class="revision-list" role="group" aria-label="그리퍼 설계안">${REVISIONS.map((item) => `<button data-revision="${item.id}" aria-pressed="${item.id === revision.id}"><span class="revision-letter">${item.code}</span><span>${item.label}</span><span class="selection-mark" aria-hidden="true">↗</span></button>`).join("")}</div></section>
    <section id="explanation" class="explanation" aria-labelledby="detail-title" tabindex="-1"><p class="eyebrow">선택한 구조</p><h2 id="detail-title">${revision.label}</h2><ul id="revision-details"></ul><div id="revision-features" class="feature-list" aria-label="적용 구조"></div></section>
    <section class="bolt-section" aria-labelledby="bolt-heading"><h2 id="bolt-heading">대상 볼트</h2><div class="bolt-fields"><label for="bolt">규격<select id="bolt" disabled>${PRESETS.map((spec) => `<option value="${spec.id}" ${spec.id === "m8" ? "selected" : ""}>${spec.label}</option>`).join("")}</select></label><label for="head">헤드<select id="head" aria-describedby="head-note" disabled>${HEADS.map((item) => `<option value="${item.id}">${item.label}</option>`).join("")}</select></label></div><p id="head-note" class="field-note"></p></section>
    <details class="sources"><summary>구조와 설계 근거</summary><ul id="revision-sources"></ul><a href="./patents.html">관련 특허 살펴보기 ↗</a><p><a href="https://github.com/glory-legend/Patent_robotarm-gripper/blob/main/docs/GRIPPER_REVIEW.md" target="_blank" rel="noopener noreferrer">그리퍼 설계 검토 문서 ↗</a></p></details>
  </aside>
</main>
<footer class="footer"><span id="app-status" role="status">모델 불러오는 중</span><span>볼트 빈피킹 · 헤드 가체결</span></footer>`;

let viewer: RevisionViewer | undefined;
let time = 0;
let playing = false;
let ready = false;
let failed = false;
let inspection: Inspection = "assembled";
let amount = 0.5;
let currentStage = -1;
let animationId = 0;
let last = performance.now();
const play = $<HTMLButtonElement>("play");
const timeline = $<HTMLInputElement>("timeline");
const headSelect = $<HTMLSelectElement>("head");
const inspectionSlider = $<HTMLInputElement>("inspection-amount");
const stageAt = () => {
  const index = REVISION_STAGES.findIndex((stage) => time < stage.end);
  return index < 0 ? REVISION_STAGES.length - 1 : index;
};

function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.set("revision", revision.id);
  url.searchParams.set("head", head);
  history.replaceState(null, "", url);
}
function updateStatus() {
  const status = failed
    ? "3D 모델을 불러오지 못했습니다"
    : !ready
      ? "모델 불러오는 중"
      : playing
        ? "동작 재생 중"
        : inspection !== "assembled"
          ? `${inspection === "section" ? "단면" : "분해"} 보기 · 일시정지`
          : time >= DURATION
            ? "동작 완료"
            : "일시정지";
  if ($("app-status").textContent !== status)
    $("app-status").textContent = status;
}
function updateTimeline(force = false) {
  timeline.value = String(time);
  timeline.style.setProperty("--progress", `${(time / DURATION) * 100}%`);
  $("current-time").textContent = time.toFixed(1);
  play.textContent = playing ? "Ⅱ 일시정지" : "▶ 재생";
  play.setAttribute("aria-label", playing ? "일시정지" : "재생");
  const index = stageAt();
  if (force || index !== currentStage) {
    currentStage = index;
    $("phase-title").textContent = REVISION_STAGES[index].name;
    $("phase-description").textContent = revisionStageText(
      revision.id,
      time,
      head,
    );
    $("step-count").textContent =
      `${String(index + 1).padStart(2, "0")} / ${REVISION_STAGES.length}`;
    document
      .querySelectorAll<HTMLButtonElement>("[data-stage]")
      .forEach((button, i) => {
        button.classList.toggle("past", i < index);
        if (i === index) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      });
  }
  $<HTMLButtonElement>("prev").disabled = !ready || index === 0;
  $<HTMLButtonElement>("next").disabled =
    !ready || index === REVISION_STAGES.length - 1;
  updateStatus();
}
function seek(value: number) {
  time = Math.max(0, Math.min(DURATION, value));
  viewer?.setTime(time);
  updateTimeline();
}
function setInspection(mode: Inspection) {
  inspection = mode;
  playing = false;
  amount = mode === "exploded" ? 0.6 : 0.5;
  document
    .querySelectorAll<HTMLButtonElement>("[data-inspection]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.inspection === mode),
      ),
    );
  $("inspection-range").hidden = mode === "assembled";
  $("inspection-note").hidden = mode !== "assembled";
  $("inspection-label").textContent =
    mode === "section" ? "단면 위치" : "분해 거리";
  inspectionSlider.value = String(amount);
  $("inspection-value").textContent = `${Math.round(amount * 100)}%`;
  viewer?.setInspection(mode, mode === "assembled" ? 0 : amount);
  updateTimeline();
}
function setPlaying(value: boolean) {
  if (!ready) return;
  if (value) {
    setInspection("assembled");
    if (time >= DURATION) seek(0);
    last = performance.now();
  }
  playing = value;
  updateTimeline();
}
function stopAndSeek(value: number) {
  playing = false;
  seek(value);
}
function updateRevision() {
  if (!supportsBits()) head = "hex";
  headSelect.value = head;
  headSelect.disabled = !ready || !supportsBits();
  $("head-note").textContent = supportsBits()
    ? "헤드에 맞는 척·비트로 전환합니다. 변경하면 처음부터 시작합니다."
    : "육각 헤드용 구조입니다. 십자·일자 헤드는 F 홈 인식·비트형 또는 G 종합형에서 선택하세요.";
  $("model-title").textContent = revision.title;
  $("model-summary").textContent = revision.summary;
  $("revision-code").textContent = revision.code;
  $("detail-title").textContent = revision.label;
  $("revision-details").replaceChildren(
    ...revision.details.map((detail) => {
      const li = document.createElement("li");
      li.textContent = detail;
      return li;
    }),
  );
  $("revision-features").replaceChildren(
    ...revision.features.map((feature) => {
      const span = document.createElement("span");
      span.textContent =
        REVISIONS.find((item) => item.id === feature)?.label ?? feature;
      return span;
    }),
  );
  $("revision-sources").replaceChildren(
    ...revision.sources.map((source) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.textContent = `${source.label} ↗`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      li.append(link);
      return li;
    }),
  );
  document
    .querySelectorAll<HTMLButtonElement>("[data-revision]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.revision === revision.id),
      ),
    );
  document.title = `${revision.label} · 볼트 그리퍼`;
  syncUrl();
  updateTimeline(true);
}

play.addEventListener("click", () => setPlaying(!playing));
$("reset").addEventListener("click", () => {
  setInspection("assembled");
  stopAndSeek(0);
});
timeline.addEventListener("input", () => stopAndSeek(Number(timeline.value)));
$("prev").addEventListener("click", () =>
  stopAndSeek(REVISION_STAGES[Math.max(0, currentStage - 1)].start),
);
$("next").addEventListener("click", () =>
  stopAndSeek(
    REVISION_STAGES[Math.min(REVISION_STAGES.length - 1, currentStage + 1)]
      .start,
  ),
);
document
  .querySelectorAll<HTMLButtonElement>("[data-stage]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      stopAndSeek(REVISION_STAGES[Number(button.dataset.stage)].start),
    ),
  );
document
  .querySelectorAll<HTMLButtonElement>("[data-revision]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      playing = false;
      revision = getRevision(button.dataset.revision!);
      updateRevision();
      viewer?.setRevision(revision.id);
      viewer?.setHead(head);
      viewer?.setTime(time);
      viewer?.setInspection(
        inspection,
        inspection === "assembled" ? 0 : amount,
      );
    }),
  );
$("bolt").addEventListener("change", () => {
  const spec = PRESETS.find(
    (item) => item.id === $<HTMLSelectElement>("bolt").value,
  )!;
  viewer?.setSpec(spec);
  setInspection("assembled");
  stopAndSeek(0);
});
headSelect.addEventListener("change", () => {
  head = HEADS.find((item) => item.id === headSelect.value)?.id ?? "hex";
  if (!supportsBits()) head = "hex";
  viewer?.setHead(head);
  setInspection("assembled");
  stopAndSeek(0);
  updateRevision();
});
document
  .querySelectorAll<HTMLButtonElement>("[data-inspection]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      setInspection(button.dataset.inspection as Inspection),
    ),
  );
inspectionSlider.addEventListener("input", () => {
  playing = false;
  amount = Number(inspectionSlider.value);
  $("inspection-value").textContent = `${Math.round(amount * 100)}%`;
  viewer?.setInspection(inspection, amount);
  updateTimeline();
});
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) =>
  button.addEventListener("click", () => {
    viewer?.setView(button.dataset.view as "perspective" | "front" | "side");
    document
      .querySelectorAll<HTMLButtonElement>("[data-view]")
      .forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
  }),
);
$("rotate-left").addEventListener("click", () => viewer?.rotate(-1));
$("rotate-right").addEventListener("click", () => viewer?.rotate(1));
$("zoom-in").addEventListener("click", () => viewer?.zoom(0.8));
$("zoom-out").addEventListener("click", () => viewer?.zoom(1.25));

function setReady(value: boolean) {
  ready = value;
  document
    .querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
      ".view-controls button, .camera-controls button, .inspection-controls button, .transport button, .transport input, .transport select, .bolt-fields select, #inspection-amount",
    )
    .forEach((control) => {
      control.disabled = !value;
    });
  headSelect.disabled = !value || !supportsBits();
  updateTimeline();
}
function showError(message: string) {
  failed = true;
  playing = false;
  setReady(false);
  $("loading").hidden = false;
  $("loading").classList.add("failed");
  $("loading-title").textContent = "3D 화면을 표시할 수 없습니다";
  $("loading-text").textContent =
    message || "WebGL을 사용할 수 있는 브라우저에서 다시 불러오세요.";
  $("retry").hidden = false;
}
async function load() {
  viewer?.dispose();
  viewer = undefined;
  failed = false;
  setReady(false);
  $("loading").hidden = false;
  $("loading").classList.remove("failed");
  $("loading-title").textContent = "3D 모델을 준비하고 있습니다";
  $("loading-text").textContent = "잠시 후 구조와 동작을 살펴볼 수 있습니다.";
  $("retry").hidden = true;
  try {
    viewer = new RevisionViewer($("viewport"), showError);
    await viewer.load();
    if (failed) return;
    viewer.setRevision(revision.id);
    viewer.setSpec(
      PRESETS.find((spec) => spec.id === $<HTMLSelectElement>("bolt").value)!,
    );
    viewer.setHead(head);
    viewer.setTime(time);
    viewer.setInspection(inspection, inspection === "assembled" ? 0 : amount);
    setReady(true);
    $("loading").hidden = true;
  } catch (error) {
    showError(
      error instanceof Error ? error.message : "모델을 다시 불러오세요.",
    );
  }
}
$("retry").addEventListener("click", () => void load());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setPlaying(false);
});
function frame(now: number) {
  if (ready && playing) {
    const delta = Math.min((now - last) / 1000, 0.1);
    seek(time + delta * Number($<HTMLSelectElement>("speed").value));
    if (time >= DURATION) setPlaying(false);
  }
  last = now;
  if (ready) viewer?.render();
  animationId = requestAnimationFrame(frame);
}
window.addEventListener("pagehide", (event) => {
  if (event.persisted) {
    setPlaying(false);
    return;
  }
  cancelAnimationFrame(animationId);
  viewer?.dispose();
});
updateRevision();
void load();
animationId = requestAnimationFrame(frame);
