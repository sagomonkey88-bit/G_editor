# v1.4 패치 컨텍스트 노트

작업 중 내린 결정과 이유. 다음 세션(사람/에이전트)이 재추론 없이 이어받기 위한 기록.

---

# v1.5 PART A 컨텍스트 노트 (자동 배치)

## 승인된 핵심 결정
- **크기 모델 방안 A 승인**: 자동 배치(A2~A4)는 작품 `sizeCm` 에 표시 크기를 굽고 `scale=1.0` 기록. shared `resolveScale` 상한[0.3,3] 미변경(surgical). A1 에는 아직 크기 로직 없음.
- 스코프: **PART A(A1~A5)만.** PART B 절대 미착수.

## A1 결정 (커밋 완료)
- **할당 = 데이터 이동**: `store.assignToRoom(ids, roomId)` 가 `_library`/다른 방/로비에서 작품을 꺼내(`_extractArt`) 대상 방 `room.artworks` 로 이동 + `route` 추가. 배치 좌표는 **자동 배치 전 임시값** — 문 없는 기본 벽(north, north에 문 있으면 east)에 `resolvePlacement` 로 균등 스프레드. 전체 mutate 1회 = undo 1스텝.
- **로비 제외**: 로비는 타이틀월 공간이라 할당 대상 아님(`roomId==='__lobby__'` 이면 early return).
- **다중 선택 UI**: 보관함(_library) 셀에만 체크박스(`.lib-check`). 셀 본문 클릭 = 인스펙터 선택(기존), 체크박스 = 배치 선택(별도, stopPropagation). 방 드롭다운은 `this.assignRoomId` 로 재렌더 후에도 유지.
- **순서 = 동선**: 보관함 셀끼리 드래그 드롭 → `reorderLibrary` 가 `_library` 배열 재정렬. 배치 시 보관함 순서대로 route 에 push → A4 시계방향 채움 순서 기준.
- **평면도 드롭**: planView `_bind` 에 canvas dragover/drop 추가 → `_hitRoom` 으로 방 판정 → `assignToRoom([id], roomId)`. 로비 위 드롭은 무시.
- **파일명 그룹핑(선택 기능)**: 정규식 `^\s*\d+\s*[_.\-]\s*([^_.\-]+)` 로 접두어 뒤 첫 세그먼트 = 섹션명. 그룹 제안 모달(`.ed-modal` 재사용) → 적용 시 같은 이름 방 있으면 재사용, 없으면 `onCreateRoom` 콜백(app.js `createRoom`)으로 생성 후 할당.
- **createRoom 추출**: app.js `btn-add-room` 핸들러 로직을 `createRoom(name)` 함수로 추출(동작 동일, 새 룸 id 반환). LibraryPanel 이 onCreateRoom 으로 재사용.
- **신규 스키마 없음** → 라운드트립 무영향. 편집 전용 `_manual` 플래그는 A5 에서 추가 예정(exporter 삭제 목록에 함께).
- 라이브 검증(preview MCP, 가짜 보관함 주입): 다중선택 배치→room.artworks 이동+스프레드+route순서, 평면도 드롭, reorder, 그룹핑(방 2개 생성+할당), undo 1스텝 복원, add-room 회귀 없음, 콘솔 클린.

