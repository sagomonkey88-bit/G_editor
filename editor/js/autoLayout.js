// editor/js/autoLayout.js — 자동 배치 계산 모듈 (v1.5 PART A).
// A2 크기 규칙(높이 정규화 + 파노라마 예외) · A3 방 크기 산정 · A4 배치 알고리즘의 순수 함수.
// 크기 모델 방안 A: 자동 배치는 작품 sizeCm 에 표시 크기를 굽고 scale=1.0 으로 기록한다
// (shared resolveScale 상한을 건드리지 않기 위함). viewer 는 이 모듈을 쓰지 않는다(에디터 전용).
import { RANGES, LAYOUT, TEXT_DEFAULTS, reflowOrigins, computeLayout, wallLeftToWorld, wallLength, makeText } from '../../shared/schema.js';
import { FRAME_STYLES, MATTE_BORDER, artworkOuterSize, resolvePlacement } from '../../shared/placementRules.js';

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

// 정규화 크기 + 매트 + 액자를 합한 외곽 치수(m) — 배치·길이 계산은 외곽 기준(placementRules 와 동일).
export function autoOuter(aw, effScale) {
  const ns = normalizedSize(aw, effScale);
  const matte = aw.frame?.matte ? MATTE_BORDER : 0;
  const st = FRAME_STYLES[aw.frame?.style ?? 'gold'];
  const fw = st ? st.w : 0;
  return { w: ns.w / 100 + 2 * (matte + fw), h: ns.h / 100 + 2 * (matte + fw) };
}

// --- A3 방 크기 자동 산정 -----------------------------------------------------
const WALL_CW = ['north', 'east', 'south', 'west'];
const WALL_CCW = ['north', 'west', 'south', 'east'];
const OPP = { north: 'south', south: 'north', east: 'west', west: 'east' };

// 방의 입구 벽(이전 공간에서 들어오는 벽). room[0] 은 로비(남쪽)에서 진입,
// 그 외는 이전 방 출구 벽의 반대면(문은 공유 경계 = 반대 벽에서 만난다).
export function entranceWallOf(project, roomId) {
  const rooms = project.rooms || [];
  const i = rooms.findIndex(r => r.id === roomId);
  if (i <= 0) return 'south';
  const prevExit = rooms[i - 1]?.exitDoor?.wall;
  return prevExit ? OPP[prevExit] : null;
}

// 작품을 걸 벽 목록 — 입구/출구 벽 제외, 입구 다음부터 시계(또는 반시계) 순서.
export function usableWalls(project, room, clockwise = true) {
  const entrance = entranceWallOf(project, room.id);
  const exit = room.exitDoor?.wall || null;
  const block = new Set([entrance, exit].filter(Boolean));
  const ring = clockwise ? WALL_CW : WALL_CCW;
  const start = entrance ? (ring.indexOf(entrance) + 1) % 4 : 0;
  const ordered = [];
  for (let k = 0; k < 4; k++) ordered.push(ring[(start + k) % 4]);
  const walls = ordered.filter(w => !block.has(w));
  return walls.length ? walls : ordered.slice(); // 다 막히면 전부 사용(폴백)
}

