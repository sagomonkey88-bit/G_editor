// viewer/js/seating.js — 미디어 룸 벤치 착석(P3-2) + 풀스크린 플레이어(P3-4)
// 근접(1.6m) → "앉기" 프롬프트, E/탭 → 착석. 이동/ESC → 일어나기.
// 착석 + 방에 영상 스크린이 있으면 "풀스크린으로 보기" 버튼 → 2D 오버레이 플레이어.
// 벽 스크린과 같은 <video> 요소를 공유하므로 재생 위치가 자동 동기화된다.
const SPEEDS = [0.5, 1, 1.5, 2];

export class Seating {
  constructor(controls, benchAnchors, screens, hudRoot, opts = {}) {
    this.controls = controls;
    this.anchors = benchAnchors || [];
    this.screens = screens || [];
    this.onSeatChange = opts.onSeatChange || (() => {});
    this.near = null;
    this.activeScreen = null;
    this.playerOpen = false;
    this._buildDom(hudRoot);
    this._bindKeys();
  }

  _buildDom(root) {
    const coarse = new URLSearchParams(location.search).get('touch') === '1'
      || !!window.matchMedia?.('(pointer: coarse)').matches;
    this.prompt = document.createElement('button');
    this.prompt.className = 'zoom-prompt no-cam-drag';
    this.prompt.innerHTML = coarse ? `<span>앉기 (터치)</span>` : `<span class="kbd">E</span><span>앉기</span>`;
    this.prompt.style.display = 'none';
    this.prompt.addEventListener('click', (e) => { e.stopPropagation(); this.sit(); });
    root.appendChild(this.prompt);

    // 착석 중 "풀스크린으로 보기" 버튼 (P3-4)
    this.fsBtn = document.createElement('button');
    this.fsBtn.className = 'zoom-prompt no-cam-drag';
    this.fsBtn.style.cssText = 'display:none;bottom:88px';
    this.fsBtn.innerHTML = `<span>⛶ 풀스크린으로 보기</span>`;
    this.fsBtn.addEventListener('click', (e) => { e.stopPropagation(); this.openPlayer(); });
    root.appendChild(this.fsBtn);

    this._buildPlayer(root, coarse);
  }

