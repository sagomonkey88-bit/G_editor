// viewer/js/seating.js — 미디어 룸 벤치 착석 인터랙션 (P3-2)
// 근접(1.6m) → "앉기" 프롬프트, E/탭 → 착석(controls.sit). 이동 입력·ESC → 일어나기.
// 착석 시 onSeatChange(true, anchor) 콜백(P3-4 풀스크린 버튼 표시에 사용).
export class Seating {
  constructor(controls, benchAnchors, hudRoot, opts = {}) {
    this.controls = controls;
    this.anchors = benchAnchors || [];
    this.onSeatChange = opts.onSeatChange || (() => {});
    this.near = null;
    this._buildDom(hudRoot);
    this._bindKeys();
  }

  _buildDom(root) {
    const coarse = new URLSearchParams(location.search).get('touch') === '1'
      || !!window.matchMedia?.('(pointer: coarse)').matches;
    // 기존 zoom-prompt 스타일 재사용
    this.prompt = document.createElement('button');
    this.prompt.className = 'zoom-prompt no-cam-drag';
    this.prompt.innerHTML = coarse ? `<span>앉기 (터치)</span>` : `<span class="kbd">E</span><span>앉기</span>`;
    this.prompt.style.display = 'none';
    this.prompt.addEventListener('click', (e) => { e.stopPropagation(); this.sit(); });
    root.appendChild(this.prompt);
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'e' && !this.controls.seated && this.near) { e.preventDefault(); this.sit(); }
      else if (k === 'escape' && this.controls.seated) { e.preventDefault(); this.stand(); }
    });
  }

  update() {
    if (this.controls.seated) { if (this.prompt.style.display !== 'none') this.prompt.style.display = 'none'; return; }
    const px = this.controls.pos.x, pz = this.controls.pos.y;
    let best = null, bd = 1.6;
    for (const a of this.anchors) {
      const d = Math.hypot(a.x - px, a.z - pz);
      if (d < bd) { bd = d; best = a; }
    }
    if (best !== this.near) { this.near = best; this.prompt.style.display = best ? 'flex' : 'none'; }
  }

  sit() {
    if (!this.near || this.controls.seated) return;
    const a = this.near;
    this.controls.sit(a.x, a.z, a.yaw);
    this.prompt.style.display = 'none';
    this.onSeatChange(true, a);
  }

  stand() {
    if (!this.controls.seated) return;
    this.controls.stand();
    this.onSeatChange(false, null);
  }
}