// 방 크기 산정 + 벽 분배 계획(위치는 A4). 순수 함수(비변경).
// 반환 { roomId, size{w,d,h}, entranceWall, exitWall, walls:[{wall, items:[id]}], gap, effScale, warnings, count }
export function computeRoomPlan(project, roomId, opts = {}) {
  const room = (project.rooms || []).find(r => r.id === roomId);
  if (!room) return null;
  const AL = project.autoLayout || {};
  const autoSizeRoom = opts.autoSizeRoom ?? AL.autoSizeRoom ?? true;
  const gapChar = opts.gapChar ?? AL.gapChar ?? 1.2;
  const clockwise = opts.clockwise ?? AL.clockwise ?? true;
  const protect = opts.protect ?? AL.protectManual ?? true;
  const gap = AUTO.CHAR_HEIGHT_M * gapChar;
  const effScale = effectiveScale(project, room);
  const warnings = [];

  // route 순서(관람 동선) = 벽 채움 순서
  const routeIdx = new Map((project.route || []).map((id, i) => [id, i]));
  const ord = (a) => (routeIdx.has(a.id) ? routeIdx.get(a.id) : 1e9);
  const arts = (room.artworks || []).slice().sort((a, b) => ord(a) - ord(b));
  const N = arts.length;

  // A5: 보호(수동 조정) 작품은 현재 자리에 고정, 나머지(movable)만 분배
  const isFixed = (a) => protect && a._manual;
  const movable = arts.filter(a => !isFixed(a));
  const fixedByWall = {};
  for (const a of arts) if (isFixed(a)) (fixedByWall[a.placement.wall] = fixedByWall[a.placement.wall] || []).push(a);

  const walls = usableWalls(project, room, clockwise);
  const K = walls.length;

  // movable 개수 균등 분할 (route 순서 순차 청크 — 시계방향 벽 순서 유지)
  const dist = walls.map(w => ({ wall: w, items: [] }));
  const base = Math.floor(movable.length / K), rem = movable.length % K;
  let ci = 0;
  for (let w = 0; w < K; w++) {
    const cnt = base + (w < rem ? 1 : 0);
    for (let j = 0; j < cnt; j++) dist[w].items.push(movable[ci++]);
  }

  // 벽별 필요 길이 = movable(정규화 외곽) + 그 벽의 고정 작품(실측 외곽)
  const wallNeed = (wall, items) => {
    const fx = fixedByWall[wall] || [];
    const n = items.length + fx.length;
    if (!n) return 0;
    const movW = items.reduce((s, a) => s + autoOuter(a, effScale).w, 0);
    const fixW = fx.reduce((s, a) => s + artworkOuterSize(a).w, 0);
    return movW + fixW + (n - 1) * gap + 2 * AUTO.CORNER_MARGIN_M;
  };
  let needW = 0, needD = 0;
  const consider = new Set([...walls, ...Object.keys(fixedByWall)]);
  for (const wall of consider) {
    const items = dist.find(d => d.wall === wall)?.items || [];
    const need = wallNeed(wall, items);
    if (wall === 'north' || wall === 'south') needW = Math.max(needW, need);
    else needD = Math.max(needD, need);
  }

  const [wLo, wHi] = RANGES.roomW, [dLo, dHi] = RANGES.roomD;
  const size = { w: room.size.w, d: room.size.d, h: room.size.h };
  if (autoSizeRoom) {
    if (needW > 0) size.w = +Math.min(wHi, Math.max(wLo, needW)).toFixed(2);
    if (needD > 0) size.d = +Math.min(dHi, Math.max(dLo, needD)).toFixed(2);
  }
  if (needW > wHi + 1e-6 || needD > dHi + 1e-6)
    warnings.push(`작품이 많아 방 최대 크기(${Math.max(wHi, dHi)}m)를 넘습니다 — 방을 나누는 것을 권장합니다.`);
  if (N > AUTO.ROOM_ART_CAP)
    warnings.push(`이 방에 ${N}점 — ${AUTO.ROOM_ART_CAP}점 이하로 나누면 관람이 쾌적합니다.`);

  return {
    roomId, size, protect,
    entranceWall: entranceWallOf(project, roomId), exitWall: room.exitDoor?.wall || null,
    walls: dist.map(d => ({ wall: d.wall, items: d.items.map(a => a.id) })),
    gap, effScale, warnings, count: N,
  };
}

