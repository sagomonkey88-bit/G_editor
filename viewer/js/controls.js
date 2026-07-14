// viewer/js/controls.js
// 데스크톱 키보드 이동 + 포인터 드래그 카메라 + (M2)모바일 조이스틱.
// 3인칭 후방추적 카메라(위치·회전 댐핑) + 벽 근접 시 당겨오기.
// v1.3 P6: 수직 시점(피치, 위 ~82°) + 휠/핀치 카메라 거리 줌 + 바닥·천장·벽 관통 방지.
import * as THREE from '../../vendor/three.module.js';

// v1.1 §3.1: 충돌 반경 0.40 (통통 체형) · 카메라 추적 타깃 높이 1.0m
const WALK = 2.2, RUN = 3.6, RADIUS = 0.40;
const CAM_DIST = 4.2, HEAD_Y = 1.0;
const PIVOT_Y = HEAD_Y + 0.4;          // 카메라 궤도 중심 (머리 위)
const CAM_MIN = 0.8, CAM_MAX = 7.0;    // 휠 줌 거리 범위 (1인칭 근접 ~ 넓은 3인칭)
const PITCH_UP_MAX = 1.43;             // 위 약 82° (완전 수직 제외 — 멀미 방지)
const PITCH_DOWN_MAX = -0.6;           // 아래 약 34°
const PITCH_DEFAULT = -0.23;           // 기존 프레이밍과 동등한 살짝 내려다보기
const FLOOR_Y = 0.35, CEIL_SAFE = 3.3; // 카메라 바닥/보수적 천장 한계
const SIT_Y = 0.32;                    // P3-2 착석 시 아바타 높이(좌석에 앉은 느낌)
const FLOAT_ACC = 2.4, FLOAT_MAXV = 2.0, FLOAT_R = 14; // P4-3 부유: 가속·최고속·구형 경계 반경

export class PlayerControls {
  constructor(avatar, camera, colliders, dom, opts = {}) {
    this.avatar = avatar;
    this.camera = camera;
    this.colliders = colliders;
    this.oneWayColliders = opts.oneWayColliders || []; // P1-2: 단방향 문 (숨김→보이는 쪽 통행 차단)
    this.dom = dom;
    this.pos = new THREE.Vector2(opts.spawnX || 0, opts.spawnZ || 0);
    this.camYaw = Math.PI;        // 북(-Z)을 바라봄
    this.camPitch = PITCH_DEFAULT;
    this.camDist = CAM_DIST;
    this.camDistTarget = CAM_DIST;
    this.avatarYaw = Math.PI;
    this.camPos = new THREE.Vector3();
    this.enabled = true;
    this.moving = false;
    this.seated = false; // P3-2 착석 상태
    this.floatMode = false; // P4-3 피날레 부유 모드
    this.keys = new Set();
    this.joy = { active: false, x: 0, y: 0 };   // 모바일 조이스틱 (-1..1)
    this._drag = { on: false, px: 0, py: 0, moved: 0 };
    this._pts = new Map();        // P6: 활성 포인터 (이동 중 두 손가락 핀치 감지)
    this._pinch = null;
    this._manualUntil = 0;
    this._t = 0;

    const f = this._forward(this.camYaw);
    this.camPos.set(this.pos.x - f.x * CAM_DIST, PIVOT_Y + 1.0, this.pos.y - f.y * CAM_DIST);
    camera.position.copy(this.camPos);
    avatar.position.set(this.pos.x, 0, this.pos.y);
    avatar.rotation.y = this.avatarYaw;

    this._bind();
  }

  _forward(yaw) { return { x: Math.sin(yaw), y: Math.cos(yaw) }; }
  _right(yaw) { const f = this._forward(yaw); return { x: -f.y, y: f.x }; }

  _bind() {
    this._onKey = (e, down) => {
      const k = e.key.toLowerCase();
      const map = { w: 1, a: 1, s: 1, d: 1, arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1, shift: 1 };
      if (!map[k]) return;
      if (down) this.keys.add(k); else this.keys.delete(k);
    };
    this._kd = (e) => this._onKey(e, true);
    this._ku = (e) => this._onKey(e, false);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);

