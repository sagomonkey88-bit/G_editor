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
