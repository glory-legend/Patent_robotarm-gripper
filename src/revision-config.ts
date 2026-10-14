export type RevisionId =
  | "head"
  | "retention"
  | "compliance"
  | "damping"
  | "gravity"
  | "drive"
  | "integrated";
export type HeadType = "hex" | "phillips" | "slotted";
export type InspectionMode = "assembled" | "section" | "exploded";
export const HEADS: { id: HeadType; label: string }[] = [
  { id: "hex", label: "외육각 · 규격별 소켓" },
  { id: "phillips", label: "십자 PH · 전용 비트" },
  { id: "slotted", label: "일자 · 전용 비트" },
];
export interface Revision {
  id: RevisionId;
  code: string;
  label: string;
  title: string;
  summary: string;
  details: string[];
  features: readonly string[];
  sources: { label: string; url: string }[];
}
const screwSource = {
  label: "DEPRAG · 힘·위치 제어와 깊이 감지",
  url: "https://www.deprag.com/en/automation/screwdriving-units/e-sfm.html",
};
const angleSource = {
  label: "Atlas Copco · 토크와 각도 감시",
  url: "https://www.atlascopco.com/en-us/itba/expert-hub/articles/back-to-the-basics-angle-monitoring-and-control",
};
const bitSource = {
  label: "PB Swiss · PH와 PZ 비트의 차이",
  url: "https://www.pbswisstools.com/en/news/detail/phillips-and-pozidriv-cross-head-screws-explained-in-simple-terms",
};
const lightingSource = {
  label: "Edmund Optics · 편광으로 반사 줄이기",
  url: "https://www.edmundoptics.com/knowledge-center/application-notes/illumination/successful-light-polarization-techniques/",
};
const frictionSource = {
  label: "SKF · 베어링 마찰과 씰 저항",
  url: "https://evolution.skf.com/using-a-friction-model-as-an-engineering-tool-3/",
};
const holdingSource = {
  label: "Wera · 육각 소켓의 볼트 유지 구조",
  url: "https://www.wera.de/en/tools/belt-a-1-zyklop-socket-set-with-holding-function-1-4-drive",
};
const damperSource = {
  label: "ACE · 댐퍼 설치와 하중 지지",
  url: "https://www.ace-ace.com/media/ace_pim/documents/ACE_FRT-G2_OPERATING-MOUNTING_EN_21_22_0019.PDF",
};
export const REVISIONS: Revision[] = [
  {
    id: "head",
    code: "A",
    label: "헤드 고정형",
    title: "형상으로 돌리고, 걸림턱으로 유지합니다.",
    summary:
      "규격별 육각 소켓과 머리 밑 유지턱으로 토크 전달과 빠짐 방지를 나눕니다.",
    features: ["head"],
    details: [
      "M6·M8·M10은 대변 10·13·17 mm 소켓을 각각 사용합니다. 같은 척으로 모든 머리 형상을 완벽하게 잡는다고 가정하지 않습니다.",
      "소켓은 육각 면으로 토크를 전달하고, 분할 유지턱은 머리 밑을 받칩니다. 소켓은 낮은 축력으로 위상을 탐색한 뒤 완전히 끼웁니다.",
      "나사산 진입과 축방향 진행을 확인하면 유지턱을 열어 체결면을 비웁니다. 소켓은 머리 상부에 남아 가체결을 마칩니다.",
    ],
    sources: [holdingSource, screwSource, angleSource],
  },
  {
    id: "retention",
    code: "B",
    label: "회전 파지형",
    title: "볼트를 감싼 채 접촉 슈가 함께 돕니다.",
    summary:
      "맞은편 회전 슈와 머리 밑 걸림턱이 자세 전환 중 빠짐을 억제합니다.",
    features: ["retention"],
    details: [
      "헤드 밑 2.5 mm를 잡는 두 U형 슈가 같은 축으로 회전합니다. 몸통을 감싸는 접촉면과 머리 밑 걸림턱이 축방향 이탈을 막습니다.",
      "회전축과 같은 축의 서보가 슈를 돌려 볼트를 세웁니다. 회전할 때는 잠금 핀을 빼고 수직 정렬 뒤 축에서 벗어난 인덱스 구멍에 다시 끼웁니다.",
      "슈는 체결 토크를 받지 않습니다. 헤드를 체결부에 넘긴 뒤 벌리고 수납합니다. 파지 하중이 걸린 상태의 베어링 마찰과 접촉압을 함께 다룹니다.",
    ],
    sources: [frictionSource, screwSource],
  },
  {
    id: "compliance",
    code: "C",
    label: "축력 순응형",
    title: "체결축은 수직으로, 축력은 별도로 다룹니다.",
    summary:
      "키로 지지한 축방향 슬라이드와 스프링·변위 센서가 과도한 밀어 넣기를 줄입니다.",
    features: ["compliance"],
    details: [
      "팔의 마지막 링크가 기울어져 있어도 공구의 체결축은 구멍 축과 일치시킵니다. 팔 자세를 꺾는 것만으로 누르는 힘이 제한되지는 않습니다.",
      "비트·소켓 구동부에 축방향 스프링, 직선 가이드, 변위 감지와 과행정 스톱을 둡니다. 회전 반력은 키와 하우징으로 전달합니다.",
      "공구 안에서 비트가 머리를 누르는 힘은 축 내부 센서로 감지합니다. 손목 힘 센서는 외부 작업물 접촉 이후의 외력을 감시합니다.",
    ],
    sources: [
      screwSource,
      {
        label: "Franka · 공구와 강성 좌표계",
        url: "https://frankarobotics.github.io/libfranka/latest/classfranka_1_1Robot.html",
      },
    ],
  },
  {
    id: "damping",
    code: "D",
    label: "댐퍼형",
    title: "축방향 충격과 복귀 진동을 감쇠합니다.",
    summary:
      "직선 가이드의 스프링과 병렬 댐퍼가 접촉 순간의 충격과 튕김을 줄입니다.",
    features: ["damping"],
    details: [
      "댐퍼는 축방향 이동 속도에 비례하는 저항을 만듭니다. 스프링은 원래 위치로 돌려보내고, 스톱은 이동 범위를 한정합니다.",
      "댐퍼만으로 정적인 누름 힘을 제한할 수는 없습니다. 체결 중 힘 제한은 별도의 센서와 로봇·스핀들 제어가 담당합니다.",
      "중력 회전 슈에는 큰 힌지 댐퍼를 달지 않습니다. 작은 볼트의 중력 토크보다 마찰·감쇠가 크면 회전이 멈춥니다.",
    ],
    sources: [damperSource, screwSource],
  },
  {
    id: "gravity",
    code: "E",
    label: "ㄴ자 중력 회전형",
    title: "중력으로 세우고 빈 슈는 서보로 되돌립니다.",
    summary:
      "ㄴ자 집게 끝의 슈가 중력으로 회전한 뒤 서보가 수직으로 맞춥니다. 인덱스 핀이 자세를 잠그고 서보·클러치가 빈 슈를 복귀시킵니다.",
    features: ["gravity", "retention"],
    details: [
      "머리가 아래로 뒤집히지 않도록 회전축을 무게중심보다 헤드 쪽인 헤드 밑 2.5 mm에 둡니다. 두 슈는 회전축 둘레로 질량 균형을 맞춥니다.",
      "픽업 지지대에서 벗어나 8–12초에 잠금 핀과 클러치를 풀면 볼트가 중력으로 회전합니다. 12–14초에는 클러치를 연결해 서보로 수직을 맞추고 인덱스 핀을 잠근 뒤 인입합니다.",
      "볼트를 넘기고 집게를 벌린 뒤 클러치를 연결한 상태로 서보가 빈 슈를 가로 자세로 돌립니다. 원점과 핀 잠금을 확인한 뒤 다음 볼트에 접근합니다.",
      "아주 짧거나 가벼운 볼트는 베어링 기동 마찰을 이기지 못할 수 있습니다. 회전 미완료는 각도 감지로 구분하고 인입을 막습니다.",
    ],
    sources: [frictionSource],
  },
  {
    id: "drive",
    code: "F",
    label: "홈 인식·비트형",
    title: "머리를 잡은 뒤 홈을 보고 비트를 끼웁니다.",
    summary:
      "빈 중앙 통로와 카메라, 독립 비트 이송·회전축으로 일자·십자 홈을 맞춥니다.",
    features: ["drive", "head"],
    details: [
      "외주 홀더로 머리를 잡고 비트를 뒤로 뺀 뒤, 사선 카메라와 확산·편광 조명으로 홈의 중심과 방향을 읽습니다. 촬영 시 중앙 통로를 비웁니다.",
      "일자 홈은 180°, PH 십자 홈은 90° 주기에서 가장 가까운 방향으로 비트를 맞춥니다. 비트 종류와 크기는 작업 규격으로 지정하며 PH와 PZ를 혼용하지 않습니다.",
      "홀더 브레이크를 잠근 채 비트만 낮은 힘으로 접근합니다. 머리 유지와 상대 삽입 깊이를 확인한 뒤 브레이크를 풀어 볼트와 홀더가 함께 회전하게 합니다.",
      "외육각에서는 비트를 빼고 별도의 육각 소켓을 구동합니다. 홈 비트와 외육각 소켓은 교환 카트리지이며, 화면의 선택은 자동 공구 교환을 뜻하지 않습니다.",
    ],
    sources: [screwSource, bitSource, lightingSource, angleSource],
  },
  {
    id: "integrated",
    code: "G",
    label: "종합형",
    title: "파지에서 홈 정렬, 가체결까지 이어지는 구조.",
    summary:
      "ㄴ자 회전 슈, 형상 맞춤 헤드 유지부, 홈 정렬 비트, 축방향 순응과 댐퍼를 결합합니다.",
    features: [
      "head",
      "retention",
      "compliance",
      "damping",
      "gravity",
      "drive",
    ],
    details: [
      "ㄴ자 집게의 U형 회전 슈로 헤드 바로 아래를 잡습니다. 클러치 해제 → 중력 회전 → 서보 정렬·핀 잠금 → 머리 인계 → 서보로 빈 슈 복귀 순서로 움직입니다.",
      "외육각은 규격별 소켓이 토크를 전달합니다. 십자·일자는 외주 홀더로 유지하고 홈을 촬영한 뒤 비트를 넣습니다. 착좌 후 홀더가 볼트와 함께 회전합니다.",
      "축방향 스프링·댐퍼·변위 센서와 스톱을 배치합니다. 체결축을 수직으로 유지하면서 축력, 회전각, 토크와 진행량으로 가체결 상태를 판단합니다.",
      "유지턱은 최종 착좌 전에 열립니다. 홀더와 베어링·저널을 같은 캐리어에 묶어 6 mm 후퇴시키며 독립 구동축은 체결을 계속합니다. 모터의 토크는 벨트·중공축·키를 거쳐 소켓이나 비트로 전달됩니다.",
      "몸체 배치 기준은 Ø140 × 210 mm이며 외장 카메라와 돌출 집게는 별도입니다. FR3 플랜지에 연결한 프레임이 가이드·모터·카트리지를 지지합니다.",
    ],
    sources: [
      holdingSource,
      frictionSource,
      damperSource,
      screwSource,
      bitSource,
      lightingSource,
      angleSource,
    ],
  },
];
export const getRevision = (value: string | null): Revision =>
  REVISIONS.find((r) => r.id === value) ?? REVISIONS[6];
