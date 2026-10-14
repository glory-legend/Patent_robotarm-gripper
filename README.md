# R11 볼트 그리퍼

![R11 그리퍼 내부 배치](archive/R11/screenshots/r11-internal.png)

_R11 모델 원본 캡처(2026-10-02). 외장을 투명하게 표시한 모습입니다._

얇은 핀셋으로 통 안의 볼트를 집습니다. 2관절 보조 엄지가 볼트를 세우면 몸체 안의 6조 척이 헤드를 넘겨받습니다. 로봇팔은 척에 볼트를 고정한 채 체결 위치로 이동합니다. 가는 노즈는 이웃 볼트 사이로 들어갈 수 있도록 설계했습니다.

몸체 외형은 Ø60.5 × 89 mm입니다. 볼트를 14 mm 인입한 뒤 핀셋을 벌리고, 핀셋과 엄지를 29 mm 수납합니다. 체결 후 요크를 3 mm 더 움직여 척을 엽니다. M6×20, M8×35, M10×50 볼트의 동작을 3D로 볼 수 있습니다.

| 파지                                                  | 세우기                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| ![핀셋 파지](archive/R11/screenshots/r11-pick.png)    | ![보조 엄지로 볼트 세우기](archive/R11/screenshots/r11-righting.png) |
| 척에 인계                                             | 체결 동작                                                            |
| ![척에 인계](archive/R11/screenshots/r11-handoff.png) | ![체결 동작](archive/R11/screenshots/r11-fastening.png)              |

_위 사진은 2026-10-02 R11 모델 원본 캡처입니다._

## 웹에서 보기

[그리퍼 설명](https://glory-legend.github.io/Patent_robotarm-gripper/r11.html)과 [시뮬레이터](https://glory-legend.github.io/Patent_robotarm-gripper/)는 브라우저에서 바로 볼 수 있습니다. [유사 특허](https://glory-legend.github.io/Patent_robotarm-gripper/patents.html)에서는 관련 특허 3건의 원문을 열 수 있습니다.

로컬 실행에는 Node.js 22.12 이상이 필요합니다.

```bash
npm ci
npm run dev
```

로컬에서는 `http://127.0.0.1:5173/r11.html`을 열면 됩니다. 이 저장소에는 FR3 3D 자산이 포함되어 있습니다.

## 라이선스

코드는 [Apache-2.0](LICENSE)이며, 사용한 FR3 자산과 의존성의 출처는 [NOTICE](NOTICE)에 적었습니다.
