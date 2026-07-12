# v1.4 패치 컨텍스트 노트

작업 중 내린 결정과 이유. 다음 세션(사람/에이전트)이 재추론 없이 이어받기 위한 기록.

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

## 검증 인프라
- `node _devserver.mjs` (포트 8777, gitignored). 에디터 http://localhost:8777/editor/index.html, 뷰어 …/viewer/index.html?src=../samples/vincent-demo/museum.json
- 백그라운드 탭 rAF 스로틀 → preview_screenshot 타임아웃 가능. renderer.render + canvas.toDataURL 로 캡처, mutate 후 ~1s 폴링 (livePreview 디바운스 300ms + 리빌드 비동기).