export const hasFeature = (id: RevisionId, feature: string) =>
  getRevision(id).features.includes(feature);
export const REVISION_STAGES = [
  {
    start: 0,
    end: 3,
    short: "접근",
    name: "볼트 접근",
    text: "가로 자세로 잠긴 접촉부를 볼트 헤드 바로 아래에 맞춥니다.",
  },
  {
    start: 3,
    end: 5,
    short: "파지",
    name: "헤드 가까이 파지",
    text: "몸통을 양쪽에서 잡고 파지 상태를 확인합니다.",
  },
  {
    start: 5,
    end: 8,
    short: "인출",
    name: "회전 공간으로 인출",
    text: "픽업 지지대에서 들어 올려 회전 공간을 확보한 뒤 자세를 바꿉니다.",
  },
  {
    start: 8,
    end: 14,
    short: "세움",
    name: "볼트 세우기",
    text: "접촉부가 볼트와 함께 회전합니다.",
  },
  {
    start: 14,
    end: 16,
    short: "잠금",
    name: "수직 보정 · 회전 잠금",
    text: "회전축에서 벗어난 인덱스 구멍에 핀을 끼워 수직 자세를 잠급니다.",
  },
  {
    start: 16,
    end: 20,
    short: "인입",
    name: "헤드 인입",
    text: "파지를 유지하며 24 mm 인입해 헤드를 체결부에 넘깁니다.",
  },
  {
    start: 20,
    end: 22,
    short: "고정",
    name: "머리 유지 · 착좌 확인",
    text: "머리의 유지 상태를 확인한 뒤에만 몸통 파지를 해제합니다.",
  },
  {
    start: 22,
    end: 25,
    short: "수납",
    name: "집게 수납 · 슈 원점 복귀",
    text: "집게를 조금 풀고 2 mm 내린 뒤 노즈 바깥으로 벌려 수납합니다. 24–25초에 클러치를 연결한 상태로 서보가 빈 슈를 가로 자세로 돌립니다.",
  },
  {
    start: 25,
    end: 27,
    short: "촬영",
    name: "머리 형상 확인",
    text: "비트를 뒤로 뺀 상태에서 머리의 중심과 홈 방향을 봅니다.",
  },
  {
    start: 27,
    end: 29,
    short: "방향",
    name: "체결 공구 방향 정렬",
    text: "머리를 고정한 상태에서 체결 공구의 방향을 맞춥니다.",
  },
  {
    start: 29,
    end: 31,
    short: "삽입",
    name: "비트·소켓 착좌",
    text: "낮은 축력으로 접근하고 상대 삽입 깊이를 확인합니다.",
  },
  {
    start: 31,
    end: 36,
    short: "이동",
    name: "수직 체결축으로 접근",
    text: "FR3가 공구를 고정 작업판으로 옮깁니다. 그리퍼의 체결축을 구멍 축과 일치시켜 접근합니다.",
  },
  {
    start: 36,
    end: 39,
    short: "진입",
    name: "나사산 진입",
    text: "낮은 속도로 진입하며 초기 토크와 축방향 진행을 확인합니다.",
  },
  {
    start: 39,
    end: 60,
    short: "가체결",
    name: "회전 · 축방향 추종",
    text: "회전과 피치에 따른 진행을 함께 감시합니다. 나사산이 유지하면 머리 아래 유지턱을 열고 후퇴합니다.",
  },
  {
    start: 60,
    end: 63,
    short: "착좌",
    name: "가체결 종료",
    text: "머리가 작업면에 도달하면 추가로 조이지 않고 멈춥니다. 그 전에 힘이나 토크가 급증하면 걸림으로 판단해 정지합니다.",
  },
  {
    start: 63,
    end: 65,
    short: "해제",
    name: "체결부 해제",
    text: "비트 또는 소켓을 빼고 볼트를 작업물에 남깁니다.",
  },
  {
    start: 65,
    end: 70,
    short: "복귀",
    name: "다음 파지 준비",
    text: "집게를 다시 내밀고 원점·잠금 상태를 확인합니다.",
  },
];
export function revisionStageText(
  id: RevisionId,
  time: number,
  head: HeadType,
) {
  if (time >= 8 && time < 14)
    return hasFeature(id, "gravity")
      ? "8–12초에는 잠금 핀과 클러치를 풀어 볼트 무게로 회전합니다. 12–14초에는 클러치를 연결해 서보로 수직을 맞추고 인덱스 핀을 잠급니다."
      : "회전축과 같은 축의 서보가 접촉부를 돌려 볼트를 세웁니다. 접촉부는 파지점을 중심으로 회전하며 볼트를 유지합니다.";
  if (time >= 25 && time < 27)
    return head === "hex"
      ? "외육각 소켓의 대변 규격을 맞춥니다. 머리 유지부와 구동 소켓의 토크 경로를 구분합니다."
      : "머리는 고정하고 비트는 후퇴시킵니다. 사선 카메라가 열린 중앙 통로로 홈을 촬영합니다. 영상은 위치·각도 설명을 위한 예시입니다.";
  if (time >= 27 && time < 29)
    return head === "hex"
      ? "소켓 입구에서 낮은 축력과 제한된 각도 탐색으로 육각 면을 맞춥니다."
      : `${head === "slotted" ? "일자 180°" : "PH 십자 90°"} 대칭을 이용해 가까운 방향으로 비트만 돌립니다. 이때 머리 홀더의 회전 브레이크는 잠겨 있습니다.`;
  if (time >= 29 && time < 31)
    return head === "hex"
      ? "육각 소켓의 삽입 깊이를 확인합니다. 소켓 벽의 형상 맞춤으로 회전력을 전달합니다."
      : "비트 축 스프링으로 접근하며 머리와 비트 사이의 상대 깊이를 확인합니다. 착좌 후 홀더 브레이크를 해제합니다.";
  return (REVISION_STAGES.find((s) => time < s.end) ?? REVISION_STAGES[16])
    .text;
}
