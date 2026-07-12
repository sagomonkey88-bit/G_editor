// viewer/js/artwork.js
// 액자, 매트, 명제판, 작품별 스포트라이트를 생성하고 벽에 배치.
import * as THREE from '../../vendor/three.module.js';
import { wallLeftToWorld, LAYOUT, captionStyleOf } from '../../shared/schema.js';
import { FRAME_STYLES, MATTE_BORDER } from '../../shared/placementRules.js';
import { FONT_FAMILY } from './textures.js';

// 벽은 두께 T, 경계선 기준 안쪽면은 T/2 만큼 실내로 들어와 있다.
// 작품/명제판은 그 안쪽면보다 조금 더 앞(실내쪽)에 걸어야 벽에 묻히지 않는다.
const WALL_OFF = LAYOUT.WALL_THICK / 2 + 0.03;

// 벽별: 안쪽 법선 + plane 회전
const WALL_TF = {
  north: { n: [0, 1], ry: 0 },
  south: { n: [0, -1], ry: Math.PI },
  east: { n: [-1, 0], ry: -Math.PI / 2 },
  west: { n: [1, 0], ry: Math.PI / 2 },
};

// 액자 프리셋은 shared/placementRules.js 가 단일 소스 (정면뷰와 공유 — P0)
const FRAME_STYLE = FRAME_STYLES;

const TEMP_COLOR = { warm: 0xffd9a8, neutral: 0xfff4e6, cool: 0xdfe9ff };

const _texLoader = new THREE.TextureLoader();

export function buildArtworks(scene, project, layout, ctx, resolveAsset) {
  const group = new THREE.Group(); group.name = 'artworks';
  scene.add(group);
  const anchors = []; // interact.js 용
  const spots = [];   // 조명 매니저용 {spot, roomIndex}
  const loads = [];   // 로딩 화면 진행률용: 작품 텍스처 로드 promise (항상 resolve)

  for (let ri = 0; ri < project.rooms.length; ri++) {
    const room = project.rooms[ri];
    const rect = layout.rooms[ri].rect;
    for (const aw of (room.artworks || [])) {
      const anchor = placeArtwork(group, project, aw, rect, room, ctx, resolveAsset, ri, spots, loads);
      if (anchor) anchors.push(anchor);
    }
  }
  // 로비 작품 (P3 — 포스터·키비주얼, roomIndex = -1)
  if (project.lobby && layout.lobby) {
    const roomLike = { size: { h: project.lobby.size?.h ?? 8 }, decor: { spotlights: true } };
    for (const aw of (project.lobby.artworks || [])) {
      const anchor = placeArtwork(group, project, aw, layout.lobby, roomLike, ctx, resolveAsset, -1, spots, loads);
      if (anchor) anchors.push(anchor);
    }
  }
  return { group, anchors, spots, loads };
}