// --- A4 배치 알고리즘 + A5 적용 ----------------------------------------------
// A3 계획을 실제 배치로 적용: 방 크기 반영 → 문 offset 클램프 → 벽별 균등 간격 배치.
// 방안 A 로 작품 sizeCm 에 정규화 크기를 굽고 scale=1.0. 결과는 수동 배치와 동일 필드.
// A5: 보호(_manual) 작품은 크기/위치 불변, 그 벽의 고정 장애물로 취급해 나머지만 재배치.
// applyRoomPlan 은 주어진 project 를 변경(mutate 밖에서 재사용) — reflow/undo 는 호출자가 담당.
export function applyRoomPlan(project, plan) {
  const room = project.rooms.find(r => r.id === plan.roomId);
  if (!room) return;
  room.size.w = plan.size.w; room.size.d = plan.size.d;
  // 문 offset 클램프 (벽 길이 변화 대응 — 이웃/문 정합은 사용자가 평면도에서 미세조정)
  if (room.exitDoor) {
    const dl = (room.exitDoor.wall === 'north' || room.exitDoor.wall === 'south') ? plan.size.w : plan.size.d;
    room.exitDoor.offset = +Math.max(LAYOUT.DOOR_W / 2, Math.min(dl - LAYOUT.DOOR_W / 2, room.exitDoor.offset)).toFixed(2);
  }
  const byId = new Map((room.artworks || []).map(a => [a.id, a]));
  const isFixed = (a) => plan.protect && a._manual;
  for (const wp of plan.walls) {
    const items = wp.items.map(id => byId.get(id)).filter(Boolean);
    if (!items.length) continue;
    const wall = wp.wall;
    const wallLen = (wall === 'north' || wall === 'south') ? plan.size.w : plan.size.d;
    // 크기 굽기(방안 A) + 외곽 폭
    const outers = [];
    for (const a of items) {
      const ns = normalizedSize(a, plan.effScale);
      a.sizeCm = { ...a.sizeCm, w: ns.w, h: ns.h };
      a.scale = 1.0;
      outers.push(autoOuter(a, plan.effScale).w);
    }
    // 균등 간격: 양끝 코너 여백 + (n+1) 등간격. 넘치면 간격 음수 → 겹치나 벽 안 유지(경고는 A3).
    const usable = wallLen - 2 * AUTO.CORNER_MARGIN_M;
    const sumW = outers.reduce((s, w) => s + w, 0);
    const g = (usable - sumW) / (items.length + 1);
    // 이 벽의 고정 작품 = 장애물 (위치/크기 불변)
    const fixedOnWall = (room.artworks || []).filter(a => isFixed(a) && a.placement.wall === wall);
    const placed = [...fixedOnWall];
    let cursor = AUTO.CORNER_MARGIN_M + g;
    for (let i = 0; i < items.length; i++) {
      const x0 = cursor + outers[i] / 2;
      // 고정 장애물/이미 배치된 작품과 겹치면 밀어냄 (공용 규칙 재사용)
      const res = resolvePlacement({
        wallLen, wallH: room.size.h, u: x0, v: AUTO.CENTER_H_M, aw: items[i],
        others: placed, door: null, snap: false,
      });
      items[i].placement = { wall, x: +res.u.toFixed(2), centerHeightCm: Math.round(AUTO.CENTER_H_M * 100) };
      placed.push(items[i]);
      cursor += outers[i] + g;
    }
  }
}

// --- v1.5 보완 B2: 섹션 텍스트 자동 생성·배치 --------------------------------
// 입구 벽 위 문 중심의 로컬 좌표(왼→오, wallLeftToWorld 역변환). 문을 못 찾으면 벽 중앙.
function entranceDoorT(project, i, rect, wall) {
  const layout = computeLayout(project);
  let wx = null, wz = null;
  if (i === 0) {
    // 로비 → 첫 방: 문 = 로비 북벽 중앙 (viewer 개구부 규약과 동일)
    const lb = layout.lobby;
    if (lb) { wx = (lb.xMin + lb.xMax) / 2; wz = lb.zMin; }
  } else {
    const prev = project.rooms[i - 1];
    const prevRect = layout.rooms[i - 1]?.rect;
    if (prev?.exitDoor && prevRect) {
      const d = wallLeftToWorld(prevRect, prev.exitDoor.wall, prev.exitDoor.offset);
      wx = d.x; wz = d.z;
    }
  }
  if (wx === null) return wallLength(rect, wall) / 2;
  switch (wall) { // wallLeftToWorld 역변환
    case 'north': return wx - rect.xMin;
    case 'south': return rect.xMax - wx;
    case 'east': return wz - rect.zMin;
    default: return rect.zMax - wz; // west
  }
}

