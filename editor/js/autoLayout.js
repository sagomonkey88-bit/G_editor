// editor/js/autoLayout.js — 자동 배치 계산 모듈 (v1.5 PART A).
// A2 크기 규칙(높이 정규화 + 파노라마 예외) · A3 방 크기 산정 · A4 배치 알고리즘의 순수 함수.
// 크기 모델 방안 A: 자동 배치는 작품 sizeCm 에 표시 크기를 굽고 scale=1.0 으로 기록한다
// (shared resolveScale 상한을 건드리지 않기 위함). viewer 는 이 모듈을 쓰지 않는다(에디터 전용).

// 고정 캘리브레이션 상수 — 라이브 프리뷰로 실측 튜닝. 하드코딩 금지 원칙에 따라 한 곳에 모음.
export const AUTO = Object.freeze({
  CHAR_HEIGHT_M: 1.4,   // 아바타 키 기준 (controls HEAD_Y 1.0 + 머리 여유)
  HEIGHT_MULT: 2.0,     // 목표 작품 높이 = 캐릭터 키 × 이 값 (기준 배율에서)
  REF_SCALE: 3.5,       // 목표 높이 산정 기준 배율 (슬라이더 중앙)
  CENTER_H_M: 1.75,     // 작품 중심 높이 — 눈높이보다 약간 위 (A4)
  CORNER_MARGIN_M: 0.6, // 코너 여백 (A3/A4)
  GAP_MIN_M: 0.4,       // 최소 작품 간격 (A3 축소 한계)
  PANORAMA_RATIO: 3.0,  // 가로/세로 이 값 초과 = 파노라마 (폭 상한 적용)
  ROOM_ART_CAP: 12,     // 초과 시 방 분할 권장 (A3)
});

export const AUTO_SCALE_RANGE = Object.freeze([3.0, 4.0]); // A2 슬라이더 범위

// 방의 유효 배율 = 방별 오버라이드(room.autoScale) → 전역(project.autoLayout.scaleSetting) → 3.5
export function effectiveScale(project, room) {
  if (room && typeof room.autoScale === 'number') return room.autoScale;
  return project?.autoLayout?.scaleSetting ?? AUTO.REF_SCALE;
}

// 유효 배율에 상응하는 목표 작품 높이(m).
export function targetHeightM(effScale) {
  return AUTO.CHAR_HEIGHT_M * AUTO.HEIGHT_MULT * (effScale / AUTO.REF_SCALE);
}

// 작품의 원본 가로/세로 비율(폭/높이). 업로드 원본 픽셀(_px) 우선, 없으면 현재 sizeCm.
export function aspectOf(aw) {
  if (aw._px && aw._px.w > 0 && aw._px.h > 0) return aw._px.w / aw._px.h;
  if (aw.sizeCm && aw.sizeCm.w > 0 && aw.sizeCm.h > 0) return aw.sizeCm.w / aw.sizeCm.h;
  return 1;
}

// A2 높이 정규화: 목표 높이에 맞춘 표시 크기(cm) 반환. 폭은 원본 비율 유지.
// 극단적 파노라마(가로 비율 PANORAMA_RATIO 초과)는 폭 상한을 두고 높이를 비례 축소.
// 반환 { w, h } (cm) — 방안 A 로 이 값을 aw.sizeCm 에 굽고 scale 은 1.0 으로 둔다.
export function normalizedSize(aw, effScale) {
  const th = targetHeightM(effScale);
  const aspect = aspectOf(aw);
  let hM = th, wM = th * aspect;
  if (aspect > AUTO.PANORAMA_RATIO) { wM = th * AUTO.PANORAMA_RATIO; hM = wM / aspect; }
  return { w: +(wM * 100).toFixed(1), h: +(hM * 100).toFixed(1) };
}