    this.dom.addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('.no-cam-drag')) return;
      this._pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pts.size === 2) {
        // P6: 이동 중 두 손가락 핀치 = 카메라 거리 (감상 모드 핀치와 모드가 달라 충돌 없음)
        const [a, b] = [...this._pts.values()];
        this._pinch = { d: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1), dist: this.camDistTarget };
        this._drag.on = false;
      } else {
        this._drag.on = true; this._drag.px = e.clientX; this._drag.py = e.clientY; this._drag.moved = 0;
      }
    });
    this._pm = (e) => {
      if (this._pts.has(e.pointerId)) this._pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pinch && this._pts.size === 2) {
        const [a, b] = [...this._pts.values()];
        const d = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
        // 벌림 = 확대 = 가까워짐 (감상 모드 핀치와 방향 일관)
        this.camDistTarget = clamp(this._pinch.dist * (this._pinch.d / d), CAM_MIN, CAM_MAX);
        return;
      }
      if (!this._drag.on) return;
      const dx = e.clientX - this._drag.px;
      const dy = e.clientY - this._drag.py;
      this._drag.moved += Math.abs(dx) + Math.abs(dy);
      this.camYaw -= dx * 0.006;
      // P6: 수직 드래그 = 피치 (위로 드래그 = 위 보기, 위 ~82°까지)
      this.camPitch = clamp(this.camPitch - dy * 0.004, PITCH_DOWN_MAX, PITCH_UP_MAX);
      this._drag.px = e.clientX; this._drag.py = e.clientY;
      this._manualUntil = this._t + 1.6;
    };
    this._pu = (e) => {
      this._pts.delete(e.pointerId);
      if (this._pts.size < 2) this._pinch = null;
      if (this._pts.size === 1) {
        const [p] = [...this._pts.values()];
        this._drag.on = true; this._drag.px = p.x; this._drag.py = p.y;
      } else {
        this._drag.on = false;
      }
    };
    window.addEventListener('pointermove', this._pm);
    window.addEventListener('pointerup', this._pu);
    window.addEventListener('pointercancel', this._pu);

    // P6: 마우스 휠 = 카메라 거리. 휠 당김(deltaY>0) = 가까워짐 · 밀기 = 뒤로 (스펙 규약)
    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.88 : 1 / 0.88;
      this.camDistTarget = clamp(this.camDistTarget * f, CAM_MIN, CAM_MAX);
    };
    this.dom.addEventListener('wheel', this._onWheel, { passive: false });
  }

  dispose() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('pointermove', this._pm);
    window.removeEventListener('pointerup', this._pu);
    window.removeEventListener('pointercancel', this._pu);
    this.dom.removeEventListener('wheel', this._onWheel);
  }

  setJoystick(x, y) { this.joy.active = (x || y) ? true : false; this.joy.x = x; this.joy.y = y; }

  // P2(v1.4): 순간이동 — 위치/방향 설정 + 카메라 즉시 스냅 (스폰 방향 리셋)
  teleport(x, z, yaw) {
    this.pos.set(x, z);
    if (typeof yaw === 'number') {
      this.avatarYaw = yaw;
      this.camYaw = yaw;
      this.avatar.rotation.y = yaw;
      this.camPitch = PITCH_DEFAULT;
    }
    this.avatar.position.set(x, 0, z);
    this._follow(100); // dt 크게 → 감쇠 계수 ≈1, 카메라 하드 스냅
  }

  // P3-2: 벤치 착석 — 스크린(yaw) 향해 앉고 카메라 보정. 이동 입력 시 자동 일어나기.
  sit(x, z, yaw) {
    this.seated = true;
    this.pos.set(x, z);
    this.avatarYaw = yaw; this.camYaw = yaw;
    this.avatar.rotation.y = yaw;
    this.camPitch = -0.02;              // 살짝 위 = 스크린 향함
    this.camDistTarget = Math.min(this.camDistTarget, 2.6);
    this.avatar.position.set(x, SIT_Y, z);
    this._follow(100);
  }
  stand() {
    if (!this.seated) return;
    this.seated = false;
    // 벤치 뒤(스크린 반대)로 물러나 벤치 콜라이더에서 벗어남
    const f = this._forward(this.avatarYaw);
    this.pos.set(this.pos.x - f.x * 0.85, this.pos.y - f.y * 0.85);
    this.avatar.position.set(this.pos.x, 0, this.pos.y);
    this.camDistTarget = CAM_DIST;
  }

  // P4-3: 피날레 부유 모드 — 중력/충돌 off, 사인 보빙 + 관성 유영 + 구형 경계.
  enterFloat(cx, cz) {
    this.floatMode = true; this.seated = false;
    this.floatCenter = { x: cx, z: cz };
    this.floatVel = { x: 0, y: 0 };
    this.floatT = 0; this.floatBaseY = 1.2;
    this.pos.set(cx, cz);
    this.camPitch = -0.05; this.camDistTarget = CAM_DIST;
  }
  exitFloat() { this.floatMode = false; this.avatar.position.y = 0; }

  _updateFloat(dt) {
    this.floatT += dt;
    const inp = this._inputVector();
    const f = this._forward(this.camYaw), r = this._right(this.camYaw);
    let ax = f.x * inp.fwd + r.x * inp.str, az = f.y * inp.fwd + r.y * inp.str;
    const len = Math.hypot(ax, az);
    this.moving = len > 0.01;
    if (this.moving) { ax /= len; az /= len; this.floatVel.x += ax * FLOAT_ACC * dt; this.floatVel.y += az * FLOAT_ACC * dt; this.avatarYaw = Math.atan2(ax, az); }
    const damp = Math.pow(0.86, dt * 60);
    this.floatVel.x *= damp; this.floatVel.y *= damp;
    const vl = Math.hypot(this.floatVel.x, this.floatVel.y);
    if (vl > FLOAT_MAXV) { this.floatVel.x *= FLOAT_MAXV / vl; this.floatVel.y *= FLOAT_MAXV / vl; }
    this.pos.x += this.floatVel.x * dt; this.pos.y += this.floatVel.y * dt;
    // 구형(원형) 경계 — 부드럽게 되밀림
    const dx = this.pos.x - this.floatCenter.x, dz = this.pos.y - this.floatCenter.z, d = Math.hypot(dx, dz);
    if (d > FLOAT_R) { const push = d - FLOAT_R; this.pos.x -= (dx / d) * push; this.pos.y -= (dz / d) * push; this.floatVel.x *= -0.25; this.floatVel.y *= -0.25; }
    const bob = Math.sin(this.floatT * 0.85) * 0.2;
    this.avatar.position.set(this.pos.x, this.floatBaseY + bob, this.pos.y);
    this.avatar.rotation.y = smoothAngle(this.avatar.rotation.y, this.avatarYaw, dt * 4);
    if (this.avatar.userData.update) this.avatar.userData.update(dt, this.moving, 0.4);
    if (this.moving && this._t > this._manualUntil) this.camYaw = smoothAngle(this.camYaw, this.avatarYaw, dt * 1.5);
    this._followFloat(dt, bob);
  }
  _followFloat(dt, bob) {
    const headY = this.floatBaseY + bob + 1.0;
    const f = this._forward(this.camYaw), p = this.camPitch, edist = 4.2;
    const tx = this.pos.x - f.x * Math.cos(p) * edist;
    const tz = this.pos.y - f.y * Math.cos(p) * edist;
    const ty = headY + 0.4 - Math.sin(p) * edist;
    const kp = 1 - Math.exp(-dt * 5);
    this.camPos.x += (tx - this.camPos.x) * kp;
    this.camPos.y += (ty - this.camPos.y) * kp;
    this.camPos.z += (tz - this.camPos.z) * kp;
    const shx = Math.sin(this.floatT * 1.3) * 0.05, shy = Math.sin(this.floatT * 0.9 + 1) * 0.06; // 무중력 미세 흔들림
    this.camera.position.set(this.camPos.x + shx, this.camPos.y + shy, this.camPos.z);
    this.camera.lookAt(this.pos.x, headY, this.pos.y);
    this.avatar.visible = true;
  }

  _inputVector() {
    let fwd = 0, str = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) fwd += 1;
    if (k.has('s') || k.has('arrowdown')) fwd -= 1;
    if (k.has('d') || k.has('arrowright')) str += 1;
    if (k.has('a') || k.has('arrowleft')) str -= 1;
    if (this.joy.active) { str += this.joy.x; fwd += -this.joy.y; }
    return { fwd, str, run: k.has('shift') };
  }

  _circleHit(x, z) {
    for (const c of this.colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < RADIUS * RADIUS) return true;
    }
    return false;
  }

  // P1-2: 단방향 문 통행 판정. 숨김 쪽(hiddenSign 방향)에서 보이는 쪽으로 넘는 이동만 차단
  // (숨김 쪽에서는 벽처럼 R 지점에서 멈춤). 보이는 쪽→숨김 쪽 통과는 허용.
  _oneWayHit(nx, nz, ox, oz) {
    const R = RADIUS;
    for (const c of this.oneWayColliders) {
      if (c.axis === 'H') {
        if (nx < c.lo - R || nx > c.hi + R) continue;
        const dOld = (oz - c.fixed) * c.hiddenSign, dNew = (nz - c.fixed) * c.hiddenSign;
        if (dOld > 0 && dNew < dOld && dNew < R) return true;
      } else {
        if (nz < c.lo - R || nz > c.hi + R) continue;
        const dOld = (ox - c.fixed) * c.hiddenSign, dNew = (nx - c.fixed) * c.hiddenSign;
        if (dOld > 0 && dNew < dOld && dNew < R) return true;
      }
    }
    return false;
  }

  update(dt) {
    this._t += dt;
    if (!this.enabled) {
      // 오토워크 등 외부 구동 시: pos/avatarYaw 를 아바타 메시에 반영 + 카메라 팔로우
      this.avatar.position.x = this.pos.x; this.avatar.position.z = this.pos.y;
      this.avatar.rotation.y = smoothAngle(this.avatar.rotation.y, this.avatarYaw, dt * 10);
      this._follow(dt); return;
    }
    // P4-3: 피날레 부유 모드 (중력/충돌 off)
    if (this.floatMode) { this._updateFloat(dt); return; }

    const inp = this._inputVector();
    // P3-2: 착석 중 — 이동 입력이 있으면 일어나고, 없으면 앉은 자세 유지(카메라는 스크린 향함)
    if (this.seated) {
      if (Math.abs(inp.fwd) > 0.15 || Math.abs(inp.str) > 0.15) {
        this.stand();
      } else {
        this.avatar.position.set(this.pos.x, SIT_Y, this.pos.y);
        this.avatar.rotation.y = smoothAngle(this.avatar.rotation.y, this.avatarYaw, dt * 10);
        if (this.avatar.userData.update) this.avatar.userData.update(dt, false, 0);
        this._follow(dt);
        return;
      }
    }
    const f = this._forward(this.camYaw), r = this._right(this.camYaw);
    let mx = f.x * inp.fwd + r.x * inp.str;
    let mz = f.y * inp.fwd + r.y * inp.str;
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.001;

    if (this.moving) {
      mx /= len; mz /= len;
      const speed = (inp.run ? RUN : WALK) * Math.min(1, len);
      let nx = this.pos.x + mx * speed * dt;
      if (!this._circleHit(nx, this.pos.y) && !this._oneWayHit(nx, this.pos.y, this.pos.x, this.pos.y)) this.pos.x = nx;
      let nz = this.pos.y + mz * speed * dt;
      if (!this._circleHit(this.pos.x, nz) && !this._oneWayHit(this.pos.x, nz, this.pos.x, this.pos.y)) this.pos.y = nz;
      this.avatarYaw = Math.atan2(mx, mz);
    }

    this.avatar.rotation.y = smoothAngle(this.avatar.rotation.y, this.avatarYaw, dt * 10);
    this.avatar.position.x = this.pos.x;
    this.avatar.position.z = this.pos.y;
    if (this.avatar.userData.update) this.avatar.userData.update(dt, this.moving, 1);

    if (this.moving && this._t > this._manualUntil) {
      this.camYaw = smoothAngle(this.camYaw, this.avatarYaw, dt * 2.2);
    }
    this._follow(dt);
  }

  // P6: 피벗(머리 위 1.4m) 중심 궤도 카메라 — camera = pivot - viewDir·edist, lookAt(pivot).
  // 시선 피치가 정확히 camPitch 로 유지되고, 바닥/천장/벽 관통은 edist 축소로 방지
  // (방향 유지 스케일이라 피치는 변하지 않는다).
  _follow(dt) {
    if (!isFinite(this.camYaw)) this.camYaw = isFinite(this.avatarYaw) ? this.avatarYaw : Math.PI;
    if (!isFinite(this.camPitch)) this.camPitch = PITCH_DEFAULT;
    // 휠/핀치 거리 부드러운 전환
    this.camDist += (this.camDistTarget - this.camDist) * (1 - Math.exp(-dt * 8));
    const p = this.camPitch;
    const f = this._forward(this.camYaw);
    const headX = this.pos.x, headZ = this.pos.y;

    let edist = this.camDist;
    // 바닥 관통 방지 (위 보기: 카메라가 내려감)
    if (p > 0.05) edist = Math.min(edist, (PIVOT_Y - FLOOR_Y) / Math.sin(p));
    // 보수적 천장 관통 방지 (아래 보기: 카메라가 올라감 — 최저 룸 높이 3.5m 기준)
    if (p < -0.05) edist = Math.min(edist, (CEIL_SAFE - PIVOT_Y) / Math.sin(-p));

    // 벽 충돌: 수평 투영 경로 레이마치(고정 0.18m 스텝) → 유효 거리 축소.
    // 백오프 0.35m — 니어클립이 벽을 뚫지 않을 여유 확보.
    const horiz = Math.cos(p) * edist;
    if (horiz > 0.05) {
      for (let t = 0.18; t <= horiz; t += 0.18) {
        const sx = headX - f.x * t, sz = headZ - f.y * t;
        if (this._segHit(sx, sz)) {
          edist *= Math.max(0.3, t - 0.35) / horiz;
          break;
        }
      }
    }

    const targetX = headX - f.x * Math.cos(p) * edist;
    const targetZ = headZ - f.y * Math.cos(p) * edist;
    const targetY = Math.max(FLOOR_Y, PIVOT_Y - Math.sin(p) * edist);

    const kp = 1 - Math.exp(-dt * 6);
    this.camPos.x += (targetX - this.camPos.x) * kp;
    this.camPos.y += (targetY - this.camPos.y) * kp;
    this.camPos.z += (targetZ - this.camPos.z) * kp;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(headX, PIVOT_Y, headZ);
    // 근접(준1인칭) 또는 고피치(위 보기)에서는 아바타가 시야를 가리므로 숨김
    this.avatar.visible = edist > 0.95 && p < 1.05;
  }

  _segHit(x, z) {
    const M = 0.15;
    for (const c of this.colliders) {
      if (x > c.minX - M && x < c.maxX + M && z > c.minZ - M && z < c.maxZ + M) return true;
    }
    return false;
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function smoothAngle(cur, target, k) {
  if (!isFinite(target)) return isFinite(cur) ? cur : 0;
  if (!isFinite(cur)) return target;
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, k);
}