function placeArtwork(group, project, aw, rect, room, ctx, resolveAsset, roomIndex, spots, loads) {
  const tf = WALL_TF[aw.placement.wall];
  if (!tf) return null;

  const scale = aw.scale || 1;
  const w = (aw.sizeCm.w / 100) * scale;
  const h = (aw.sizeCm.h / 100) * scale;
  const cy = (aw.placement.centerHeightCm ?? 150) / 100;

  const p = wallLeftToWorld(rect, aw.placement.wall, aw.placement.x);
  const nx = tf.n[0], nz = tf.n[1];
  const holder = new THREE.Group();
  holder.position.set(p.x + nx * WALL_OFF, cy, p.z + nz * WALL_OFF);
  holder.rotation.y = tf.ry;
  holder.userData.artworkId = aw.id; // P2 3D 편집 피킹용
  group.add(holder);

  const style = FRAME_STYLE[aw.frame?.style] ?? FRAME_STYLE.gold;
  const hasMatte = !!aw.frame?.matte;
  const matteBorder = hasMatte ? MATTE_BORDER : 0;

  // 매트(크림 인셋)
  if (hasMatte) {
    const matte = new THREE.Mesh(
      new THREE.PlaneGeometry(w + matteBorder * 2, h + matteBorder * 2),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(aw.frame.matteColor || '#f3ead8'), roughness: 0.95 })
    );
    matte.position.z = 0.012;
    holder.add(matte);
  }

  // 그림 면
  const picMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.6, metalness: 0 });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), picMat);
  pic.position.z = 0.02;
  holder.add(pic);

  const imgUrl = resolveAsset(ctx, aw.image);
  if (imgUrl) {
    loads.push(new Promise((resolve) => {
      _texLoader.load(imgUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        picMat.map = tex; picMat.color.set(0xffffff); picMat.needsUpdate = true;
        resolve(true);
      }, undefined, () => resolve(false)); // 실패해도 부팅은 계속
    }));
  }

  // 액자 (4 바)
  if (style) {
    const fw = style.w, fd = style.d;
    const mat = new THREE.MeshStandardMaterial({ color: style.color, metalness: style.metalness, roughness: style.roughness });
    const ow = w + matteBorder * 2, oh = h + matteBorder * 2;
    addFrameBars(holder, ow, oh, fw, fd, mat);
    if (style.double) { // 골드 이중 몰딩: 안쪽 얇은 라인
      const inner = new THREE.MeshStandardMaterial({ color: 0xe6c878, metalness: 0.6, roughness: 0.3 });
      addFrameBars(holder, ow - fw * 0.9, oh - fw * 0.9, fw * 0.35, fd * 0.6, inner, 0.015);
    }
    // 백보드
    const back = new THREE.Mesh(new THREE.BoxGeometry(ow, oh, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.9 }));
    back.position.z = -0.005; holder.add(back);
  }

  holder.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // 명제판 — 작품 오른쪽 벽면 (v1.4 P4: meta 기반 + 스타일 + 텍스트 길이 자동 크기)
  addLabel(group, project, aw, tf, p);

  // 스포트라이트
  const centerWorld = new THREE.Vector3(p.x + nx * WALL_OFF, cy, p.z + nz * WALL_OFF);
  const spot = addSpot(group, aw, centerWorld, nx, nz, room);
  if (spot && spots) spots.push({ spot, roomIndex });

  return {
    id: aw.id, artwork: aw, roomIndex,
    center: centerWorld, normal: new THREE.Vector3(nx, 0, nz),
    imageUrl: imgUrl, size: { w, h },
    rect, wall: aw.placement.wall, holder, // P2 3D 편집용
  };
}

function addFrameBars(holder, ow, oh, fw, fd, mat, zoff = 0) {
  const z = 0.02 + fd / 2 + zoff;
  const top = new THREE.Mesh(new THREE.BoxGeometry(ow + fw * 2, fw, fd), mat);
  top.position.set(0, oh / 2 + fw / 2, z);
  const bot = top.clone(); bot.position.y = -(oh / 2 + fw / 2);
  const left = new THREE.Mesh(new THREE.BoxGeometry(fw, oh, fd), mat);
  left.position.set(-(ow / 2 + fw / 2), 0, z);
  const right = left.clone(); right.position.x = ow / 2 + fw / 2;
  holder.add(top, bot, left, right);
}

// ---- 명판 (v1.4 P4) --------------------------------------------------------
// meta(한/영) + 캡션 스타일(전역/작품별) 기반. 텍스트 실측으로 명판 크기 자동 산출.
const CAPTION_TITLE_PX = { s: 24, m: 30, l: 38 }; // 1000px = 1m
const LABEL_MAX_W = 620, LABEL_MIN_W = 240, LABEL_PAD = 20;

// 표기 언어 모드에 따른 명판 줄 구성 (한글 우선·영문 폴백, 병기 시 영문 보조 줄)
function captionLines(aw, st) {
  const m = aw.meta || {};
  const c = aw.caption || {};
  const tKo = m.titleKo || '', tEn = m.titleEn || c.title || '';
  const aKo = m.artistKo || '', aEn = m.artistEn || c.artist || '';
  const year = m.year || c.year || '';
  const base = CAPTION_TITLE_PX[st.size] || 30;
  const lines = [];
  if (st.lang === 'en') {
    lines.push({ text: tEn || tKo, px: base, weight: 700, alpha: 1 });
    lines.push({ text: aEn || aKo, px: base * 0.78, weight: 500, alpha: 0.82 });
  } else if (st.lang === 'ko') {
    lines.push({ text: tKo || tEn, px: base, weight: 700, alpha: 1 });
    lines.push({ text: aKo || aEn, px: base * 0.78, weight: 500, alpha: 0.82 });
  } else { // both
    lines.push({ text: tKo || tEn, px: base, weight: 700, alpha: 1 });
    if (tKo && tEn && tEn !== tKo) lines.push({ text: tEn, px: base * 0.6, weight: 400, alpha: 0.7 });
    lines.push({ text: (aKo && aEn) ? `${aKo} · ${aEn}` : (aKo || aEn), px: base * 0.78, weight: 500, alpha: 0.82 });
  }
  if (year) lines.push({ text: year, px: base * 0.62, weight: 400, alpha: 0.62 });
  return lines.filter(l => l.text);
}

