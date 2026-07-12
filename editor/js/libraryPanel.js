// editor/js/libraryPanel.js
// 업로드 파이프라인(장변 2048 리사이즈 → WebP q0.85, 미지원 시 JPEG 폴백, 256 썸네일),
// My Artworks 그리드.
import { makeArtwork } from '../../shared/schema.js';
import { matchFilename, metaFromEntry } from './autoMeta.js'; // v1.4 P4: 파일명 자동 메타데이터

const MAX_EDGE = 2048;
const THUMB_EDGE = 256;

async function toBlobPreferWebp(canvas) {
  const webp = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.85));
  if (webp) return webp;
  return await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
}

// 대형 원본(8000px급)도 createImageBitmap 으로 안전하게 처리.
// maxEdge: 작품 2048(기본) / 커스텀 패턴 1024 (P5)
export async function processImageFile(file, maxEdge = MAX_EDGE) {
  const bmp = await createImageBitmap(file);
  const w = bmp.width, h = bmp.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));

  const c = document.createElement('canvas'); c.width = tw; c.height = th;
  c.getContext('2d', { alpha: false }).drawImage(bmp, 0, 0, tw, th);
  const blob = await toBlobPreferWebp(c);

  const ts = Math.min(1, THUMB_EDGE / Math.max(tw, th));
  const c2 = document.createElement('canvas'); c2.width = Math.max(1, Math.round(tw * ts)); c2.height = Math.max(1, Math.round(th * ts));
  c2.getContext('2d', { alpha: false }).drawImage(c, 0, 0, c2.width, c2.height);
  const thumbBlob = await toBlobPreferWebp(c2);

  bmp.close && bmp.close();
  return { blob, thumbBlob, width: w, height: h };
}

export class LibraryPanel {
  constructor(store, root, opts = {}) {
    this.store = store;
    this.root = root;
    this.onCreateRoom = opts.onCreateRoom || (() => null); // A1: 파일명 그룹핑에서 방 생성 위임
    this.selected = new Set();       // A1: 배치용 다중 선택(보관함)
    this.assignRoomId = null;        // A1: 배치 대상 방 (드롭다운 유지)
    this.render();
    store.on('images', () => this.renderGrid());
    store.on('load', () => this.renderGrid());
    // 배치/해제/undo 후 배지·목록 갱신. 연속 변경(드래그/타이핑, silent)은 디바운스.
    store.on('change', (e) => {
      if (e.detail && e.detail.silent) { clearTimeout(this._rt); this._rt = setTimeout(() => this.renderGrid(), 300); }
      else this.renderGrid();
    });
    store.on('select', () => this.renderGrid());  // 선택 하이라이트 갱신
  }