// 방에 role:'section' 텍스트가 없으면 생성(다른 방 섹션 텍스트 스타일 복사, 없으면 기본값),
// 자동 정렬 시마다 입구 벽(작품 없는 벽) 문 옆으로 배치. reflowOrigins 이후에 호출할 것
// (위치 계산이 origin 기반 절대좌표를 쓰기 때문).
export function ensureSectionText(project, roomId) {
  const rooms = project.rooms || [];
  const i = rooms.findIndex(r => r.id === roomId);
  if (i < 0) return;
  const room = rooms[i];
  room.texts = room.texts || [];
  let tx = room.texts.find(t => t.role === 'section');
  if (!tx) {
    const donor = rooms.filter(r => r !== room)
      .map(r => (r.texts || []).find(t => t.role === 'section')).find(Boolean);
    tx = donor
      ? makeText({
          id: 'tx-sec-' + room.id, role: 'section',
          widthCm: donor.widthCm,
          style: JSON.parse(JSON.stringify(donor.style || {})),
          ...(donor.bodyStyle ? { bodyStyle: JSON.parse(JSON.stringify(donor.bodyStyle)) } : {}),
          panel: { ...donor.panel }, light: { ...donor.light },
        })
      : makeText({ // ensureTexts(P4 마이그레이션)의 섹션 패널 기본값과 동일
          id: 'tx-sec-' + room.id, role: 'section', widthCm: 260,
          style: { italic: false, shadow: 'none', shadowColor: '', ...TEXT_DEFAULTS.secTitle },
          bodyStyle: { ...TEXT_DEFAULTS.secBody },
          panel: { align: 'left', bg: 'light' },
        });
    room.texts.push(tx);
  }
  const layout = computeLayout(project);
  const rect = layout.rooms[i]?.rect;
  if (!rect) return;
  const wall = entranceWallOf(project, roomId) || 'south';
  const len = wallLength(rect, wall);
  const doorT = entranceDoorT(project, i, rect, wall);
  const halfW = (tx.widthCm || 260) / 200; // cm → m 반폭
  // 문 옆, 공간이 더 남는 쪽. 벽 안으로 클램프.
  const side = doorT <= len / 2 ? 1 : -1;
  let x = doorT + side * (LAYOUT.DOOR_W / 2 + 0.4 + halfW);
  x = Math.max(AUTO.CORNER_MARGIN_M + halfW, Math.min(len - AUTO.CORNER_MARGIN_M - halfW, x));
  tx.placement = { wall, x: +x.toFixed(2), centerHeightCm: 160 };
}

// "이 방 자동 정렬" (A5.1) — 이 방 + 하류 재배치(상류 고정). store.mutate 1회 = undo 1스텝.
export function layoutRoom(store, roomId, opts = {}) {
  const idx = store.project.rooms.findIndex(r => r.id === roomId);
  if (idx < 0) return null;
  const plan = computeRoomPlan(store.project, roomId, opts);
  if (!plan) return null;
  store.mutate(p => {
    applyRoomPlan(p, plan);
    reflowOrigins(p, idx); // 옵션1: 크기 확대로 인한 겹침 방지 (하류만 이동)
    ensureSectionText(p, roomId); // B2: 섹션명 텍스트 생성·입구 벽 배치
  }, { detail: { autoLayout: roomId } });
  store.breakCoalesce();
  return plan;
}

// "전체 자동 배치" (A5.4) — 모든 방을 한 트랜잭션으로 정렬 후 전체 재배치. undo 1스텝.
export function layoutAll(store, opts = {}) {
  const plans = [];
  store.mutate(p => {
    for (const room of p.rooms) {
      const plan = computeRoomPlan(p, room.id, opts);
      if (plan) { applyRoomPlan(p, plan); plans.push(plan); }
    }
    reflowOrigins(p, 0); // 전체 재배치
    for (const room of p.rooms) ensureSectionText(p, room.id); // B2
  }, { detail: { autoLayoutAll: true } });
  store.breakCoalesce();
  return plans;
}