## A2 결정 (커밋 완료)
- **크기 계층만.** 배치는 A3/A4. A2 산출물 = 설정 스키마 + 순수 크기함수 + 튜닝 UI. 실제 sizeCm 적용은 A4 가 `normalizedSize` 호출.
- **스키마**: `project.autoLayout{scaleSetting:3.5, gapChar:1.2, clockwise, protectManual, autoSizeRoom}` (makeAutoLayout/ensureAutoLayout). gapChar/clockwise/protectManual/autoSizeRoom 는 A3/A5 용 — 필드는 A2 에서 미리 확정(기본값 무해). 방별 오버라이드 `room.autoScale`(숫자|부재) — makeRoom 이 origin 처럼 조건부 보존, 마이그레이션 불필요(JSON 그대로 유지).
- **autoLayout.js `AUTO` 상수**(캘리브레이션, 라이브 튜닝): CHAR_HEIGHT_M 1.4, HEIGHT_MULT 2.0, REF_SCALE 3.5, CENTER_H_M 1.75(A4), CORNER_MARGIN_M 0.6, GAP_MIN_M 0.4, PANORAMA_RATIO 3.0, ROOM_ART_CAP 12.
- **목표 높이** = CHAR_HEIGHT_M × HEIGHT_MULT × (effScale/REF_SCALE). 3.5→2.8m, 3.0→2.4m, 4.0→3.2m. `normalizedSize` 는 목표높이로 h 고정, w=h×aspect(원본 _px 우선), aspect>3 파노라마는 w 상한=목표높이×3, h 비례 축소.
- **UI**: 룸 속성(Space 탭, 로비 제외)에 전역 슬라이더(드래그 중 라벨만 갱신, change 시 재렌더) + "이 방 개별 배율" 토글(on=현재 전역값 복사, off=delete autoScale) + 방별 슬라이더.
- 라이브 검증: 순수함수 값, UI 전역/방별 왕복, project-zip 라운드트립(scaleSetting 3.7·autoScale 3.3 보존), 구 프로젝트 마이그레이션, 콘솔 클린.

## A3 결정 (커밋 완료)
- **순수 계획 함수만.** `computeRoomPlan` 은 비변경 — 크기·벽 분배·경고만 반환. 실제 room.size 적용·문 offset 클램프·위치 계산은 A4.
- **입구 벽 판정**: room[0]=`south`(로비 남쪽에서 진입), 그 외 = 이전 방 exitDoor.wall 의 반대면(OPP) — 문은 공유 경계=반대 벽에서 만난다는 자유배치 불변식 이용(computeLayout 불필요).
- **사용 벽** = 4벽 − {입구, 출구}, 입구 다음부터 시계(clockwise) 순회 → 관람 시작 방향. 다 막히면 폴백 전체.
- **분배**: route(동선) 순서 정렬 → 벽 개수 균등 순차 청크(base+나머지 앞 벽). 축별 필요 길이 = 그 축 벽 중 max(Σ외곽폭 + (n−1)·gap + 2·corner). gap = CHAR_HEIGHT_M(1.4)×gapChar(1.2)=1.68m.
- **크기**: autoSizeRoom 이면 size = clamp(needed, RANGES.roomW/D[min], 20). 확대·축소 모두(재정렬 대응). off 면 현재 유지. H 는 불변.
- **경고**: needed>20(방 나누기 권장), count>ROOM_ART_CAP(12).
- **문/이웃 커플링은 A4 로 미룸**: 크기 변경 시 exitDoor.offset 클램프·overlap 경고는 apply(A4)에서 처리, 사용자가 평면도에서 미세조정(초안 철학).
- 라이브 검증: 6점 세로→west/east 3/3, 깊이 9→11.82m(3×2.42+2×1.68+1.2); 14점 가로→7/7, 깊이 20 cap + 경고 2건; autoSizeRoom off 유지.

