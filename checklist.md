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

## A2. 기본 크기 규칙 (미착수)
## A3. 방 크기 자동 산정 (미착수)
## A4. 배치 알고리즘 (미착수)
## A5. 재배치와 되돌리기 (미착수)

## 공통 (각 항목 완료 시)
- [ ] 저장→재로드→내보내기 라운드트립
- [ ] v1.4(텔레포트/평면도 인디케이터/캡션 meta) 회귀 없음
- [ ] 항목 번호 포함 시맨틱 커밋
