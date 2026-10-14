# 볼트 그리퍼: A–F 개선안과 G 통합안

![G 통합안 단면](docs/images/G-integrated-section.png)

_2026-10-14 코드로 재현한 G 통합안 단면입니다. 실물 사진이나 구조 해석 결과가 아닙니다._

볼트를 집어 세우고 머리를 체결부에 넘긴 뒤 나사를 조이는 구조를 3D로 비교합니다. 공구와 FR3 손목을 중심으로 조립·단면·분해 보기, 단계 이동, 시점 회전과 확대를 제공합니다. M6×20, M8×35, M10×50을 선택할 수 있으며 F·G에서는 외육각·십자 PH·일자 헤드를 바꿀 수 있습니다.

[웹에서 보기](https://glory-legend.github.io/Patent_robotarm-gripper/) · [r11.html로 열기](https://glory-legend.github.io/Patent_robotarm-gripper/r11.html) · [기술 검토와 버전별 사진](docs/GRIPPER_REVIEW.md) · [유사 특허](https://glory-legend.github.io/Patent_robotarm-gripper/patents.html)

| 설계안             | 주요 구조                           | 주소 매개변수         |
| ------------------ | ----------------------------------- | --------------------- |
| A 헤드 고정형      | 규격별 육각 소켓, 머리 밑 유지턱    | `revision=head`       |
| B 회전 파지형      | U형 회전 슈, 걸림턱, 잠금 핀        | `revision=retention`  |
| C 축력 순응형      | 축방향 스프링, 가이드, 힘·변위 감지 | `revision=compliance` |
| D 댐퍼형           | 스프링과 병렬 축방향 댐퍼           | `revision=damping`    |
| E ㄴ자 중력 회전형 | 엄지 제거, 중력 회전, 복귀 캠       | `revision=gravity`    |
| F 홈 인식·비트형   | 카메라, 독립 비트, 일자·십자 정렬   | `revision=drive`      |
| G 종합형           | A–F 구조 통합                       | `revision=integrated` |

두 웹 주소는 같은 일곱 설계안을 엽니다. [G 통합안의 PH 비트](https://glory-legend.github.io/Patent_robotarm-gripper/?revision=integrated&head=phillips)는 `?revision=integrated&head=phillips`로 공유합니다. 헤드 값은 `hex`, `phillips`, `slotted`이며 A–E는 외육각으로 표시합니다.

각 안은 Ø78×148 mm 개념 몸체와 분리된 머리 홀더·구동축을 공유합니다. E는 B의 회전 유지 구조를, F는 A의 머리 유지 구조를 포함합니다. 화면의 움직임은 설계 순서를 설명하며 실제 영상 인식·힘 제어·체결 성능은 검증하지 않았습니다.

## 로컬 실행

Node.js 22.12 이상에서 실행합니다.

```bash
npm ci
npm run dev
```

`http://127.0.0.1:5173/` 또는 `/r11.html`을 엽니다. 소스 검사는 `npm run typecheck`, 단위 검사는 `npm test`, 브라우저 검사는 `npm run test:browser`, 배포용 빌드는 `npm run build`로 실행합니다.

## 이전 모델과 라이선스

R11의 당시 원본 사진은 [archive/R11/screenshots](archive/R11/screenshots)에 보존되어 있습니다. 현재 문서의 A–G 사진과 구분합니다.

코드는 [Apache-2.0](LICENSE)이며, 사용한 FR3 자산과 의존성의 출처는 [NOTICE](NOTICE)에 적었습니다.
