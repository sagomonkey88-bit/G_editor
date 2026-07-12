// viewer/js/teleport.js — 방 순간이동(v1.4 P2): 방 선택 모달 + 스폰 계산 + 페이드 전환.
// ctx = window.__museum (rebuild 시 project/layout/controls 참조가 갱신되므로 살아있는 객체를 그대로 읽는다).
import { wallLeftToWorld, doorCovered } from '../../shared/schema.js';

const FADE_OUT_MS = 180, FADE_IN_MS = 260; // 합계 ≈0.44s (스펙 0.3~0.5s)

export class Teleport {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.enabled = opts.enabled !== false;   // meta.allowTeleport (기본 on)
    this.isOpen = false;
    this.sel = 0;
    this._buildDom();
    this._bindKeys();
    if (opts.touchButton && this.enabled) this._buildButton();
  }

  // ---- 목적지 목록: 로비 + 룸 순서 ----
  destinations() {
    const rooms = this.ctx.project.rooms || [];
    return [
      { id: '__lobby__', num: '', name: '로비' },
      ...rooms.map((r, i) => ({ id: r.id, num: String(i + 1), name: r.name || `룸 ${i + 1}` })),
    ];
  }

  // ---- 유효 문 개구부 월드 좌표 목록 (스폰 계산용) ----
  _openings() {
    const { project, layout } = this.ctx;
    const ops = [];
    const lb = layout.lobby;
    if (lb && doorCovered(layout, '__lobby__', 'north', (lb.xMax - lb.xMin) / 2)) {
      ops.push({ x: (lb.xMin + lb.xMax) / 2, z: lb.zMin });
    }
    (project.rooms || []).forEach((r, i) => {
      if (!r.exitDoor || !layout.rooms[i]) return;
      if (!doorCovered(layout, r.id, r.exitDoor.wall, r.exitDoor.offset)) return;
      const d = wallLeftToWorld(layout.rooms[i].rect, r.exitDoor.wall, r.exitDoor.offset);
      ops.push({ x: d.x, z: d.z });
    });
    return ops;
  }

  // 스폰 포인트: 방 경계 위 첫 개구부에서 안쪽 1.5m, 방 중앙을 바라봄. 문 없으면 중앙 남쪽 폴백.
  spawnFor(id) {
    const { layout } = this.ctx;
    if (id === '__lobby__') {
      return { x: layout.spawn.x, z: Math.max(1.2, layout.spawn.z - 0.6), yaw: Math.PI };
    }
    const lr = layout.rooms.find(r => r.id === id);
    if (!lr) return null;
    const rect = lr.rect;
    const cx = (rect.xMin + rect.xMax) / 2, cz = (rect.zMin + rect.zMax) / 2;
    const EPS = 0.12;
    for (const o of this._openings()) {
      let nx = 0, nz = 0; // 방 안쪽 방향
      if (Math.abs(o.z - rect.zMin) < EPS && o.x > rect.xMin - EPS && o.x < rect.xMax + EPS) nz = 1;
      else if (Math.abs(o.z - rect.zMax) < EPS && o.x > rect.xMin - EPS && o.x < rect.xMax + EPS) nz = -1;
      else if (Math.abs(o.x - rect.xMin) < EPS && o.z > rect.zMin - EPS && o.z < rect.zMax + EPS) nx = 1;
      else if (Math.abs(o.x - rect.xMax) < EPS && o.z > rect.zMin - EPS && o.z < rect.zMax + EPS) nx = -1;
      else continue;
      const sx = o.x + nx * 1.5, sz = o.z + nz * 1.5;
      return { x: sx, z: sz, yaw: Math.atan2(cx - sx, cz - sz) };
    }
    // 폴백: 중앙 벤치를 피해 중앙보다 1.5m 남쪽, 북쪽(중앙)을 바라봄
    return { x: cx, z: Math.min(rect.zMax - 1, cz + 1.5), yaw: Math.PI };
  }

  // ---- 이동 실행 ----
  teleportToRoom(id, opts = {}) {
    const s = this.spawnFor(id);
    if (s) this.teleportToPoint(s.x, s.z, s.yaw, opts);
  }
  teleportToPoint(x, z, yaw, opts = {}) {
    const c = this.ctx.controls;
    if (!c) return;
    this.ctx.autowalk?.stop?.();
    const move = () => c.teleport(x, z, yaw);
    if (opts.fade === false) { move(); return; }
    this._fadeEl.classList.add('on');
    setTimeout(() => {
      move();
      setTimeout(() => this._fadeEl.classList.remove('on'), 60); // 1프레임 여유 후 페이드 인
    }, FADE_OUT_MS);
  }

  // ---- 모달 ----
  open() {
    if (!this.enabled || this.isOpen || this.ctx.interactions?.isOpen) return;
    this.isOpen = true;
    this.sel = this._currentIndex();
    this._renderList();
    this.modal.classList.add('open');
    if (this.ctx.controls) this.ctx.controls.enabled = false;
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.modal.classList.remove('open');
    if (this.ctx.controls) this.ctx.controls.enabled = true;
  }
  _go(i) {
    const d = this.destinations()[i];
    if (!d) return;
    this.close();
    this.teleportToRoom(d.id);
  }

  // 현재 위치한 공간의 목록 인덱스 (모달 초기 선택)
  _currentIndex() {
    const c = this.ctx.controls, { layout } = this.ctx;
    if (!c) return 0;
    for (let i = 0; i < layout.rooms.length; i++) {
      const r = layout.rooms[i].rect;
      if (c.pos.x >= r.xMin && c.pos.x <= r.xMax && c.pos.y >= r.zMin && c.pos.y <= r.zMax) return i + 1;
    }
    return 0;
  }

  _buildDom() {
    this._fadeEl = document.createElement('div');
    this._fadeEl.className = 'tp-fade';
    document.body.appendChild(this._fadeEl);

    this.modal = document.createElement('div');
    this.modal.className = 'tp-modal no-cam-drag';
    this.modal.innerHTML = `
      <div class="tp-card">
        <div class="tp-title">방 이동</div>
        <div class="tp-body">
          <ul class="tp-list"></ul>
          <canvas class="tp-map" width="170" height="170"></canvas>
        </div>
        <div class="tp-hint">↑↓ 선택 · Enter 이동 · 1~9 바로가기 · Esc 닫기</div>
      </div>`;
    this.modal.addEventListener('pointerdown', (e) => { if (e.target === this.modal) this.close(); });
    document.body.appendChild(this.modal);
    this.listEl = this.modal.querySelector('.tp-list');
    this.mapEl = this.modal.querySelector('.tp-map');
  }

  _renderList() {
    const dests = this.destinations();
    this.listEl.innerHTML = dests.map((d, i) => `
      <li class="${i === this.sel ? 'on' : ''}" data-i="${i}">
        <span class="tp-num">${d.num || '🏛'}</span><span class="tp-name">${esc(d.name)}</span>
      </li>`).join('');
    this.listEl.querySelectorAll('li').forEach(li => {
      li.addEventListener('pointerenter', () => { this.sel = +li.dataset.i; this._refreshSel(); });
      li.addEventListener('click', () => this._go(+li.dataset.i));
    });
    this._drawMap();
  }
  _refreshSel() {
    this.listEl.querySelectorAll('li').forEach(li => li.classList.toggle('on', +li.dataset.i === this.sel));
    const on = this.listEl.querySelector('li.on');
    on?.scrollIntoView({ block: 'nearest' });
    this._drawMap();
  }

  // 미니 평면도: 전체 배치 + 선택 방 하이라이트 + 현재 위치 점
  _drawMap() {
    const g = this.mapEl.getContext('2d');
    const { layout } = this.ctx;
    const W = this.mapEl.width, H = this.mapEl.height;
    g.clearRect(0, 0, W, H);
    const b = layout.bounds;
    if (!b) return;
    const pad = 10;
    const s = Math.min((W - pad * 2) / (b.xMax - b.xMin), (H - pad * 2) / (b.zMax - b.zMin));
    const ox = (W - (b.xMax - b.xMin) * s) / 2 - b.xMin * s;
    const oy = (H - (b.zMax - b.zMin) * s) / 2 - b.zMin * s;
    const dests = this.destinations();
    const selId = dests[this.sel]?.id;
    const rects = [{ id: '__lobby__', rect: layout.lobby }, ...layout.rooms.map(r => ({ id: r.id, rect: r.rect }))];
    for (const r of rects) {
      if (!r.rect) continue;
      const x = r.rect.xMin * s + ox, y = r.rect.zMin * s + oy;
      const w = (r.rect.xMax - r.rect.xMin) * s, h = (r.rect.zMax - r.rect.zMin) * s;
      g.fillStyle = r.id === selId ? 'rgba(201,162,76,.45)' : 'rgba(255,255,255,.08)';
      g.strokeStyle = r.id === selId ? '#e6c878' : 'rgba(255,255,255,.25)';
      g.lineWidth = r.id === selId ? 2 : 1;
      g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h);
    }
    const c = this.ctx.controls;
    if (c) {
      g.fillStyle = '#5aa2e6';
      g.beginPath(); g.arc(c.pos.x * s + ox, c.pos.y * s + oy, 3.5, 0, 7); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
    }
  }

  // ---- 키보드 (M 열기 · 모달 내 탐색) ----
  _bindKeys() {
    this._onKey = (e) => {
      const k = e.key.toLowerCase();
      if (!this.isOpen) {
        if (k === 'm' && this.enabled && !e.repeat && !this.ctx.interactions?.isOpen) { e.preventDefault(); this.open(); }
        return;
      }
      // 모달 열림: 탐색 키 처리 + 다른 전역 단축키로의 전파 차단
      if (k === 'escape') { this.close(); }
      else if (k === 'arrowdown' || k === 'arrowup') {
        const n = this.destinations().length;
        this.sel = (this.sel + (k === 'arrowdown' ? 1 : -1) + n) % n;
        this._refreshSel();
      } else if (k === 'enter') { this._go(this.sel); }
      else if (/^[1-9]$/.test(k)) { this._go(+k); }         // 숫자 = 방 번호 (목록 0 = 로비)
      else if (k === 'm') { this.close(); }
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', this._onKey, true); // capture: 모달 열림 중 타 단축키 선점
  }

  // ---- 모바일/터치 상시 버튼 ----
  _buildButton() {
    const b = document.createElement('button');
    b.className = 'tp-btn-float no-cam-drag';
    b.innerHTML = '🗺<span>방 이동</span>';
    b.addEventListener('click', () => { this.isOpen ? this.close() : this.open(); });
    document.getElementById('hud')?.appendChild(b);
    this._btn = b;
  }

  setEnabled(v) {
    this.enabled = !!v;
    if (!v) this.close();
    if (this._btn) this._btn.style.display = v ? '' : 'none';
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey, true);
    this.modal.remove();
    this._fadeEl.remove();
    this._btn?.remove();
  }
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