## A4 결정 (커밋 완료)
- **`layoutRoom(store, roomId, opts)`**: computeRoomPlan(A3) → mutate 1회로 [방 크기 적용 → exitDoor.offset 클램프 → 벽별 균등 간격 배치 → reflowOrigins] 수행. undo 1스텝.
- **균등 간격**: usable = wallLen − 2·corner, g = (usable − Σ외곽폭)/(n+1), 양끝 코너여백 포함 등간격. 넘치면 g 음수 → 겹치나 벽 내 유지(경고는 A3). 중심 높이 = CENTER_H_M 1.75m 일괄(정규화 높이라 상하단 정렬).
- **크기 굽기(방안 A)**: 각 작품 sizeCm = normalizedSize, scale=1.0. 결과는 수동 배치와 동일 필드.
- **문 회피**: 배치 벽은 A3에서 입구/출구 제외 → 문 없는 벽. 별도 충돌검사 불필요(구성상 보장).
- **옵션1 재배치 `reflowOrigins(project, start)`** (schema.js): 사이징으로 방이 커지면 꽉 붙은 이웃과 겹치는 문제 해결. exitDoor 체인을 따라 origin 재계산(next 방을 문 중앙에 정렬, 인접 배치=겹침 0). origin 기반(size.w=X,size.d=Z)이라 computeLayout 자유배치 브랜치와 정합. **start=대상 인덱스 → 상류 고정·하류만 이동**("이 방 자동 정렬"). A5 "전체 자동 배치"는 start=0.
- **결정 근거**: 자유배치에서 방들이 findFreeSpot 으로 맞닿아 배치돼 제자리 확대가 로비/이웃을 침범 → 사용자 승인 하에 옵션1(사이징 후 체인 재배치) 채택.
- 라이브 검증: 6점 겹침 해소(room0 origin z=-11.82 남벽 z=0), 3방×10점 겹침·에러 0 + upstreamFixed(room1 배치 시 room0 origin 불변) + last-room 3벽(4/3/3) 분배, undo 1스텝, 콘솔 클린. 신규 스키마 없음.

## A5 결정 (커밋 완료) — PART A 완료
- **`_manual` 플래그**: elevationView `_applyMove`/`_applyScale` mutate 에서 `aa._manual=true`. exporter 에서 `delete a._manual`(배포 제외), 작업 zip 은 유지(보호 상태 재로드 후 생존). 인스펙터 속성 편집은 미표시(정면뷰 드래그만 = "직접 옮긴").
- **보호 처리**: computeRoomPlan 이 protect(=autoLayout.protectManual, 기본 on) 시 `_manual` 작품을 fixed 로 분리 — 현재 벽에 고정(위치·크기 불변, 실측 외곽으로 방 크기 계산에 포함), movable 만 벽 분배·크기 굽기. applyRoomPlan 은 movable 배치 시 그 벽 fixed 를 others 로 resolvePlacement(겹침 회피, snap:false).
- **함수 구조**: `applyRoomPlan(project, plan)`(순수 적용, reflow/mutate 없음) ← `layoutRoom`(mutate 1회: apply + reflow(idx) 하류만) / `layoutAll`(mutate 1회: 전 방 apply + reflow(0) 전체). 둘 다 undo 1스텝.
- **UI**(app.js 룸 속성 자동배치 섹션): "이 방 자동 정렬"(작품 수 표시)·"전체 미술관 자동 배치" 버튼, "방 크기 자동 조정"(autoSizeRoom)·"직접 옮긴 작품 보호"(protectManual) 토글(noUndo 저장). 전체 배치는 기존 배치 있으면 confirmDialog. 경고는 toast.
- **A3.4 해석**: per-run 다이얼로그 대신 "방 크기 자동 조정" 토글(persist)로 "크기 유지/재산정" 제공 — 가장 단순한 해석.
- 라이브 검증: 보호 ON t2 고정(x1/h90/w50)·OFF 재배치(x9.17/h175/w224); UI 4컨트롤·버튼·토글; 전체 다이얼로그+undo 1스텝; 3방 겹침 0; publish `_manual` 제거·work zip 유지·publish autoLayout 무해 잔존; 평면도 스크린샷(로비→1→2→3 체인, 겹침 0) 확인.

# v1.5 보완 패치 컨텍스트 노트 (배치 UX — 사용자 피드백 2026-07-13)

## 배경·확정 사항 (사용자 답변)
- 피드백: "선택 N점 배치"가 임시 배치(한 벽·원본 크기)에서 멈춰 자동 정렬 버튼을 따로 눌러야 했음. 섹션 텍스트도 자동으로 안 들어감.
- 확정: ①배치 즉시 자동 정렬 ②섹션 텍스트는 자동 정렬 시 생성+배치 ③드래그 드롭 시 섹션 선택 팝업.
- 기본 배율 3~3.5 요구는 기존 구현(기본 3.5)으로 충족 — 작게 보인 원인은 자동 정렬 미실행이었음.