  render() {
    this.root.innerHTML = `
      <div class="lib-drop" id="lib-drop">
        <div class="lib-drop-inner">
          <div class="lib-drop-icon">⬆</div>
          <div>이미지를 끌어다 놓거나 <label class="lib-browse">파일 선택<input type="file" accept="image/*" multiple hidden></label></div>
          <div class="lib-hint">PNG · JPG · WEBP · 대형 원본 OK · 자동으로 2048px WebP 최적화</div>
        </div>
      </div>
      <div class="lib-status" id="lib-status"></div>
      <div class="lib-grid" id="lib-grid"></div>`;
    const drop = this.root.querySelector('#lib-drop');
    const input = this.root.querySelector('input[type=file]');
    input.addEventListener('change', (e) => this.handleFiles([...e.target.files]));
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => this.handleFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))));
    this.renderGrid();
  }

  async handleFiles(files) {
    const status = this.root.querySelector('#lib-status');
    let n = 0, matched = 0;
    for (const file of files) {
      status.textContent = `최적화 중… (${++n}/${files.length}) ${file.name}`;
      try {
        const res = await processImageFile(file);
        // v1.4 P4: 파일명 → 내장 명화 사전 자동 매칭 (실패 시 파일명을 영문 제목으로)
        const base = file.name.replace(/\.[^.]+$/, '');
        const hit = matchFilename(file.name);
        if (hit) matched++;
        const art = makeArtwork({
          file: file.name,
          sizeCm: this._guessSize(res.width, res.height),
          meta: hit ? metaFromEntry(hit) : { titleEn: base },
          caption: hit
            ? { title: hit.titleKo || hit.titleEn, artist: hit.artistKo || hit.artistEn, year: hit.year }
            : { title: base },
        });
        art._px = { w: res.width, h: res.height }; // 비율 자동계산용(에디터 전용, export 시 제거)
        await this.store.addImage(art.id, res.blob, res.thumbBlob);
        // 라이브러리에만 등록(아직 배치 전) → project.rooms 밖의 보관함
        this.store.mutate(p => {
          p._library = p._library || [];
          p._library.push(art);
        }, { detail: { libraryAdd: art.id } });
      } catch (err) {
        console.error('업로드 실패', file.name, err);
        status.textContent = `실패: ${file.name} — ${err.message}`;
      }
    }
    status.textContent = files.length
      ? `${files.length}개 업로드 완료.` + (matched ? ` ${matched}개 작품 정보 자동 인식 — 확인 후 사용하세요.` : ' 크기(cm)를 확인하세요.')
      : '';
    this.renderGrid();
  }

  _guessSize(pw, ph) {
    // 기본 장변 80cm 로 가정, 비율 유지(사용자가 인스펙터에서 실측 입력)
    const ratio = pw / ph;
    if (ratio >= 1) return { w: 80, h: +(80 / ratio).toFixed(1) };
    return { w: +(80 * ratio).toFixed(1), h: 80 };
  }

  // 라이브러리 = 배치 전 보관함(_library) + 이미 배치된 작품 모두 표시
  allArtworks() {
    const lib = this.store.project._library || [];
    const placed = [];
    for (const r of this.store.project.rooms) for (const a of (r.artworks || [])) placed.push({ a, roomId: r.id });
    for (const a of (this.store.project.lobby?.artworks || [])) placed.push({ a, roomId: '__lobby__' });
    return { lib, placed };
  }

  renderGrid() {
    const grid = this.root.querySelector('#lib-grid');
    if (!grid) return;
    const { lib, placed } = this.allArtworks();
    // 사라진 선택 정리
    const libIds = new Set(lib.map(a => a.id));
    for (const id of [...this.selected]) if (!libIds.has(id)) this.selected.delete(id);
    const rooms = this.store.project.rooms;
    if (!rooms.find(r => r.id === this.assignRoomId)) this.assignRoomId = rooms[0]?.id || null;

    const cell = (a, isPlaced) => `
      <div class="lib-cell${this.store.selection.artworkId === a.id ? ' sel' : ''}${isPlaced ? ' placed' : ''}${this.selected.has(a.id) ? ' checked' : ''}"
           draggable="true" data-id="${a.id}">
        ${isPlaced ? '' : `<input type="checkbox" class="lib-check" ${this.selected.has(a.id) ? 'checked' : ''} title="배치 선택">`}
        <img src="${this.store.getThumbURL(a.id)}" alt="">
        <div class="lib-cap">${esc(a.caption?.title || a.id)}</div>
        ${isPlaced ? '<span class="lib-badge">배치됨</span>' : ''}
      </div>`;

    const toolbar = lib.length ? `
      <div class="lib-assign">
        <select class="lib-room-sel">${rooms.map((r, i) => `<option value="${r.id}" ${r.id === this.assignRoomId ? 'selected' : ''}>${esc(r.name || ('방 ' + (i + 1)))}</option>`).join('')}</select>
        <button class="lib-assign-btn" ${this.selected.size ? '' : 'disabled'}>선택 ${this.selected.size}점 배치</button>
      </div>
      <div class="lib-tools">
        <button data-lib-all>전체선택</button>
        <button data-lib-none>해제</button>
        <button data-lib-group title="파일명 접두어 01_섹션명_… 로 방 자동 생성·할당 제안">파일명 그룹핑</button>
      </div>` : '';

    grid.innerHTML =
      (lib.length ? `<div class="lib-sec">보관함 (${lib.length}) — 체크 후 방에 배치 · 드래그로 순서=동선</div>` + toolbar + lib.map(a => cell(a, false)).join('') : '') +
      (placed.length ? `<div class="lib-sec">전시 중 (${placed.length})</div>` + placed.map(p => cell(p.a, true)).join('') : '') ||
      `<div class="lib-empty">아직 업로드된 작품이 없습니다.</div>`;

    grid.querySelectorAll('.lib-cell').forEach(el => {
      const id = el.dataset.id;
      const isPlaced = el.classList.contains('placed');
      el.addEventListener('click', (e) => { if (e.target.classList.contains('lib-check')) return; this.store.select({ artworkId: id }); });
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/artwork-id', id);
        // B3: 체크된 셀을 끌면 체크된 전체(보관함 순서)를 함께 드래그
        const ids = this.selected.has(id) ? lib.map(a => a.id).filter(x => this.selected.has(x)) : [id];
        e.dataTransfer.setData('text/artwork-ids', JSON.stringify(ids));
        e.dataTransfer.effectAllowed = 'copyMove';
        this._dragId = id;
      });
      // 보관함 셀끼리 드롭 = 순서 재정렬
      if (!isPlaced) {
        el.addEventListener('dragover', (e) => { if (this._dragId && this._dragId !== id) { e.preventDefault(); el.classList.add('drop-t'); } });
        el.addEventListener('dragleave', () => el.classList.remove('drop-t'));
        el.addEventListener('drop', (e) => {
          el.classList.remove('drop-t');
          const from = e.dataTransfer.getData('text/artwork-id') || this._dragId;
          if (from && from !== id) { e.stopPropagation(); this.store.reorderLibrary(from, id); }
        });
      }
    });
    grid.querySelectorAll('.lib-check').forEach(chk => {
      chk.addEventListener('click', (e) => e.stopPropagation());
      chk.addEventListener('change', (e) => {
        const id = e.target.closest('.lib-cell').dataset.id;
        if (e.target.checked) this.selected.add(id); else this.selected.delete(id);
        this.renderGrid();
      });
    });
    const roomSel = grid.querySelector('.lib-room-sel');
    roomSel?.addEventListener('change', () => { this.assignRoomId = roomSel.value; });
    grid.querySelector('.lib-assign-btn')?.addEventListener('click', () => {
      const order = lib.map(a => a.id).filter(id => this.selected.has(id)); // 보관함 순서 유지
      const warnings = this.store.assignToRoom(order, this.assignRoomId);
      for (const w of warnings) window.__toast?.(w, true);
      this.selected.clear();
      this.renderGrid();
    });
    grid.querySelector('[data-lib-all]')?.addEventListener('click', () => { lib.forEach(a => this.selected.add(a.id)); this.renderGrid(); });
    grid.querySelector('[data-lib-none]')?.addEventListener('click', () => { this.selected.clear(); this.renderGrid(); });
    grid.querySelector('[data-lib-group]')?.addEventListener('click', () => this._autoGroup(lib));
  }

  // B3: 드롭 시 섹션 선택 팝업 — 작업영역에 작품을 떨어뜨리면 어느 방(섹션)에 넣을지 묻는다.
  openAssignPopup(ids) {
    ids = (ids || []).filter(Boolean);
    const rooms = this.store.project.rooms;
    if (!ids.length || !rooms.length) return;
    const pop = document.createElement('div');
    pop.className = 'ed-modal';
    pop.innerHTML = `
      <div class="ed-card">
        <div class="ed-title">${ids.length}점을 어느 섹션에 배치할까요?</div>
        <div class="ed-body">
          <select class="lib-room-sel" style="width:100%">
            ${rooms.map((r, i) => `<option value="${r.id}" ${r.id === this.assignRoomId ? 'selected' : ''}>${esc(r.name || ('방 ' + (i + 1)))}</option>`).join('')}
          </select>
        </div>
        <div class="ed-actions">
          <button class="tb-btn" data-m="cancel">취소</button>
          <button class="tb-btn accent" data-m="go">배치</button>
        </div>
      </div>`;
    document.body.appendChild(pop);
    pop.querySelector('[data-m=cancel]').addEventListener('click', () => pop.remove());
    pop.querySelector('[data-m=go]').addEventListener('click', () => {
      const roomId = pop.querySelector('.lib-room-sel').value;
      this.assignRoomId = roomId; // 다음 배치 기본값 유지
      const warnings = this.store.assignToRoom(ids, roomId);
      for (const w of warnings) window.__toast?.(w, true);
      pop.remove();
      for (const id of ids) this.selected.delete(id);
      this.renderGrid();
    });
  }

  // A1: 파일명 접두어(예 "01_르네상스_다빈치_모나리자") → 섹션명 그룹 제안
  _autoGroup(lib) {
    const groups = new Map();
    for (const a of lib) {
      const name = a.file || a.caption?.title || '';
      const m = name.match(/^\s*\d+\s*[_.\-]\s*([^_.\-]+)/);
      if (!m) continue;
      const key = m[1].trim();
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a.id);
    }
    if (!groups.size) { window.__toast?.('파일명에서 "01_섹션명_…" 접두어를 찾지 못했습니다.', true); return; }
    this._showGroupModal([...groups.entries()]);
  }

  _showGroupModal(entries) {
    const pop = document.createElement('div');
    pop.className = 'ed-modal';
    pop.innerHTML = `
      <div class="ed-card">
        <div class="ed-title">파일명 자동 그룹핑 — ${entries.length}개 섹션 제안</div>
        <div class="ed-body">아래 섹션으로 방을 만들고(같은 이름 방이 있으면 재사용) 작품을 순서대로 할당합니다.
          <ul style="margin:8px 0 0;padding-left:18px;line-height:1.8">
            ${entries.map(([k, ids]) => `<li><b>${esc(k)}</b> — ${ids.length}점</li>`).join('')}
          </ul>
        </div>
        <div class="ed-actions">
          <button class="tb-btn" data-m="cancel">취소</button>
          <button class="tb-btn accent" data-m="go">방 생성·할당</button>
        </div>
      </div>`;
    document.body.appendChild(pop);
    pop.querySelector('[data-m=cancel]').addEventListener('click', () => pop.remove());
    pop.querySelector('[data-m=go]').addEventListener('click', () => {
      for (const [name, ids] of entries) {
        const exist = this.store.project.rooms.find(r => (r.name || '').includes(name));
        const roomId = exist ? exist.id : this.onCreateRoom(name);
        if (roomId) for (const w of this.store.assignToRoom(ids, roomId)) window.__toast?.(w, true);
      }
      pop.remove();
      this.selected.clear();
      this.renderGrid();
      window.__toast?.(`${entries.length}개 섹션에 배치했습니다.`);
    });
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
