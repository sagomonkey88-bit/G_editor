// viewer/js/finale.js — 피날레(몽환 체험) 룸 (P4)
// 피날레 룸에 들어서면 페이드 → 미술관 지오메트리를 숨기고 전용 절차 씬을 띄운다.
// 부유 이동(controls.enterFloat) + 마무리 메시지 + "전시 마치기" → 복귀 지점 텔레포트.
// 절차적 생성만(파티클/그라디언트/셰이더) — 이미지 에셋 0. 실존 설치작품·거울 반사 미사용.
import * as THREE from '../../vendor/three.module.js';

const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

export class Finale {
  constructor(ctx) {
    this.ctx = ctx; // { scene, camera, controls, project, layout, world, arts, teleport, hudRoot }
    this.active = false;
    this.group = null;
    this.presetUpdate = null;
    this._buildDom(ctx.hudRoot);
  }

  _buildDom(root) {
    this.fade = document.createElement('div');
    this.fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .5s;z-index:70';
    root.appendChild(this.fade);
    this.msgEl = document.createElement('div');
    this.msgEl.style.cssText = 'position:fixed;left:0;right:0;top:36%;text-align:center;color:#fff;font:600 30px/1.5 Pretendard,sans-serif;opacity:0;transition:opacity 1s;pointer-events:none;z-index:71;text-shadow:0 0 18px rgba(255,255,255,.55),0 2px 12px rgba(0,0,0,.55);padding:0 22px;white-space:pre-wrap';
    root.appendChild(this.msgEl);
    this.endBtn = document.createElement('button');
    this.endBtn.className = 'no-cam-drag';
    this.endBtn.textContent = '전시 마치기';
    this.endBtn.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);display:none;z-index:71;background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.42);border-radius:24px;padding:12px 30px;font:600 15px Pretendard,sans-serif;cursor:pointer';
    this.endBtn.addEventListener('click', () => this.exit());
    root.appendChild(this.endBtn);
  }

  // roomIndex = currentRoomIndex(controls.pos) — main.js 에서 전달
  update(dt, roomIndex) {
    if (this.active) { this.presetUpdate?.(dt); return; }
    const rooms = this.ctx.project.rooms || [];
    if (roomIndex >= 0 && rooms[roomIndex]?.roomType === 'finale') this.enter(rooms[roomIndex], roomIndex);
  }

  enter(room, roomIndex) {
    if (this.active) return;
    this.active = true;
    this.room = room;
    const fin = room.finale || {};
    this.fade.style.opacity = '1';
    setTimeout(() => {
      const ctx = this.ctx;
      this._savedBg = ctx.scene.background; this._savedFog = ctx.scene.fog;
      ctx.world.group.visible = false; if (ctx.arts?.group) ctx.arts.group.visible = false;
      const rect = ctx.layout.rooms[roomIndex].rect;
      const cx = (rect.xMin + rect.xMax) / 2, cz = (rect.zMin + rect.zMax) / 2;
      this.group = new THREE.Group(); ctx.scene.add(this.group);
      this.preset = pickPreset(fin.preset);
      this.presetUpdate = PRESETS[this.preset](this.group, ctx.scene, cx, cz);
      ctx.controls.enterFloat(cx, cz);
      ctx.teleport?.setEnabled?.(false);
      this._startMessages(fin);
      setTimeout(() => { this.fade.style.opacity = '0'; }, 90);
    }, 520);
  }

  exit() {
    if (!this.active) return;
    const fin = this.room?.finale || {};
    this._stopMessages();
    this.endBtn.style.display = 'none';
    this.fade.style.opacity = '1';
    setTimeout(() => {
      const ctx = this.ctx;
      if (this.group) { ctx.scene.remove(this.group); disposeGroup(this.group); this.group = null; }
      this.presetUpdate = null;
      ctx.scene.background = this._savedBg; ctx.scene.fog = this._savedFog;
      ctx.world.group.visible = true; if (ctx.arts?.group) ctx.arts.group.visible = true;
      ctx.controls.exitFloat();
      ctx.teleport?.setEnabled?.(ctx.project.meta?.allowTeleport !== false);
      ctx.teleport?.teleportToRoom?.(fin.returnTo || '__lobby__', { fade: false });
      this.active = false;
      setTimeout(() => { this.fade.style.opacity = '0'; }, 90);
    }, 520);
  }

  // 진입 시 리빌드 등으로 강제 종료 (씬만 정리, 텔레포트 없음)
  forceReset() {
    this._stopMessages(); this.endBtn.style.display = 'none';
    if (this.group) { this.ctx.scene.remove(this.group); disposeGroup(this.group); this.group = null; }
    this.presetUpdate = null; this.active = false;
    this.fade.style.opacity = '0';
  }

  // ---- P4-4 마무리 메시지 ----
  // F10(v1.7): 메시지 스타일(폰트/크기/색/위치) 적용 — 에디터 finale.msgStyle
  _applyMsgStyle(fin) {
    const st = fin.msgStyle || {};
    this.msgEl.style.fontFamily = MSG_FONTS[st.font] || MSG_FONTS.pretendard;
    this.msgEl.style.fontSize = (MSG_SIZES[st.size] || MSG_SIZES.m) + 'px';
    this.msgEl.style.color = st.color || '#ffffff';
    this.msgEl.style.top = MSG_POS[st.pos] || MSG_POS.center;
  }

  _startMessages(fin) {
    this.endBtn.style.display = 'none';
    this.msgEl.style.opacity = '0';
    this._applyMsgStyle(fin);
    if (!fin.showMessages || !(fin.messages || []).length) {
      this._msgTimer = setTimeout(() => { this.endBtn.style.display = 'block'; }, 2600);
      return;
    }
    const dwell = Math.max(1, fin.dwellSec || 4) * 1000;
    const msgs = fin.messages;
    let i = 0;
    const showNext = () => {
      if (i >= msgs.length) { this.endBtn.style.display = 'block'; return; }
      this.msgEl.textContent = msgs[i];
      this.msgEl.style.opacity = '1';
      this._msgTimer = setTimeout(() => {
        this.msgEl.style.opacity = '0';
        this._msgTimer = setTimeout(() => { i++; showNext(); }, 1100);
      }, dwell);
    };
    this._msgTimer = setTimeout(showNext, 1800);
  }
  _stopMessages() { clearTimeout(this._msgTimer); this.msgEl.style.opacity = '0'; }
}

