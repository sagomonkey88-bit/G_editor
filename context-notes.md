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