## B1 결정 (배치 즉시 자동 정렬)
- `assignToRoom` 이 **같은 mutate 안에서** computeRoomPlan(A3) → applyRoomPlan(A4) → reflowOrigins(하류만) → ensureSectionText(B2) 실행 → undo 1스텝. 기존 임시 스프레드 배치는 유지(placement 필수 전제) 후 applyRoomPlan 이 덮어씀.
- state.js 가 editor/autoLayout.js 를 import (autoLayout 은 shared 만 의존 — 순환 없음).
- 반환값 = plan.warnings 배열. 호출부(libraryPanel 배치 버튼·그룹핑, planView 드롭)가 toast 표시.
- protectManual 등 A5 보호 규칙은 computeRoomPlan 이 그대로 적용 — 별도 처리 불필요.

## B2 결정 (섹션 텍스트 자동 생성·배치)
- `ensureSectionText(project, roomId)` (autoLayout.js): role:'section' 텍스트 없으면 생성 — **다른 방 섹션 텍스트를 donor 로 스타일·widthCm·bodyStyle·panel·light 깊은복사**, donor 없으면 ensureTexts(P4)와 동일 기본값.
- 위치는 **입구 벽**(작품이 안 걸리는 벽) 문 옆, 남는 쪽으로 DOOR_W/2+0.4m+텍스트 반폭, 벽 안 클램프, 중심 160cm. 기존 텍스트도 자동 정렬 시마다 이 위치로 **재배치**(텍스트에는 _manual 보호 개념 없음 — 자동 정렬 의미론에 포함, undo 로 복구).
- 문 로컬 좌표: 방 i>0 은 이전 방 exitDoor 를 wallLeftToWorld 로 월드 변환 후 입구 벽 역변환, 방 0 은 로비 북벽 중앙(viewer 개구부 규약). **reflowOrigins 이후 호출 필수**(origin 기반 절대좌표).
- 호출 지점: layoutRoom / layoutAll(전 방) / assignToRoom. 신규 스키마 없음(P4 texts 재사용) → 라운드트립 무영향.