// F10(v1.7): 메시지 스타일 상수 (에디터 finale.msgStyle 값 → CSS)
const MSG_FONTS = {
  pretendard: 'Pretendard,sans-serif',
  serif: "'Noto Serif KR',serif",
  sans: 'Pretendard,sans-serif',
  'noto-sans': "'Noto Sans KR',sans-serif",
};
const MSG_SIZES = { s: 22, m: 30, l: 42 };
const MSG_POS = { top: '16%', center: '36%', bottom: '62%' };

// ---- 프리셋 선택 ----
// F9(v1.7): '랜덤'은 방문마다 순환 — 지난 방문과 다른 프리셋을 차례로 보여줘
// 재방문 관객이 매번 새로운 공간을 만나게 한다. (localStorage 불가 환경은 순수 랜덤)
function pickPreset(p) {
  if (p && p !== 'random' && PRESETS[p]) return p;
  const keys = Object.keys(PRESETS);
  let idx = Math.floor(Math.random() * keys.length);
  try {
    const prev = parseInt(localStorage.getItem('museum-finale-rot'), 10);
    if (isFinite(prev)) idx = (prev + 1) % keys.length;
    localStorage.setItem('museum-finale-rot', String(idx));
  } catch (e) { /* 폴백: 순수 랜덤 */ }
  return keys[idx];
}

