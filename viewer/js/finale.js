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
  _startMessages(fin) {
    this.endBtn.style.display = 'none';
    this.msgEl.style.opacity = '0';
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

// ---- 프리셋 선택 ----
function pickPreset(p) {
  if (p && p !== 'random' && PRESETS[p]) return p;
  const keys = Object.keys(PRESETS);
  return keys[Math.floor(Math.random() * keys.length)];
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
  // 하늘과 바다: 새벽빛 그라디언트 + 웨이브 셰이더 바다 + 구름 스프라이트
  seasea(group, scene, cx, cz) {
    scene.background = new THREE.Color(0x9cc0e0); scene.fog = new THREE.Fog(0xcadbe8, 24, 78);
    const sky = gradientSky(0xffd9a8, 0x8fb6dc); sky.position.set(cx, 0, cz); group.add(sky);
    const wmat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { time: { value: 0 }, col: { value: new THREE.Color(0x3f6f9c) } },
      vertexShader: 'uniform float time; varying float vh; void main(){ vec3 p=position; float w=sin(p.x*0.35+time)*0.25+cos(p.y*0.3+time*1.3)*0.22; vh=w; vec3 t=vec3(p.x,p.y,w); gl_Position=projectionMatrix*modelViewMatrix*vec4(t,1.0); }',
      fragmentShader: 'varying float vh; uniform vec3 col; void main(){ gl_FragColor=vec4(col+vh*0.18, 0.9); }',
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, IS_MOBILE ? 40 : 90, IS_MOBILE ? 40 : 90), wmat);
    water.rotation.x = -Math.PI / 2; water.position.set(cx, -0.6, cz); group.add(water);
    const cloudTex = softTexture('rgba(255,255,255,.95)');
    const clouds = [];
    for (let i = 0; i < (IS_MOBILE ? 6 : 12); i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false }));
      sp.position.set(cx + (Math.random() * 2 - 1) * 30, 9 + Math.random() * 10, cz + (Math.random() * 2 - 1) * 30);
      sp.scale.set(8 + Math.random() * 8, 4 + Math.random() * 4, 1); group.add(sp); clouds.push(sp);
    }
    return (dt) => { wmat.uniforms.time.value += dt; for (const c of clouds) { c.position.x += dt * 0.6; if (c.position.x > cx + 34) c.position.x = cx - 34; } };
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