## B3 결정 (드래그 → 섹션 선택 팝업)
- 드래그 데이터 확장: 체크된 셀을 끌면 `text/artwork-ids`(JSON, 보관함 순서) 동봉 — 다중 드래그. 단일 `text/artwork-id` 는 호환 유지.
- **평면도 방 위 직접 드롭 = 즉시 배치(stopPropagation)**, 방 미히트·정면뷰 등 작업영역(#workarea) 드롭 = 버블 → `library.openAssignPopup(ids)` 모달(ed-modal 재사용)에서 방 선택 후 배치. 팝업 선택값은 assignRoomId 에 저장(다음 기본값).
- 3D 프리뷰(iframe) 위 드롭은 iframe 문서로 들어가 부모가 못 받음 — 미지원(편집 뷰 영역만).

## 검증 (preview MCP, 포트 8778 — 다른 세션이 8777 점유 → launch.json 에 museum-dev-2 추가, _devserver 가 argv 포트 수용)
- 5점 배치 1클릭: west3/east2(입구남·출구북 제외), h280cm·scale1·중심175, 방 d 9→13.87, 경고 0, undo 1스텝 완전 복원(보관함·크기·텍스트 원위치)·redo 정상.
- 새 방(텍스트 0) 배치: tx-sec 생성 + donor 스타일 복사(color/widthCm/bodyStyle), 입구 벽 문 옆 배치, 3벽 분배(출구 없는 마지막 방).
- 팝업: workarea 드롭 → 모달(방 목록), 선택 배치 → 이동·재정렬·텍스트 재배치. 평면도 방 위 직접 드롭 → 팝업 없이 즉시 배치(회귀 없음).
- computeLayout overlaps 0, validate ok, 콘솔 클린.

---

## 범위
- **P5(투어 모드)는 훅 포함 전체 제외** — 사용자 지시 "p5는 실행하지 않고 나머지만". 지시문상 v1.4 는 훅만 준비하라고 했으나, 사용자 지시를 보수적으로 해석해 tourMode 필드 예약·AvatarState 모듈화도 하지 않음.

## P1 결정
- 지시문은 `floorStyle: { color, roughness, mode }` 신설을 제안하지만, 실제 벽 스키마 필드명이 `room.wall`(wallStyle 아님)이므로 **기존 `room.floor` 를 제자리 확장**했다 (v1.2 P5 에서 wall 에 color/pattern 을 제자리 확장한 전례와 일관).
  - `floor.mode`: 'preset'(목재 텍스처) | 'color'(단색) | 'custom'(업로드). 부재 시 preset==='custom' ? 'custom' : 'preset' 으로 정규화 → 구 프로젝트 외관 변화 없음.
  - `floor.color`: 기본 '#6b4a30'(월넛 베이스) — 단색 모드 첫 전환 시 어색하지 않은 값.
  - `floor.roughness`: 'matte' | 'gloss' 문자열 enum (지시문의 무광/유광 토글). 숫자가 아닌 이유: UI 가 토글이고 뷰어 재질 값(0.82/0.30)은 렌더 구현 세부사항이라 데이터에 하드코딩하지 않기 위함. mode 와 무관하게 목재/커스텀에도 적용.
- 유광 렌더: MeshStandardMaterial roughness 0.30 (envMap 없이도 포인트/스포트 라이트 하이라이트로 반사감 표현).
- "전체 일괄" = 현재 선택 공간의 floor 정의를 모든 룸+로비에 깊은복사. undo 1단계.

## P2 결정
- **단축키 = M** (지시문 1순위 T 는 기존 시계 토글 T 와 충돌 — 지시문이 지정한 대체 키).
- 스폰 포인트: 대상 공간 경계에 있는 유효 문(개구부) 중 첫 번째의 중심에서 안쪽 1.2m, 방 중앙을 바라봄. 문이 없으면 방 중앙 폴백. 로비는 기존 spawn 지점 재사용.
- `meta.allowTeleport` (기본 true=필드 부재). 에디터 설정 UI 는 **로비 속성 패널**에 배치 — 프로젝트 전역 설정 패널이 없고 로비가 프로젝트 대표 공간이라 가장 자연스러운 위치.
- 평면도 더블클릭 텔레포트는 allowTeleport 무관 동작 (에디터 전용 편의 — postMessage 'museum-teleport').
- 신규 뷰어 파일은 반드시 viewer/manifest.json 에 추가해야 Publish ZIP 에 포함됨 (exporter 가 manifest 기준 복사).

## P3 결정
- 시선 방향 = **camYaw(카메라 방향)** 사용. "지금 화면에 보이는 쪽"이 그림 배치 가늠 목적에 부합 (avatarYaw 는 이동 방향이라 뒷걸음 시 어긋남).
- 전송: 뷰어 animate 루프에서 33ms 스로틀 + 변화 있을 때만 (x/z 0.01m, yaw 0.01rad 임계).
- 오버레이는 planView 내부의 두 번째 캔버스 (pointer-events:none, 절대 위치) — 평면도 본 캔버스 렌더와 분리해 30Hz 갱신이 편집 렌더를 유발하지 않게.
- 부가 기능 중 **드래그 양방향 동기화는 구현**, 표시 on/off 토글은 생략 (UI 자리 대비 가치 낮음 — 필요 시 후속).
- 좌표 매핑: controls.pos 는 Vector2 로 .y 가 z 좌표임 (기존 코드 규약 — 주의).

## P4 결정
- `artwork.meta` 마이그레이션(ensureArtMeta): 기존 caption.title/artist 에 한글 포함(/[가-힣]/) 여부로 titleKo/titleEn 분류. source='manual', verified=false.
- **caption.title/artist/year 는 meta 와 동기화 유지** (meta 수정 시 caption 에 미러) — 라이브러리 그리드·관람 순서 목록·구버전 호환이 caption 을 참조하기 때문. 명판/자세히보기는 meta 우선.
- 명화 사전: `editor/js/artDictionary.js` (ES module, ~500점). fetch 가 아닌 정적 import — file:// 제약·CORS 회피. 에디터 전용이므로 Publish ZIP/manifest 에 미포함.
- 매칭: 파일명 → 소문자·[_-.]→공백·연도 제거 → 토큰. artistKeys 히트 후 titleKeys 커버리지 점수. 화가 없이 제목만으로도 유일 매칭이면 채택 (예: starry_night.jpg).
- AI 채우기: Anthropic Messages API 직접 호출 (`anthropic-dangerous-direct-browser-access` 헤더). API 키는 localStorage 'museum-anthropic-key' (에디터 로컬 전용). 온라인 필요 명시 + source='ai' 배지.
- captionStyle: 전역 `project.captionStyle` + 작품별 `artwork.captionStyle`('inherit' | 동형 객체). 필드: font(TEXT_FONTS 재사용), size('s'|'m'|'l'), color, bg('light'|'dark'|'none'), border(bool), lang('ko'|'en'|'both').
- 명판: 텍스트 실측 기반 자동 크기 (최대 폭 0.62m). lang='both' 는 명판에서 한글 우선 + 영문 보조 줄, 자세히 보기는 항상 병기.

## P4 구현 결과 메모
- 명화 사전: 서브에이전트 4개 병렬 생성 → 5개 배치 병합 502점(253KB — 스펙 목표 500~1,000점·200~400KB 충족). `editor/js/artDictionary.js` ES 모듈(정적 import — fetch/CORS 회피). 스키마: { artistEn/Ko, artistKeys[], titleEn/Ko, titleKeys[], year, desc }.
- 매칭 임계: 화가 히트 시 제목 키 2개 이하=1개 히트, 3개 이상=66% 커버리지. 화가 없이 제목만이면 2개 이상 전부 일치 필요. 점수 = 2(화가)+커버리지+히트×0.01 → "starry night" vs "starry night rhone" 동률 방지.
- AI 채우기: `claude-opus-4-8` + `output_config.format`(json_schema — known 플래그로 환각 억제) + `anthropic-dangerous-direct-browser-access`. 키는 localStorage 'museum-anthropic-key'.
- 명판: 텍스트 실측 → 폭 240~620px(1000px=1m) 자동, 한글 문자 단위 줄바꿈. 다크 배경 + 기본 어두운 글자색이면 가독성 자동 보정. lang='both'는 명판에서 한글 주 + 영문 보조 줄, 자세히 보기는 항상 병기.
- meta 수정 시 caption.title/artist/year 를 미러(syncCaption) — 라이브러리 그리드·관람 순서 목록이 caption 을 참조하기 때문. 인스펙터 제목/작가 직접 편집란은 meta 폼으로 대체됨(재료/소장처/크레딧/출처는 caption 유지).
- 보관함(_library) 작품도 선택·편집 가능하도록 state.selectedArtwork / inspector.find / apiSearch.findArt 에 _library 추가 (업로드 직후 배치 전에 정보 확인하는 P4 플로우 필수).
- Publish ZIP 재검증: 사전/autoMeta 미포함, docentNote 제거, meta.description·captionStyle 포함, 외부 네트워크 요청 0 (viewer/shared 에 외부 URL 없음 — 유일한 외부 호출 api.anthropic.com 은 에디터 전용 autoMeta.js).

## 검증 인프라
- `node _devserver.mjs` (포트 8777, gitignored). 에디터 http://localhost:8777/editor/index.html, 뷰어 …/viewer/index.html?src=../samples/vincent-demo/museum.json
- 백그라운드 탭 rAF 스로틀 → preview_screenshot 타임아웃 가능. renderer.render + canvas.toDataURL 로 캡처, mutate 후 ~1s 폴링 (livePreview 디바운스 300ms + 리빌드 비동기).

---

# v1.6 패치 컨텍스트 노트 (문 시스템·천장)

작업 중 내린 결정과 이유. 다음 세션(P3~P4)이 재추론 없이 이어받기 위한 기록.

## 세션 범위·승인된 결정 (2026-07-13)
- **범위: P1(문) + P2(천장)만.** P3(미디어 룸)·P4(피날레)는 다음 세션. v1.5 PART B 문서는 v1.6 으로 대체됨 — 참조 안 함. 멀티유저 투어 모드 완전 제외(훅·필드도 금지).
- **문 데이터 모델 = `exitDoor` 최소 확장** (사용자 선택). 방마다 단일 `exitDoor` 유지 + `displayDir` 필드만 추가. doors[] 배열 미채택 이유: 선형 관람 동선 모델과 정합, 자동배치/텔레포트 체인 로직 회귀 위험 최소, 완료 기준 충족. 한 방이 문 2개를 소유하는 분기는 불가하나 관람 동선에 불필요.
- **조명 소품 = 절차적 생성** (사용자 선택). 기존 로비 샹들리에(addChandelier, world.js) 코드를 일반화 — GLTFLoader/GLB 파이프라인 없음, 용량 0, 방 간 지오메트리 공유. 스펙의 "저폴리 GLB" 문구와 다르나 용량 원칙(near-0·재사용)은 충족.

## 사용자 추가 제약 (C1·C2 — checklist 검증 항목)
- **C1. 기존 방 자동 이동 금지 (P1-4·P1-1).** 문 연결/드래그가 기존 방 이동을 요구하면 자동 이동 절대 금지. "방 OO를 이동합니다" 확인 다이얼로그(기존 confirmDialog, app.js 재사용) 필수. 대상 방이 다른 문으로 이미 연결됨 OR 이동 공간 없음 → 이동 차단 + 배치 불가(빨강). 드래그 코너 전환 시에도 연결 방이 못 맞닿으면 그 벽 구간 배치 불가. → createRoom 의 findFreeSpot 자동배치 관성을 P1-4/P1-1 문 생성 경로에는 적용하지 않는다. "이동할 공간 없음" = findFreeSpot 후보 없음, "다른 문으로 이미 연결됨" = 그 방이 자신의 exitDoor 로 유효 개구부를 이미 가짐(doorCovered).
- **C2. lintel 상단 몰딩 최소주의 (P1-5).** lintel 몰딩은 스펙 외. 구 프로젝트 문 주변 변화가 "가로 띠 제거 + 몰딩 정리" 수준을 넘으면 lintel 몰딩 제외. vincent-demo before/after 육안 비교로 판단.

## 현재 구조 파악 (착수 전 조사)
- **문 = 단일 `exitDoor:{wall,offset}` 선형 체인** (schema.js makeRoom). 자유배치(origin) 이후에도 exitDoor 가 개구부 위치 결정, `doorCovered`(schema.js) 로 인접 공간 맞닿을 때만 뚫림. 로비 입장 문 = 북쪽 중앙 하드코딩(world.js).
- 결합 지점: world.js(개구부 addOpening/벽 buildWallBox/로비 addGoldTrim), planView.js(_door/_dragDoor — 현재 한 벽 고정), elevationView.js(_door — wall 일치 시), app.js(룸 속성 exit-wall/offset, isLast 게이팅), autoLayout.js(entranceWallOf/usableWalls 체인 가정), placementRules.js(resolvePlacement 단일 door 회피), teleport.js(_openings), controls.js(콜라이더 AABB, 방 무관 위치 판정).
- **조명**: 방 중앙 포인트라이트 1개 = `lighting.ambient` 세기, world.moodLights[{light,roomIndex}] 반환(모바일 라이트매니저 사용). 천장 = 0xece4d6 단색 하드코딩(world.js buildWorld 바닥/천장 루프).
- **P1-5 버그 원인 확정**: 로비 addGoldTrim 이 코니스·골드 걸레받이(y≈0.19)를 벽 전체 폭 단일 박스로 그려 입장 문 개구부를 가로지름. 일반 벽 걸레받이/몰딩은 세그먼트별이라 가로로 안 걸리나, lintel 에 상단 몰딩이 없어 문 위에서 몰딩 선이 끊김.

## 구현 설계 (항목별)
- **P1-5**: world.js 만. buildLobbyDecor→addGoldTrim 에 개구부 구간 전달(현재 openings 는 buildWorld 지역변수 — addGoldTrim 호출 시점에 넘김). 코니스·걸레받이를 subtractIntervals 로 분할. lintel 몰딩은 C2 판단 후.
- **P1-3**: planView.js 렌더만. DOOR_MARKER 상수(색·크기·최소px) 파일 상단 분리.
- **P1-1**: planView.js _dragDoor 재작성 — 둘레 파라미터화(4벽 연속 좌표), 최근접 스냅, 코너 전환 시 wall+offset 갱신. 유효성은 doorCovered + 코너 최소거리 + 문 겹침. C1: 벽 전환 후보에서 연결 방 못 맞닿으면 빨강(방 이동 안 함).
- **P1-4**: app.js. isLast 조건 제거, exit-wall/offset UI 를 마지막 방에도 노출. 연결 방 선택 UI = 인접 없을 때 방 목록 다이얼로그 → C1 규칙으로 이동 여부 결정(자동 이동 금지).
- **P1-2**: schema displayDir 추가(makeRoom exitDoor 기본 both). world.js: 개구부는 뚫되 숨김 쪽 단면 패치 메시(THREE.FrontSide/BackSide, 숨김 방 벽 스타일 텍스처 + 걸레받이·몰딩 스트립). controls.js: colliders 에 {oneWay,axis,fixed,lo,hi,hiddenSign} 태그 추가, update() 이동 판정에서 방향 게이트(숨김 쪽 좌표에서 표시 쪽으로 넘는 이동만 차단). placementRules resolvePlacement: door 회피 대상에서 "이 면이 숨김 쪽인 문" 제외. planView: 단방향 = 반쪽+한쪽 화살표.
  - **숨김/표시 방향 규약**: displayDir 'a'/'b' 는 문 소유 방(exitDoor 보유 룸) 기준과 상대 방 기준. 통행은 표시 쪽→숨김 쪽 허용(11→1), 숨김 쪽→표시 쪽 차단(1→11). 즉 "보이는 방에서 걸어 들어가고, 반대편에선 못 돌아온다".
- **P2**: schema ceilingStyle + ensureCeiling(normalizeProject 체인 추가). world.js 천장 재질 색 = ceilingStyle.color, 밝기 = 포인트라이트 × lightIntensity(0~2, 기본 1). 소품 = 절차적(공유 지오메트리 clone, emissive, 방당 포인트라이트 ≤1, 천장 중앙 자동+수동 이동). 천장화 = ceilingStyle.muralImage(asset id) → main.js preloadPatterns 에 추가, 천장 plane map(전체/중앙 패널). UI = app.js renderAtmosphere "천장" 그룹(바닥 UI 재사용) + 일괄 버튼.

## 검증 인프라 (재확인)
- `node _devserver.mjs`(포트 8777) 또는 launch.json museum-dev-2(8778, 다른 세션이 8777 점유 시). 에디터 …/editor/index.html, 뷰어 …/viewer/index.html?src=../samples/vincent-demo/museum.json
- 신규 뷰어 파일 추가 시 viewer/manifest.json 등록 필수(exporter 가 manifest 기준 복사). v1.6 은 기존 파일 수정만 예상 → manifest 변경 없음.