// ---- 공용 헬퍼 ----
function gradientSky(topHex, botHex) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(topHex) }, bot: { value: new THREE.Color(botHex) } },
    vertexShader: 'varying float vy; void main(){ vy=position.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying float vy; uniform vec3 top; uniform vec3 bot; void main(){ float t=clamp(vy/60.0*0.5+0.5,0.0,1.0); gl_FragColor=vec4(mix(bot,top,t),1.0); }',
  });
  return new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), mat);
}
function starPoints(N, cx, cz) {
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 20 + Math.random() * 30, s = Math.sqrt(1 - u * u);
    pos[i * 3] = cx + r * s * Math.cos(th); pos[i * 3 + 1] = r * u + 8; pos[i * 3 + 2] = cz + r * s * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.32, sizeAttenuation: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
}
function softTexture(inner) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grd.addColorStop(0, inner); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
// F8(v1.7): 세로 그라디언트 (위 밝음 → 아래 투명) — 바다속 빛줄기용
function vGradientTexture(top) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, top); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 16, 128);
  return new THREE.CanvasTexture(c);
}
// v1.7.1: 뭉게구름 — 소프트 블롭 여러 개를 겹쳐 만든 절차 텍스처
function cloudTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  };
  blob(85, 82, 52, 0.85); blob(130, 72, 58, 0.95); blob(178, 84, 46, 0.8);
  blob(105, 58, 38, 0.75); blob(152, 52, 36, 0.75); blob(60, 92, 30, 0.6); blob(200, 95, 26, 0.55);
  return new THREE.CanvasTexture(c);
}
// v1.7.1: 갈매기 실루엣 (~ 두 날개 아치)
function birdTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = 'rgba(40,50,64,.85)'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(6, 40); g.quadraticCurveTo(20, 22, 32, 36); g.quadraticCurveTo(44, 22, 58, 40); g.stroke();
  return new THREE.CanvasTexture(c);
}
// v1.7.1: 해초 잎 — 위로 갈수록 가늘어지는 띠 (알파 테두리)
function leafTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(52,150,112,.92)'); grd.addColorStop(1, 'rgba(18,74,58,.95)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(16, 2);
  g.quadraticCurveTo(27, 44, 23, 126);
  g.lineTo(9, 126);
  g.quadraticCurveTo(5, 44, 16, 2);
  g.fill();
  return new THREE.CanvasTexture(c);
}
// v1.7.1: 코스틱스(수중 빛 그물) — 밝은 링 여러 개, 타일링·스크롤용
function causticsTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 8 + Math.random() * 22;
    g.strokeStyle = `rgba(190,240,255,${0.10 + Math.random() * 0.16})`;
    g.lineWidth = 1.5 + Math.random() * 2.5;
    g.beginPath(); g.ellipse(x, y, r, r * (0.55 + Math.random() * 0.45), Math.random() * 3, 0, 7); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---- 프리셋 3종 (각각 update(dt) 반환) ----