  _buildPlayer(root, coarse) {
    const ov = document.createElement('div');
    ov.className = 'media-player no-cam-drag';
    ov.style.cssText = 'position:fixed;inset:0;background:#000;z-index:60;display:none;flex-direction:column;align-items:center;justify-content:center;';
    ov.innerHTML = `
      <div class="mp-stage" style="flex:1;width:100%;display:flex;align-items:center;justify-content:center;min-height:0"></div>
      <div class="mp-bar" style="width:100%;max-width:1100px;padding:10px 16px 18px;color:#eee;font:13px Pretendard,sans-serif;box-sizing:border-box">
        <input class="mp-seek" type="range" min="0" max="100" value="0" step="0.1" style="width:100%;accent-color:#e6c878;cursor:pointer">
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap">
          <button class="mp-play" style="min-width:44px">▶</button>
          <button class="mp-back">⟲10</button>
          <button class="mp-fwd">10⟳</button>
          <button class="mp-restart">↨ 처음</button>
          <span class="mp-time" style="opacity:.8;min-width:90px">0:00 / 0:00</span>
          <span style="flex:1"></span>
          <span class="mp-speeds" style="display:flex;gap:4px"></span>
          <button class="mp-mute">🔊</button>
          <button class="mp-close">✕ 닫기 (ESC)</button>
        </div>
      </div>`;
    root.appendChild(ov);
    this.player = ov;
    this.stage = ov.querySelector('.mp-stage');
    this.seek = ov.querySelector('.mp-seek');
    this.timeLbl = ov.querySelector('.mp-time');
    for (const b of ov.querySelectorAll('.mp-bar button')) b.style.cssText += ';background:rgba(255,255,255,.12);color:#eee;border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:6px 10px;cursor:pointer;font-size:13px';
    // 배속 버튼
    const sp = ov.querySelector('.mp-speeds');
    sp.innerHTML = SPEEDS.map(s => `<button class="mp-speed" data-s="${s}" style="background:rgba(255,255,255,.12);color:#eee;border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:6px 8px;cursor:pointer;font-size:12px">${s}×</button>`).join('');

    const V = () => this.activeScreen?.video;
    ov.querySelector('.mp-play').addEventListener('click', () => { const v = V(); if (!v) return; v.paused ? v.play() : v.pause(); this._syncPlayBtn(); });
    ov.querySelector('.mp-back').addEventListener('click', () => { const v = V(); if (v) v.currentTime = Math.max(0, v.currentTime - 10); });
    ov.querySelector('.mp-fwd').addEventListener('click', () => { const v = V(); if (v) v.currentTime = Math.min(v.duration || 1e9, v.currentTime + 10); });
    ov.querySelector('.mp-restart').addEventListener('click', () => { const v = V(); if (v) { v.currentTime = 0; v.play(); this._syncPlayBtn(); } });
    ov.querySelector('.mp-mute').addEventListener('click', () => { const v = V(); if (!v) return; v.muted = !v.muted; ov.querySelector('.mp-mute').textContent = v.muted ? '🔇' : '🔊'; });
    ov.querySelector('.mp-close').addEventListener('click', () => this.closePlayer());
    this.seek.addEventListener('input', () => { const v = V(); if (v && v.duration) { this._seeking = true; v.currentTime = (this.seek.value / 100) * v.duration; } });
    this.seek.addEventListener('change', () => { this._seeking = false; });
    sp.addEventListener('click', (e) => { const b = e.target.closest('.mp-speed'); if (!b) return; const v = V(); if (v) v.playbackRate = parseFloat(b.dataset.s); this._markSpeed(parseFloat(b.dataset.s)); });
    this._onTime = () => this._tick();
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'escape' && this.playerOpen) { e.preventDefault(); this.closePlayer(); return; }
      if (k === 'e' && !this.controls.seated && this.near) { e.preventDefault(); this.sit(); }
      else if (k === 'escape' && this.controls.seated) { e.preventDefault(); this.stand(); }
    });
  }

  update() {
    if (this.playerOpen) return;
    if (this.controls.seated) { if (this.prompt.style.display !== 'none') this.prompt.style.display = 'none'; return; }
    const px = this.controls.pos.x, pz = this.controls.pos.y;
    let best = null, bd = 1.6;
    for (const a of this.anchors) { const d = Math.hypot(a.x - px, a.z - pz); if (d < bd) { bd = d; best = a; } }
    if (best !== this.near) { this.near = best; this.prompt.style.display = best ? 'flex' : 'none'; }
  }

  sit() {
    if (!this.near || this.controls.seated) return;
    const a = this.near;
    this.controls.sit(a.x, a.z, a.yaw);
    this.prompt.style.display = 'none';
    // 이 방에 영상 스크린이 있으면 풀스크린 버튼 표시
    this.activeScreen = this.screens.find(s => s.roomId === a.roomId && s.video) || null;
    this.fsBtn.style.display = this.activeScreen ? 'flex' : 'none';
    this.onSeatChange(true, a);
  }

  stand() {
    if (!this.controls.seated) return;
    if (this.playerOpen) this.closePlayer();
    this.controls.stand();
    this.fsBtn.style.display = 'none';
    this.activeScreen = null;
    this.onSeatChange(false, null);
  }

  // ---- P3-4 풀스크린 플레이어 ----
  openPlayer() {
    const v = this.activeScreen?.video;
    if (!v || this.playerOpen) return;
    this.playerOpen = true;
    this.fsBtn.style.display = 'none';
    v.style.cssText = 'max-width:100%;max-height:100%;display:block';
    v.controls = false;
    v.muted = false; // 상호작용 시 음소거 해제
    this.stage.appendChild(v);
    v.play?.().catch(() => {});
    this.player.querySelector('.mp-mute').textContent = v.muted ? '🔇' : '🔊';
    this._markSpeed(v.playbackRate || 1);
    this._syncPlayBtn();
    v.addEventListener('timeupdate', this._onTime);
    this.player.style.display = 'flex';
  }

  closePlayer() {
    if (!this.playerOpen) return;
    this.playerOpen = false;
    const v = this.activeScreen?.video;
    if (v) {
      v.removeEventListener('timeupdate', this._onTime);
      // F1(v1.7): 벽 스크린도 소리 유지 (재생 위치·음소거 상태는 동일 요소라 자동 동기화)
      if (v.parentElement === this.stage) this.stage.removeChild(v);
    }
    this.player.style.display = 'none';
    if (this.controls.seated) this.fsBtn.style.display = this.activeScreen ? 'flex' : 'none';
  }

  _tick() {
    const v = this.activeScreen?.video;
    if (!v || !v.duration) return;
    if (!this._seeking) this.seek.value = (v.currentTime / v.duration) * 100;
    this.timeLbl.textContent = `${fmtT(v.currentTime)} / ${fmtT(v.duration)}`;
    this._syncPlayBtn();
  }
  _syncPlayBtn() { const v = this.activeScreen?.video; const b = this.player.querySelector('.mp-play'); if (b) b.textContent = v && !v.paused ? '⏸' : '▶'; }
  _markSpeed(s) { for (const b of this.player.querySelectorAll('.mp-speed')) b.style.background = parseFloat(b.dataset.s) === s ? 'rgba(230,200,120,.4)' : 'rgba(255,255,255,.12)'; }
}

function fmtT(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
