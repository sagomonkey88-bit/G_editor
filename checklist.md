# v1.5 패치 체크리스트 — PART A 자동 배치 (미술관메이커_개발지시문_패치_v1.5.md)

이번 세션 범위: **PART A (A1~A5)만.** PART B 는 손대지 않는다.
크기 모델: **방안 A 승인** — 자동 배치는 sizeCm 에 표시 크기를 굽고 scale=1.0.

## A1. 작품 → 섹션 할당 UI ✅ (커밋 완료)
- [x] state.js: `assignToRoom(ids, roomId)` — 보관함/다른 방에서 이동 → room.artworks + route (임시 배치, undo 1회)
- [x] state.js: `reorderLibrary(fromId, toId)` — 보관함 순서 = 동선 순서
- [x] libraryPanel.js: 보관함 셀 체크박스 다중 선택 + 방 드롭다운 + "선택 N점 배치"
- [x] libraryPanel.js: 보관함 셀 드래그 순서 재정렬
- [x] libraryPanel.js: 파일명 접두어(01_섹션명_…) 자동 그룹핑 제안 모달
- [x] planView.js: 룸으로 드래그 앤 드롭 = 할당
- [x] app.js: `createRoom(name)` 팩토리 추출 + LibraryPanel onCreateRoom 콜백
- [x] editor.css: 체크박스/선택/드롭 타깃 스타일
- [x] 라이브 검증(preview MCP): 다중선택 배치·평면도 드롭·재정렬·그룹핑·undo 1스텝 통과, 콘솔 클린
- [x] A1 신규 스키마 없음(기존 room.artworks/route/_library) → 라운드트립 영향 없음, add-room 리팩토링 회귀 없음

## A2. 기본 크기 규칙 ✅ (커밋 완료)
- [x] schema.js: `project.autoLayout{scaleSetting,gapChar,clockwise,protectManual,autoSizeRoom}` + `makeAutoLayout`/`ensureAutoLayout` + `room.autoScale` 오버라이드 필드
- [x] state.js: init/import/reset 에 ensureAutoLayout 연결
- [x] editor/js/autoLayout.js 신설: AUTO 캘리브레이션 상수 + `targetHeightM`/`aspectOf`/`normalizedSize`(방안 A: sizeCm 굽기, 파노라마 폭 상한) + `effectiveScale`
- [x] app.js 룸 속성: 전역 배율 슬라이더(3.0–4.0) + 방별 개별 배율 토글·슬라이더
- [x] 라이브 검증: 순수함수(2.8/2.4/3.2m, 세로/가로/파노라마), UI 슬라이더·오버라이드, zip 라운드트립 보존, 마이그레이션, 콘솔 클린
- [x] 참고: 실제 크기 일괄 적용은 A4 에서 normalizedSize 소비. 개별 재조정은 기존 인스펙터/코너핸들 그대로.
## A3. 방 크기 자동 산정 ✅ (커밋 완료)
- [x] autoLayout.js: `autoOuter`(정규화 외곽 폭/높이), `entranceWallOf`(입구 벽), `usableWalls`(입구/출구 제외 시계방향)
- [x] autoLayout.js: `computeRoomPlan(project, roomId, opts)` 순수 함수 — 개수 균등 분배 → 축별 필요 길이 → 방 치수 산정(clamp min~20) + 경고
- [x] 경고: 상한 초과("방 나누기 권장"), 개수 초과(>12), autoSizeRoom=false 시 크기 유지
- [x] 라이브 검증: 6점→west/east 3/3+깊이 9→11.82m, 14점→7/7+깊이 20 cap+경고 2건, autoSizeRoom off 유지, 콘솔 클린
- [x] A3 신규 스키마·변경 없음(순수 함수) → 라운드트립 무영향. 실제 적용·위치는 A4.
## A4. 배치 알고리즘 ✅ (커밋 완료)
- [x] autoLayout.js `layoutRoom(store, roomId, opts)`: 계획 → 방 크기 적용 → 문 offset 클램프 → 벽별 균등 간격 배치, sizeCm 굽기(방안 A)+scale=1, 중심 높이 1.75m, mutate 1회(undo 1스텝)
- [x] schema.js `reflowOrigins(project, start)`: 옵션1 — 사이징 후 exitDoor 체인 재배치(겹침 방지). layoutRoom 은 하류만(상류 고정), A5 "전체"는 start=0
- [x] 라이브 검증: 6점→겹침 0(로비 침범 해소), 3방×10점→겹침·에러 0·upstream 고정·last-room 3벽 분배, 균등 간격 3.26m, undo 1스텝, 콘솔 클린
- [x] A4 신규 스키마 필드 없음(origin/size/placement 기존) → 라운드트립 무영향
## A5. 재배치와 되돌리기 ✅ (커밋 완료)
- [x] elevationView: 수동 이동/스케일 시 `aw._manual=true` (보호 대상 표시)
- [x] autoLayout.js: computeRoomPlan 보호 분리(fixed=현재 벽 고정 장애물, movable만 분배·크기 굽기), applyRoomPlan(resolvePlacement 로 고정 회피), layoutRoom(하류만)/layoutAll(전체, start=0)
- [x] exporter.js: `delete a._manual` (배포본 제외, 작업 zip 은 유지)
- [x] app.js: "이 방 자동 정렬"·"전체 미술관 자동 배치" 버튼 + 방 크기 자동 조정/직접 옮긴 작품 보호 토글 + 기존 배치 확인 다이얼로그(confirmDialog)
- [x] A3.4: "방 크기 자동 조정" 토글로 "크기 유지/재산정" 대체(persist)
- [x] 라이브 검증: 보호 ON 고정·OFF 재배치, UI 버튼·토글, 전체 다이얼로그, undo 1스텝, 3방 겹침 0, publish `_manual` 제거·work zip 유지, 평면도 스크린샷 깔끔, 콘솔 클린