const PRESETS = {
  // 우주: 짙은 남색~보라 그라디언트 + 별 파티클 + 성운풍 색 안개
  space(group, scene, cx, cz) {
    scene.background = new THREE.Color(0x05030f); scene.fog = new THREE.Fog(0x1a0f3a, 18, 62);
    const sky = gradientSky(0x241a55, 0x05030f); sky.position.set(cx, 0, cz); group.add(sky);
    const stars = starPoints(IS_MOBILE ? 1400 : 3600, cx, cz); group.add(stars);
    // 성운 색 안개 스프라이트 (절차적 소프트 텍스처)
    const nebTex = softTexture('rgba(150,110,230,.5)');
    const nebs = [];
    for (let i = 0; i < (IS_MOBILE ? 5 : 10); i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebTex, color: new THREE.Color().setHSL(0.6 + Math.random() * 0.2, 0.6, 0.5), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.position.set(cx + (Math.random() * 2 - 1) * 22, 4 + Math.random() * 16, cz + (Math.random() * 2 - 1) * 22);
      sp.scale.setScalar(14 + Math.random() * 16); group.add(sp); nebs.push(sp);
    }
    return (dt) => { stars.rotation.y += dt * 0.012; for (let i = 0; i < nebs.length; i++) nebs[i].position.x += Math.sin(performance.now() * 0.0001 + i) * dt * 0.3; };
  },
  // 하늘과 바다 (F7 v1.7 개선): 위는 노을빛 하늘 + 태양, 아래는 일렁이는 바다 —
  // 구름·윤슬이 흘러가 "하늘을 날아가는" 전진감을 준다.
  seasea(group, scene, cx, cz) {
    scene.background = new THREE.Color(0x8fb6dc); scene.fog = new THREE.Fog(0xc9dcec, 30, 100);
    const sky = gradientSky(0x3d7cc0, 0xffcf96); sky.position.set(cx, 0, cz); group.add(sky); // 위 파랑 → 지평선 노을
    // 태양 + 글로우 (지평선 근처, 노을의 중심)
    const sunTex = softTexture('rgba(255,240,205,1)');
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    sun.position.set(cx + 12, 9, cz - 42); sun.scale.setScalar(16); group.add(sun);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: 0xffb070, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.copy(sun.position); glow.scale.setScalar(42); group.add(glow);
    // 바다: 다층 웨이브 + 깊이 2톤 + 시간 흐름(전진감)
    const wmat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { time: { value: 0 }, deep: { value: new THREE.Color(0x27567f) }, lite: { value: new THREE.Color(0x6ea6cc) } },
      vertexShader: 'uniform float time; varying float vh; void main(){ vec3 p=position; float w=sin(p.x*0.22+time*1.1)*0.34+cos(p.y*0.19+time*0.8)*0.28+sin((p.x+p.y)*0.09+time*0.5)*0.22; vh=w; gl_Position=projectionMatrix*modelViewMatrix*vec4(p.x,p.y,w,1.0); }',
      fragmentShader: 'varying float vh; uniform vec3 deep; uniform vec3 lite; void main(){ float t=clamp(vh*0.9+0.5,0.0,1.0); gl_FragColor=vec4(mix(deep,lite,t)+vh*0.12, 0.96); }',
    });
    // 바다는 발 아래 멀리 — 하늘을 나는 높이감 (F7)
    const WATER_Y = -3.4;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, IS_MOBILE ? 48 : 100, IS_MOBILE ? 48 : 100), wmat);
    water.rotation.x = -Math.PI / 2; water.position.set(cx, WATER_Y, cz); group.add(water);
    // 윤슬(물 위 반짝임) — 소프트 원형 글로우 포인트
    const NS = IS_MOBILE ? 90 : 220;
    const spos = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) { spos[i * 3] = cx + (Math.random() * 2 - 1) * 45; spos[i * 3 + 1] = WATER_Y + 0.45 + Math.random() * 0.2; spos[i * 3 + 2] = cz + (Math.random() * 2 - 1) * 45; }
    const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    const smat = new THREE.PointsMaterial({ map: softTexture('rgba(255,240,200,1)'), color: 0xfff0c8, size: 0.5, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    group.add(new THREE.Points(sgeo, smat));
    // 태양 아래 윤슬 길(sun glitter path) — 태양 방향 회랑에 반짝임 집중
    const dir = { x: 12, z: -42 }; const dl = Math.hypot(dir.x, dir.z); dir.x /= dl; dir.z /= dl;
    const NG = IS_MOBILE ? 60 : 140;
    const gpos = new Float32Array(NG * 3);
    for (let i = 0; i < NG; i++) {
      const along = 4 + Math.random() * 40, side = (Math.random() * 2 - 1) * 2.6;
      gpos[i * 3] = cx + dir.x * along - dir.z * side;
      gpos[i * 3 + 1] = WATER_Y + 0.5 + Math.random() * 0.15;
      gpos[i * 3 + 2] = cz + dir.z * along + dir.x * side;
    }
    const ggeo = new THREE.BufferGeometry(); ggeo.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
    const gmat = new THREE.PointsMaterial({ map: softTexture('rgba(255,225,170,1)'), color: 0xffdFa0, size: 0.7, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    group.add(new THREE.Points(ggeo, gmat));
    // 뭉게구름(블롭 합성 텍스처): 두 층 속도 차로 전진감
    const cloudTex = cloudTexture();
    const clouds = [];
    for (let i = 0; i < (IS_MOBILE ? 8 : 16); i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.55 + Math.random() * 0.35, depthWrite: false }));
      sp.position.set(cx + (Math.random() * 2 - 1) * 38, 6 + Math.random() * 16, cz + (Math.random() * 2 - 1) * 38);
      const s = 9 + Math.random() * 12; sp.scale.set(s, s * 0.5, 1); group.add(sp);
      sp.userData.sp = 1.2 + Math.random() * 1.6; clouds.push(sp);
    }
    // 갈매기 실루엣 — 천천히 활공
    const bTex = birdTexture();
    const birds = [];
    for (let i = 0; i < (IS_MOBILE ? 2 : 4); i++) {
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: bTex, transparent: true, opacity: 0.8, depthWrite: false }));
      b.position.set(cx + (Math.random() * 2 - 1) * 22, 7 + Math.random() * 8, cz + (Math.random() * 2 - 1) * 22);
      b.scale.set(1.4, 1.4, 1); b.userData = { sp: 2 + Math.random() * 1.5, ph: Math.random() * 7 };
      group.add(b); birds.push(b);
    }
    let t = 0;
    return (dt) => {
      t += dt;
      wmat.uniforms.time.value += dt;
      smat.opacity = 0.5 + 0.35 * Math.sin(t * 2.2);       // 윤슬 명멸
      gmat.opacity = 0.65 + 0.3 * Math.sin(t * 3.1 + 1);   // 태양 길 반짝임
      for (const c of clouds) { c.position.x += dt * c.userData.sp; if (c.position.x > cx + 42) c.position.x = cx - 42; }
      for (const b of birds) {
        b.position.x += dt * b.userData.sp;
        b.position.y += Math.sin(t * 1.6 + b.userData.ph) * dt * 0.5;
        if (b.position.x > cx + 26) b.position.x = cx - 26;
      }
    };
  },
  // 바다속 (F8 v1.7 신규): 위에서 스며드는 빛줄기 + 상승 기포 + 유영하는 물고기 + 플랑크톤
  ocean(group, scene, cx, cz) {
    scene.background = new THREE.Color(0x07293d); scene.fog = new THREE.Fog(0x0a3a52, 10, 50);
    const sky = gradientSky(0x2f89ad, 0x041520); sky.position.set(cx, 0, cz); group.add(sky); // 위 = 수면 빛
    // 모랫바닥 + 코스틱스(빛 그물) 두 겹 스크롤
    const SAND_Y = -2.2;
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ color: 0x1c4a5e }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(cx, SAND_Y, cz); group.add(sand);
    const causTexs = [causticsTexture(), causticsTexture()];
    const caus = causTexs.map((tex, i) => {
      tex.repeat.set(26, 26);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(120, 120),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: i ? 0.13 : 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(cx, SAND_Y + 0.02 + i * 0.02, cz); group.add(m);
      return tex;
    });
    // 해초 — 좌우로 하늘거리는 잎(테이퍼 텍스처) + 바위
    const weedMat = new THREE.MeshBasicMaterial({ map: leafTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const weeds = [];
    for (let i = 0; i < (IS_MOBILE ? 6 : 12); i++) {
      const h = 1.4 + Math.random() * 1.6;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.38 + Math.random() * 0.25, h), weedMat);
      w.geometry.translate(0, h / 2, 0); // 피벗 = 뿌리
      w.position.set(cx + (Math.random() * 2 - 1) * 15, SAND_Y, cz + (Math.random() * 2 - 1) * 15);
      w.rotation.y = Math.random() * Math.PI;
      w.userData = { ph: Math.random() * 7, sp: 0.8 + Math.random() * 0.7 };
      group.add(w); weeds.push(w);
    }
    const rockMat = new THREE.MeshBasicMaterial({ color: 0x123240 });
    const rockGeo = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < (IS_MOBILE ? 4 : 7); i++) {
      const r = new THREE.Mesh(rockGeo, rockMat);
      r.scale.set(0.5 + Math.random() * 0.9, 0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.9);
      r.position.set(cx + (Math.random() * 2 - 1) * 16, SAND_Y + 0.1, cz + (Math.random() * 2 - 1) * 16);
      group.add(r);
    }
    // 빛줄기(god ray): 세로 그라디언트 텍스처 additive 플레인
    const rayTex = vGradientTexture('rgba(190,235,255,.55)');
    const rays = [];
    for (let i = 0; i < (IS_MOBILE ? 4 : 7); i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3 + Math.random() * 3, 30),
        new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, opacity: 0.1 + Math.random() * 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(cx + (Math.random() * 2 - 1) * 16, 12, cz + (Math.random() * 2 - 1) * 16);
      m.rotation.y = Math.random() * Math.PI; m.rotation.z = (Math.random() * 2 - 1) * 0.16;
      group.add(m); rays.push(m);
    }
    // 기포: 상승 + 좌우 미세 흔들림, 위에 닿으면 아래서 재시작
    const NB = IS_MOBILE ? 80 : 200;
    const bpos = new Float32Array(NB * 3), bsp = new Float32Array(NB);
    for (let i = 0; i < NB; i++) {
      bpos[i * 3] = cx + (Math.random() * 2 - 1) * 16; bpos[i * 3 + 1] = Math.random() * 16 - 2; bpos[i * 3 + 2] = cz + (Math.random() * 2 - 1) * 16;
      bsp[i] = 0.5 + Math.random() * 1.1;
    }
    const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    const bubbles = new THREE.Points(bgeo, new THREE.PointsMaterial({ map: softTexture('rgba(210,240,255,.95)'), color: 0xbfe8f5, size: 0.22, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    group.add(bubbles);
    // 물고기: 홀로 다니는 큰 개체 + 옹기종기 회유하는 떼(school) — 절차 생성
    const fish = [];
    const fgeo = new THREE.SphereGeometry(1, 10, 8);
    const mkFish = (scale, fmat) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(fgeo, fmat); body.scale.set(0.12 * scale, 0.14 * scale, 0.34 * scale); g.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12 * scale, 0.22 * scale, 6), fmat);
      tail.rotation.x = -Math.PI / 2; tail.position.z = -0.42 * scale; g.add(tail);
      return g;
    };
    for (let i = 0; i < (IS_MOBILE ? 4 : 7); i++) {
      const col = new THREE.Color().setHSL(0.5 + Math.random() * 0.12, 0.5, 0.55 + Math.random() * 0.2);
      const g = mkFish(1.1, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
      g.userData = { r: 4 + Math.random() * 10, h: 0.5 + Math.random() * 8, sp: 0.15 + Math.random() * 0.4, ph: Math.random() * Math.PI * 2, dir: Math.random() < 0.5 ? 1 : -1 };
      group.add(g); fish.push(g);
    }
    const schools = [];
    for (let s = 0; s < (IS_MOBILE ? 1 : 3); s++) {
      const sg = new THREE.Group();
      const col = new THREE.Color().setHSL(0.52 + Math.random() * 0.1, 0.55, 0.68);
      const fmat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 });
      const members = [];
      for (let i = 0; i < 8; i++) {
        const f = mkFish(0.5, fmat);
        f.position.set((Math.random() * 2 - 1) * 1.1, (Math.random() * 2 - 1) * 0.7, (Math.random() * 2 - 1) * 1.4);
        f.userData = { ph: Math.random() * 7 };
        sg.add(f); members.push(f);
      }
      sg.userData = { r: 5 + Math.random() * 8, h: 1.5 + Math.random() * 5, sp: 0.22 + Math.random() * 0.2, ph: Math.random() * Math.PI * 2, dir: Math.random() < 0.5 ? 1 : -1, members };
      group.add(sg); schools.push(sg);
    }
    // 플랑크톤 부유 입자
    const dust = starPoints(IS_MOBILE ? 300 : 800, cx, cz);
    dust.material.size = 0.09; dust.material.opacity = 0.4; dust.material.color.set(0x9fd0e0);
    dust.material.map = softTexture('rgba(200,235,245,.9)'); dust.material.needsUpdate = true;
    group.add(dust);
    let t = 0;
    return (dt) => {
      t += dt;
      const pa = bgeo.attributes.position.array;
      for (let i = 0; i < NB; i++) {
        pa[i * 3 + 1] += bsp[i] * dt;
        pa[i * 3] += Math.sin(t * 2 + i) * dt * 0.12;
        if (pa[i * 3 + 1] > 16) pa[i * 3 + 1] = -2;
      }
      bgeo.attributes.position.needsUpdate = true;
      const swim = (g) => {
        const u = g.userData, a = u.ph + t * u.sp * u.dir;
        g.position.set(cx + Math.cos(a) * u.r, u.h + Math.sin(t * 0.7 + u.ph) * 0.4, cz + Math.sin(a) * u.r);
        g.rotation.y = Math.atan2(-Math.sin(a) * u.dir, Math.cos(a) * u.dir); // 접선(진행) 방향
      };
      for (const f of fish) swim(f);
      for (const sg of schools) {
        swim(sg);
        for (const f of sg.userData.members) f.position.y += Math.sin(t * 3 + f.userData.ph) * dt * 0.15; // 떼 내 미세 움직임
      }
      for (const w of weeds) w.rotation.z = Math.sin(t * w.userData.sp + w.userData.ph) * 0.22; // 해초 하늘거림
      caus[0].offset.set(t * 0.015, t * 0.011);  // 코스틱스 두 겹 반대 방향 스크롤
      caus[1].offset.set(-t * 0.012, t * 0.017);
      for (let i = 0; i < rays.length; i++) rays[i].rotation.z = Math.sin(t * 0.25 + i) * 0.14;
      dust.rotation.y += dt * 0.008;
    };
  },
  // 빛의 정원: 어두운 공간에 형형색색 발광 구체 수백 개 부유·명멸
  garden(group, scene, cx, cz) {
    scene.background = new THREE.Color(0x060609); scene.fog = new THREE.Fog(0x060609, 12, 52);
    const geo = new THREE.SphereGeometry(1, 12, 10);
    const N = IS_MOBILE ? 130 : 340;
    const orbs = [];
    for (let i = 0; i < N; i++) {
      const col = new THREE.Color().setHSL(Math.random(), 0.72, 0.6);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      const r = 0.12 + Math.random() * 0.4;
      m.position.set(cx + (Math.random() * 2 - 1) * 13, 0.4 + Math.random() * 9, cz + (Math.random() * 2 - 1) * 13);
      m.scale.setScalar(r);
      m.userData = { ph: Math.random() * 7, sp: 0.25 + Math.random() * 1.3, baseY: m.position.y, amp: 0.3 + Math.random() * 1.1 };
      group.add(m); orbs.push(m);
    }
    return (dt) => { for (const o of orbs) { o.userData.ph += dt * o.userData.sp; o.position.y = o.userData.baseY + Math.sin(o.userData.ph) * o.userData.amp; o.material.opacity = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(o.userData.ph * 1.7)); } };
  },
};

function disposeGroup(g) {
  g.traverse(o => {
    if (o.isMesh || o.isPoints || o.isSprite) {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m) { m.map?.dispose?.(); m.dispose?.(); }
    }
  });
}