function buildLabelTexture(st, lines) {
  const family = FONT_FAMILY[st.font] || FONT_FAMILY.sans;
  const meas = document.createElement('canvas').getContext('2d');
  // 폭: 최장 줄 실측 (최대 폭 제한 — 초과분은 줄바꿈)
  let maxW = 0;
  for (const l of lines) {
    meas.font = `${l.weight} ${l.px}px ${family}`;
    maxW = Math.max(maxW, meas.measureText(l.text).width);
  }
  const W = Math.round(Math.min(LABEL_MAX_W, Math.max(LABEL_MIN_W, maxW + LABEL_PAD * 2)));
  const innerW = W - LABEL_PAD * 2;
  // 줄바꿈(문자 단위 — 한글 대응) 후 높이 산출
  const wrapped = [];
  for (const l of lines) {
    meas.font = `${l.weight} ${l.px}px ${family}`;
    let line = '';
    for (const ch of String(l.text)) {
      if (meas.measureText(line + ch).width > innerW && line) { wrapped.push({ ...l, text: line }); line = ch; }
      else line += ch;
    }
    wrapped.push({ ...l, text: line });
  }
  let H = LABEL_PAD * 2 - 6;
  for (const l of wrapped) H += l.px * 1.32;
  H = Math.round(Math.max(90, H));

  const dpr = 2;
  const cv = document.createElement('canvas');
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const op = st.bgOpacity ?? 0.96;
  const bg = st.bg === 'none' ? null : (st.bg === 'dark' ? `rgba(30,25,20,${op})` : `rgba(244,238,226,${op})`);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
  if (st.border) {
    g.strokeStyle = st.bg === 'dark' ? 'rgba(240,225,200,.55)' : 'rgba(58,44,28,.55)';
    g.lineWidth = 2; g.strokeRect(3, 3, W - 6, H - 6);
  }
  // 다크 배경 + 기본 어두운 글자색이면 가독성 보정
  const color = (st.bg === 'dark' && (st.color || '#33291f').toLowerCase() === '#33291f') ? '#F2E9DB' : (st.color || '#33291f');
  g.textBaseline = 'top';
  let y = LABEL_PAD - 4;
  for (const l of wrapped) {
    g.font = `${l.weight} ${l.px}px ${family}`;
    g.globalAlpha = l.alpha;
    g.fillStyle = color;
    g.fillText(l.text, LABEL_PAD, y);
    y += l.px * 1.32;
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, wM: W / 1000, hM: H / 1000 };
}

function addLabel(group, project, aw, tf, p) {
  const st = captionStyleOf(project, aw);
  const lines = captionLines(aw, st);
  if (!lines.length) return;
  const { tex, wM, hM } = buildLabelTexture(st, lines);
  const along = p.along; // [ux,uz] 왼→오
  const w = (aw.sizeCm.w / 100) * (aw.scale || 1);
  // 작품 오른쪽 모서리에서 0.08m 띄운 지점이 명판 왼쪽 끝이 되도록 (가변 폭 대응)
  const off = w / 2 + 0.08 + wM / 2;
  const lx = p.x + along[0] * off;
  const lz = p.z + along[1] * off;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM),
    new THREE.MeshBasicMaterial({ map: tex, transparent: st.bg === 'none' }));
  plate.position.set(lx + tf.n[0] * WALL_OFF, 1.15, lz + tf.n[1] * WALL_OFF);
  plate.rotation.y = tf.ry;
  group.add(plate);
}

function addSpot(group, aw, center, nx, nz, room) {
  if (!room.decor?.spotlights) return null;
  return makeSpotlight(group, center, {
    nx, nz, intensity: aw.light?.intensity ?? 1.2, temp: aw.light?.temp || 'warm',
    ceilingY: room.size.h - 0.25,
  });
}

// 작품·텍스트월 공용 스포트라이트 (v1.2 P4 — 타원형 웜 워시 연출 재사용)
export function makeSpotlight(group, center, { nx = 0, nz = 1, intensity = 1.2, temp = 'warm', ceilingY = 3.9 } = {}) {
  const color = TEMP_COLOR[temp] || TEMP_COLOR.warm;
  const spot = new THREE.SpotLight(color, Math.max(0.2, intensity) * 6, 9, 0.62, 0.5, 1.2);
  spot.position.set(center.x + nx * 1.6, ceilingY, center.z + nz * 1.6);
  spot.target.position.copy(center);
  spot.userData.baseIntensity = Math.max(0.2, intensity) * 6;
  group.add(spot);
  group.add(spot.target);
  return spot;
}