## 공통 (각 항목 완료 시)
- [x] 저장→재로드→내보내기 라운드트립 (autoLayout·autoScale·_manual 확인)
- [x] v1.4(텔레포트/평면도 인디케이터/캡션 meta) 회귀 없음 — 로드·검증 클린
- [x] 항목 번호 포함 시맨틱 커밋 (A1~A5)

## PART A 완료. PART B 는 새 세션에서 이 문서만 다시 읽고 진행.

---

# v1.5 보완 패치 — 배치 UX (사용자 피드백 2026-07-13)

배경: "선택 N점 배치"가 임시 배치(한 벽·원본 크기)에서 멈춰 자동 정렬 버튼을 따로 눌러야 했음.
확정 사항: ①배치 즉시 자동 정렬 ②섹션 텍스트는 자동 정렬 시 생성+배치 ③드롭 시 섹션 선택 팝업.

## B1. 배치 즉시 자동 정렬
- [x] state.js: `assignToRoom` 이 같은 mutate 안에서 computeRoomPlan → applyRoomPlan → reflowOrigins 실행 (undo 1스텝), 경고 배열 반환
- [x] libraryPanel.js / planView.js: 배치 후 경고 toast
- [x] 검증: 5점 배치 → 벽 분배(2/2/1)·배율 3.5 크기·방 크기 산정까지 한 번에, undo 1스텝

## B2. 섹션 텍스트 자동 생성·배치
- [x] autoLayout.js: `ensureSectionText(project, roomId)` — role:'section' 텍스트 없으면 생성(다른 방 섹션 텍스트 스타일 복사, 없으면 기본값), 입구 벽 문 옆에 배치
- [x] layoutRoom / layoutAll / assignToRoom 에서 reflowOrigins 후 호출
- [x] 검증: 그룹핑으로 만든 새 방에 섹션명 텍스트 생성 + 기존 방 스타일 복사 확인

