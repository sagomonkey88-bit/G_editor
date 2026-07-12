# v1.4 패치 체크리스트 (미술관메이커_개발지시문_패치_v1.4.md)

범위: P1 → P2 → P3 → P4. **P5 는 사용자 지시로 전체 제외** (훅 준비 포함).

## P1. 바닥 색상 팔레트
- [x] schema.js: normalizeFloor 확장 — mode('preset'|'color'|'custom'), color, roughness('matte'|'gloss')
- [x] textures.js: floorStyleTexture 단색(color) 모드 분기
- [x] world.js: 바닥 재질 roughness 를 floor.roughness 에서 결정 (유광 = 은은한 반사)
- [x] app.js 분위기 패널: 바닥 단색/텍스처 전환 UI + 색상 피커/HEX/벽 팔레트 스와치 + 무광/유광 토글
- [x] "모든 공간 바닥 일괄 적용" 버튼 (undo 1단계)
- [x] 검증: 방마다 다른 바닥색 → 라이브 프리뷰 반영 → 프로젝트 zip 저장/재로드 → Publish ZIP 재현

## P2. 방 순간이동 (Room Teleport)
- [x] viewer/js/teleport.js 신설: 방 목록 모달(이름+번호), 미니 평면도 하이라이트, ↑↓/Enter/Esc/1~9
- [x] 단축키 M (T 는 기존 시계 토글과 충돌 → 지시문 대체 키), 모바일 상시 버튼(방 선택 시트)
- [x] 스폰 포인트 자동 계산 (입구 안쪽 + 방 중앙 바라봄) + 0.35s 페이드 + 카메라 리셋
- [x] controls.js: teleport(x, z, yaw) 메서드 (카메라 스냅 포함)
- [x] meta.allowTeleport 설정 (기본 on) — 에디터 로비 속성에 토글, 뷰어에서 존중
- [x] 평면도 더블클릭 → 라이브 프리뷰 텔레포트 (에디터 전용, postMessage)
- [x] manifest.json 에 teleport.js 추가 + HUD 도움말 갱신
- [x] 검증: 여러 방 미술관에서 M → 선택 → 1초 내 도착, allowTeleport=false 시 비노출

## P3. 평면도 아바타 인디케이터
- [x] viewer main.js: 프리뷰 모드에서 아바타 위치/시선(yaw) postMessage (≈30Hz, 변경 시만)
- [x] livePreview.js: museum-avatar-state 수신 → planView 전달
- [x] planView.js: 오버레이 캔버스 (pointer-events 무시) — 파란 원 + 방향 화살표 + 시야 부채꼴(약 80°)
- [x] 양방향: 인디케이터 드래그 → 3D 캐릭터 이동 (museum-teleport {x,z}, 페이드 없음)
- [x] 검증: 3D 제자리 회전 → 부채꼴 회전 동기, P2 텔레포트 후 즉시 위치 반영

## P4. 캡션 시스템 개편
- [x] schema.js: artwork.meta { titleKo, titleEn, artistKo, artistEn, year, description, source, verified } + captionStyle('inherit'|객체) + project.captionStyle 전역 기본 + ensureArtMeta 마이그레이션
- [x] 명화 사전 생성 (502점, 한/영/연도/설명 2~3문장) → editor/js/artDictionary.js (에디터 전용 — Publish ZIP 미포함)
- [x] editor/js/autoMeta.js: 파일명 파싱 + 퍼지 매칭 + AI 채우기(Anthropic API, 선택·온라인 명시)
- [x] libraryPanel.js: 업로드 시 자동 매칭 파이프라인
- [x] inspector.js: 작품 정보 편집 폼 (한/영 제목·화가, 연도, 설명 500자, source/verified 배지, 재매칭)
- [x] 캡션 스타일 편집 UI: 전역 기본 + 작품별 오버라이드 (폰트/크기/색/배경/테두리/언어 모드)
- [x] viewer artwork.js: 명판 재작성 — meta 기반 2줄(한글 우선, 영문 폴백), 텍스트 길이 자동 크기, 스타일 반영
- [x] viewer interact.js: 자세히 보기 — 한/영 병기 + description 본문
- [x] 검증: gogh_starry_night.jpg → "별이 빛나는 밤 / 빈센트 반 고흐" 자동 → 설명 수정 → 저장/재로드/Publish 유지

## 공통
- [x] 신규 필드 저장/불러오기 라운드트립 테스트 (프로젝트 zip + IndexedDB 자동저장)
- [x] 모바일(터치) 시뮬레이션: P2 방 이동 시트, P4 자세히 보기
- [x] Publish ZIP 외부 네트워크 요청 0건 확인
- [x] 커밋: 패키지 단위 시맨틱 커밋 (초기 상태 커밋 → P1 → P2 → P3 → P4)