## B3. 드래그 → 섹션 선택 팝업
- [x] libraryPanel.js: 체크된 여러 점 드래그 시 `text/artwork-ids`(JSON) 전달 + `openAssignPopup(ids)` 모달
- [x] app.js: 작업영역(#workarea) 드롭 → 팝업 (평면도 방 위 직접 드롭은 기존대로 즉시 배치)
- [x] planView.js: 방 히트 시 stopPropagation·다중 id 지원, 미히트 시 버블 → 팝업
- [x] 검증: 단일/다중 드래그, 팝업 배치, 평면도 직접 드롭 회귀 없음

## 공통
- [x] 라운드트립·콘솔 클린, 시맨틱 커밋 (B1~B3)

---

# v1.6 패치 체크리스트 — 문 시스템·천장 (미술관메이커_개발지시문_패치_v1.6.md)

이번 세션 범위: **P1(문) + P2(천장)만.** P3(미디어 룸)·P4(피날레)는 다음 세션.
확정 결정(사용자 승인 2026-07-13): 문 모델 = `exitDoor` 최소 확장(`displayDir` 추가) · 조명 소품 = 절차적 생성.
구현·커밋 순서: P1-5 → P1-3 → P1-1 → P1-4 → P1-2 → P2.

## 승인 시 추가된 제약 — 검증 필수 (사용자 지시 2026-07-13)
- [ ] **C1. 기존 방 자동 이동 금지 (P1-4·P1-1 공통).** 문 연결·드래그가 기존 방 이동을 요구하면 절대 자동 이동하지 않는다. 반드시 "방 OO를 이동합니다" 확인 다이얼로그를 거친다. 대상 방이 다른 문으로 이미 연결되어 있거나 이동할 공간이 없으면 이동 자체를 차단하고 배치 불가(빨강) 처리. 드래그로 코너를 넘어 벽이 바뀌는 경우도 동일 — 연결된 방이 그 위치에 맞닿을 수 없으면 그 벽 구간을 배치 불가로 표시.
- [ ] **C2. lintel 상단 몰딩 최소주의 (P1-5).** lintel 몰딩은 스펙 외 항목. 구 프로젝트를 열 때 문 주변 외관 변화가 "가로 띠 버그 제거 + 몰딩 정리" 수준을 넘지 않게 한다. 넘을 것 같으면 lintel 몰딩은 제외. vincent-demo 로 before/after 육안 비교로 확인.

## P1-5. 문 개구부 몰딩 관통 수정 ✅ (커밋 완료)
- [x] world.js `addGoldTrim`: 골드 걸레받이(낮은 띠)만 개구부 구간 절단 (openings 전달·subtractIntervals 재사용). 원인=로비 골드 걸레받이 #c9a24c 18m 단일 박스가 입장 문(z=0) 가로지름(scene 질의로 확정)
- [x] 코니스(상단)는 문 위 상인방 벽에 붙어 뜨지 않으므로 **연속 유지**(자르면 문 위 금선 틈 발생)
- [x] **C2 준수**: lintel 상단 몰딩은 스펙 외·버그 아님 → 제외(외관 드리프트 회피). 일반 방은 로비 골드트림 없고 걸레받이가 세그먼트별이라 관통 없음(회귀 없음)
- [x] 검증: vincent-demo 로비 문 before/after(가로 띠 제거, 코니스·벽·카펫 불변), scene 질의로 개구부 가로지르는 장식 띠 0, 콘솔 클린
- [x] 커밋 `fix(v1.6): P1-5 …`

## P1-3. 평면도 문 마커 시인성
- [ ] planView.js: 주황 전용색 + 확대 + 양쪽/한쪽 화살표 + 선택 시 벽 구간 강조
- [ ] 줌 레벨 무관 최소 픽셀 크기 보장, 마커 크기 상수 분리
- [ ] 검증: 줌 인/아웃 스크린샷에서 문 식별, 작품/벽 마커와 구분
- [ ] 커밋 `feat(v1.6): P1-3 …`

## P1-1. 평면도 문 전방향 드래그
- [ ] planView.js `_dragDoor`: 둘레 최근접 세그먼트 스냅 + 코너 넘으면 인접 벽 전환(문 방향 자동)
- [ ] 실시간 제약: 코너 최소거리·문 겹침·공유구간(두 방 맞닿은 구간) → 위반 시 빨강, 드롭 시 마지막 유효 위치 복귀
- [ ] **C1 준수**: 벽 전환 위치에서 연결 방이 못 맞닿으면 그 벽 구간 배치 불가(빨강). 방 자동 이동 없음
- [ ] 동서남북 버튼 보조 유지 (클릭 = 벽 중앙 배치)
- [ ] 검증: 4벽 드래그·코너 전환·불가 위치 빨강·복귀, 단방향 문도 드래그
- [ ] 커밋 `feat(v1.6): P1-1 …`

## P1-4. 마지막 방 문 생성 제한 해제
- [ ] app.js: 룸 속성 `isLast` 게이팅 제거 — 어느 방·어느 벽이든 문 설정 가능
- [ ] 반대편 인접 방 있으면 연결, 없으면 "연결할 방 선택" UI
- [ ] **C1 준수**: 선택 방을 자동 이동하지 않음 — 확인 다이얼로그 + 이미 연결됨/공간 없음이면 차단·배치 불가
- [ ] 방 생성 순서와 문 가능 여부 종속 제거
- [ ] 검증: 마지막 방에 문 생성, 연결 UI, C1 다이얼로그·차단 동작
- [ ] 커밋 `feat(v1.6): P1-4 …`

## P1-2. 단방향 문
- [ ] schema.js: `exitDoor.displayDir: 'both'|'a'|'b'` (기본 both, 구 프로젝트 외관 불변)
- [ ] world.js: 숨김 쪽 단면 벽 패치(벽 스타일 + 걸레받이·몰딩 연속), 표시 쪽은 일반 문
- [ ] controls.js: 단방향 콜라이더(숨김→표시 차단, 표시→숨김 통과)
- [ ] placementRules.js/autoLayout.js: 문 회피에서 숨김 쪽은 벽 취급(작품 걸기 허용)
- [ ] planView.js: 반쪽 화살표 아이콘으로 단방향 구분
- [ ] 텔레포트(T) 문 방향 무관 동작 확인 (현행 유지)
- [ ] 검증: 1↔11 "11번에서만 보임" → 1번에서 완전한 벽(통과 불가·몰딩 연속·작품 걸기), 11번에서 문·통과, 라운드트립
- [ ] 커밋 `feat(v1.6): P1-2 …`

## P2. 천장 시스템
- [ ] schema.js: `ceilingStyle{color,lightIntensity,fixture,muralImage}` + normalize/ensure (기본 color #ece4d6, lightIntensity 1.0 = 현행)
- [ ] world.js: 천장 색 = ceilingStyle.color (하드코딩 대체)
- [ ] world.js: lightIntensity = 방 mood 포인트라이트 배수 = **범용 방 조명 제어(P3 재사용 전제)**
- [ ] world.js: 절차적 조명 소품 3~4종(중앙 자동 스냅, 방 간 지오메트리 공유, emissive + 방당 포인트라이트 ≤1)
- [ ] world.js/main.js: 천장화 이미지 텍스처(최대 2048px, 용량 안내) 전체/중앙 패널
- [ ] app.js: renderAtmosphere 에 "천장" 그룹(색·밝기·소품·천장화) + 전체 일괄 버튼 (바닥 UI 패턴 재사용)
- [ ] 검증: 방별 색·밝기·소품·천장화 개별 적용, 소품 10개 배치해도 에셋 1개분, 라운드트립, 콘솔 클린
- [ ] 커밋 `feat(v1.6): P2 …`

## 공통 (각 항목·세션 마무리)
- [ ] 저장→재로드→내보내기 라운드트립 (displayDir·ceilingStyle 확인)
- [ ] 기존 기능(자동 배치·텔레포트·평면도 인디케이터·캡션) 회귀 없음
- [ ] 유튜브 미사용이므로 내보내기 ZIP 외부 네트워크 요청 0 유지
- [ ] 세션 마무리: 완료/미완료 + 다음 시작 지점 요약 (P3~P4 인계)
