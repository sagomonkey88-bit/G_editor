// editor/js/app.js — 에디터 진입점: 상태/패널/모드전환/전역 이벤트.
import { ProjectStore } from './state.js';
import { LibraryPanel } from './libraryPanel.js';
import { Inspector } from './inspector.js';
import { PlanView } from './planView.js';
import { ElevationView } from './elevationView.js';
import { PRESETS, RANGES, LOBBY_RANGES, makeRoom, makeScreen, makeText, computeLayout, wallLength, wallLeftToWorld, LAYOUT, findOppositeFace, doorCovered } from '../../shared/schema.js';
import { openPreview } from './previewBridge.js';
import { LivePreview } from './livePreview.js';
import { exportPublishZip } from './exporter.js';
import { openApiSearch } from './apiSearch.js';
import { AUTO_SCALE_RANGE, effectiveScale, layoutRoom, layoutAll } from './autoLayout.js';

const $ = (s) => document.querySelector(s);

const WALL_SWATCH = { 'deep-red': '#5e2626', green: '#2c4436', navy: '#26324e', gray: '#5f5a53' };
const FLOOR_SWATCH = { 'walnut-herringbone': '#6b4a30', 'oak-herringbone': '#9c7748', 'ash-plank': '#c3ac86', 'walnut-plank': '#5c3f2b' };
// P2(v1.6): 천장 — 색 프리셋 + 조명 소품 프리셋 (바닥 색 UI 패턴 재사용)
const CEIL_SWATCH = { cream: '#ece4d6', white: '#f5f2ea', warmgray: '#cfc7b8', slate: '#9aa0a6', charcoal: '#3a3a3e' };
const CEIL_LABELS = { cream: '크림', white: '화이트', warmgray: '웜그레이', slate: '슬레이트', charcoal: '차콜' };
const FIXTURES = [{ v: 'none', label: '없음' }, { v: 'chandelier', label: '샹들리에' }, { v: 'pendant', label: '펜던트' }, { v: 'recessed', label: '매입등' }, { v: 'dome', label: '돔' }];
const LABELS = { 'deep-red': '딥레드', green: '딥그린', navy: '네이비', gray: '웜그레이', 'walnut-herringbone': '월넛헤링본', 'oak-herringbone': '오크헤링본', 'ash-plank': '애쉬플랭크', 'walnut-plank': '월넛플랭크', warm: 'Warm', neutral: 'Neutral', cool: 'Cool' };

let store, plan, elev, mode = 'plan';

async function main() {
  store = await new ProjectStore().init();
  window.__store = store;
  window.__views = {}; // 디버그/검증용 뷰 참조

  const library = new LibraryPanel(store, $('#library-root'), { onCreateRoom: createRoom });
  // B3(v1.5 보완): 작품을 작업영역(평면도 빈 곳/정면뷰)에 떨어뜨리면 섹션 선택 팝업.
  // 평면도의 방 위 직접 드롭은 planView 가 stopPropagation 으로 먼저 처리.
  const workarea = $('#workarea');
  workarea.addEventListener('dragover', (e) => {
    if ([...e.dataTransfer.types].includes('text/artwork-id')) e.preventDefault();
  });
  workarea.addEventListener('drop', (e) => {
    const multi = e.dataTransfer.getData('text/artwork-ids');
    const single = e.dataTransfer.getData('text/artwork-id');
    const ids = multi ? JSON.parse(multi) : (single ? [single] : []);
    if (!ids.length) return;
    e.preventDefault();
    library.openAssignPopup(ids);
  });
  new Inspector(store, $('#inspector-root'), { onApiFill: (a) => openApiSearch(store, a) });
  plan = new PlanView(store, $('#canvas-host'), {
    onWallPick: () => setMode('elevation'),
    onTeleport: (roomId) => live.teleport({ roomId }), // P2(v1.4): 룸 더블클릭 → 프리뷰 이동
    onAvatarDrag: (x, z) => live.teleport({ x, z, fade: false }), // P3(v1.4): 인디케이터 드래그 → 3D 이동
  });
  elev = new ElevationView(store, $('#canvas-host'));
  elev.deactivate();
  const live = new LivePreview(store, {
    onPaneResize: () => renderCanvas(),
    onAvatarState: (s) => plan.setAvatar(s), // P3(v1.4): 3D 아바타 → 평면도 인디케이터
  }); // P1 스플릿 3D 프리뷰
  buildFaceBar(); // P3 정면뷰 면 소속 표시 + 반대면 전환
  window.__views = { plan, elev, live };

  bindTopbar();
  bindTabs();
  bindModes();
  bindStrip();
  bindKeys();

  store.on('load', () => { renderAll(); });
  // P8-2: 미저장 변경(자동 저장 대기 중) 상태에서 탭 닫기/새로고침 경고
  window.addEventListener('beforeunload', (e) => {
    if (isDirty) { e.preventDefault(); e.returnValue = ''; }
  });
  if (store.restoredFromSave) showRestoreDialog(); // P8-2: 재진입 복구 확인
  store.on('change', () => { renderCanvas(); renderStrip(); renderRoute(); markDirty(true); });
  store.on('select', () => { renderRoomProps(); renderAtmosphere(); renderStrip(); renderFaceBar(); renderCanvas(); });
  store.on('saved', () => markDirty(false));
  store.on('dirty', () => markDirty(true));
  store.on('undoredo', () => renderAll());
  window.addEventListener('resize', () => renderCanvas());

  renderAll();
}

function renderAll() {
  $('#proj-title').value = store.project.meta.title || '';
  renderCanvas(); renderRoomProps(); renderAtmosphere(); renderRoute(); renderStrip(); updateUndoBtns();
}
function renderCanvas() { (mode === 'plan' ? plan : elev).resize(); renderFaceBar(); }

// ---- 모드 전환 ----
function bindModes() {
  document.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  updateModeHint();
}
function setMode(m) {
  mode = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  if (m === 'plan') { elev.deactivate(); plan.activate(); }
  else { plan.deactivate(); elev.activate(); }
  updateModeHint();
  renderAtmosphere(); // P3: 정면뷰 = 면 단위 편집, 평면도 = 룸 일괄 편집
  renderFaceBar();
}

// ---- P3: 정면뷰 면 소속 바 ("룸 1 — 북쪽 벽 (안쪽 면)" + 반대면 전환) ----
const DIR_KO = { north: '북쪽', south: '남쪽', east: '동쪽', west: '서쪽' };
let faceBar = null;
function buildFaceBar() {
  faceBar = document.createElement('div');
  faceBar.id = 'face-bar';
  faceBar.style.display = 'none';
  $('#canvas-host').appendChild(faceBar);
}
function renderFaceBar() {
  if (!faceBar) return;
  const room = store.selectedRoom;
  if (mode !== 'elevation' || !room) { faceBar.style.display = 'none'; return; }
  const dir = store.selection.wall || 'north';
  const layout = computeLayout(store.project);
  const rect = room.id === '__lobby__' ? layout.lobby : layout.rooms.find(r => r.id === room.id)?.rect;
  const len = rect ? +wallLength(rect, dir).toFixed(1) : room.size.w;
  const opp = findOppositeFace(store.project, room.id, dir, layout);
  faceBar.style.display = 'flex';
  faceBar.innerHTML = `
    <span class="fb-id"><b>${attr(room.name)}</b> — ${DIR_KO[dir]} 벽 (안쪽 면) · ${len}m × ${room.size.h}m</span>
    ${opp ? `<button class="fb-flip">반대면 편집 → ${attr(opp.name)} 쪽</button>`
          : '<span class="fb-ext">반대면: 외벽(exterior)</span>'}
    <button class="fb-addtext" title="이 벽면에 자유 텍스트 추가">＋ 텍스트</button>`;
  faceBar.querySelector('.fb-flip')?.addEventListener('click', () => {
    store.select({ roomId: opp.roomId, wall: opp.wall, artworkId: null, textId: null, textWall: null });
    renderCanvas();
  });
  // P4: 순수 자유 텍스트 오브젝트 추가
  faceBar.querySelector('.fb-addtext')?.addEventListener('click', () => {
    const nt = makeText({ role: 'free', text: '새 텍스트', placement: { wall: dir, x: +(len / 2).toFixed(2), centerHeightCm: 200 } });
    store.mutate(p => {
      const r = roomRef(p, room.id);
      if (!r) return;
      r.texts = r.texts || [];
      r.texts.push(nt);
    }, { detail: {} });
    store.select({ textId: nt.id, artworkId: null });
    renderCanvas();
  });
}
function updateModeHint() {
  $('#mode-hint').textContent = mode === 'plan'
    ? '룸 클릭 = 선택 · 활성 룸 벽 호버+클릭 = 정면뷰 · 룸 드래그 = 이동 · 핸들 = 크기 · ESC = 해제'
    : `보관함에서 드래그해 걸기 · 드래그 이동 = 스마트 가이드 스냅 (Alt = 해제) · ESC = 평면도`;
}

// ---- 탭 ----
function bindTabs() {
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
    $('#tab-artwork').hidden = t.dataset.tab !== 'artwork';
    $('#tab-space').hidden = t.dataset.tab !== 'space';
  }));
}

// ---- 상단바 ----
function bindTopbar() {
  $('#proj-title').addEventListener('input', (e) => store.mutate(p => { p.meta.title = e.target.value; }, { detail: { silent: true }, coalesce: 'meta.title' }));
  $('#btn-undo').addEventListener('click', () => store.undo());
  $('#btn-redo').addEventListener('click', () => store.redo());
  $('#btn-preview').addEventListener('click', () => openPreview(store));
  $('#btn-publish').addEventListener('click', () => doPublish());
  $('#btn-saveproj').addEventListener('click', () => doSaveProject());
  $('#btn-openproj').addEventListener('click', () => $('#proj-file').click());
  $('#proj-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { await store.importProjectZip(f); toast('프로젝트를 불러왔습니다.'); }
    catch (err) { toast('불러오기 실패: ' + err.message, true); }
    e.target.value = '';
  });
}
function updateUndoBtns() { $('#btn-undo').disabled = !store.canUndo(); $('#btn-redo').disabled = !store.canRedo(); }
let isDirty = false; // P8-2: beforeunload 경고 판단
function markDirty(d) { isDirty = d; const el = $('#save-state'); el.textContent = d ? '저장 중…' : '저장됨'; el.classList.toggle('dirty', d); updateUndoBtns(); }

async function doSaveProject() {
  await store.save();
  const blob = await store.exportProjectZip();
  download(blob, `${store.project.meta.slug || 'museum'}-project.zip`);
  toast('작업 파일(zip)을 저장했습니다.');
}
async function doPublish() {
  const v = store.validate();
  if (!v.ok) { toast('검증 오류: ' + v.errors[0], true); return; }
  // P8-4: og:image 절대 URL 생성용 배포 예정 URL 입력 (미입력 = 상대 경로 유지)
  const baseUrl = await showPublishDialog();
  if (baseUrl === null) return; // 취소
  store.mutate(p => { p.meta.deployUrl = baseUrl; }, { detail: { silent: true }, noUndo: true });
  try { await store.save(); await exportPublishZip(store, { baseUrl }); toast('Publish ZIP 을 생성했습니다.'); }
  catch (err) { toast('Publish 실패: ' + err.message, true); console.error(err); }
}

// P8-4: 배포 URL 입력 다이얼로그. resolve: 취소=null · 미입력=''(상대 경로) · 입력=URL
function showPublishDialog() {
  return new Promise((resolve) => {
    const pop = document.createElement('div');
    pop.className = 'ed-modal';
    pop.innerHTML = `
      <div class="ed-card">
        <div class="ed-title">Publish — 배포 예정 URL</div>
        <div class="ed-body">카카오톡 등 공유 미리보기(og:image)에는 <b>절대 URL</b>이 필요합니다.<br>
          미입력 시 상대 경로로 유지됩니다 — 사이트는 정상 동작하지만 공유 카드에 이미지가 표시되지 않을 수 있습니다.</div>
        <input class="ed-input" type="text" placeholder="예: https://username.github.io/my-museum/"
               value="${attr(store.project.meta.deployUrl || '')}">
        <div class="ed-actions">
          <button class="tb-btn" data-m="cancel">취소</button>
          <button class="tb-btn accent" data-m="go">ZIP 생성</button>
        </div>
      </div>`;
    document.body.appendChild(pop);
    const done = (val) => { pop.remove(); resolve(val); };
    pop.querySelector('[data-m=cancel]').addEventListener('click', () => done(null));
    pop.querySelector('[data-m=go]').addEventListener('click', () => done(pop.querySelector('.ed-input').value.trim()));
  });
}

// A5: 범용 확인 다이얼로그 (.ed-modal 재사용) — 확인 시 onOk 실행
function confirmDialog(title, body, onOk) {
  const pop = document.createElement('div');
  pop.className = 'ed-modal';
  pop.innerHTML = `
    <div class="ed-card">
      <div class="ed-title">${attr(title)}</div>
      <div class="ed-body">${attr(body)}</div>
      <div class="ed-actions">
        <button class="tb-btn" data-m="cancel">취소</button>
        <button class="tb-btn accent" data-m="ok">진행</button>
      </div>
    </div>`;
  document.body.appendChild(pop);
  pop.querySelector('[data-m=cancel]').addEventListener('click', () => pop.remove());
  pop.querySelector('[data-m=ok]').addEventListener('click', () => { pop.remove(); onOk(); });
}

// P8-2: 재진입 시 자동 저장본 복구 확인 다이얼로그
function showRestoreDialog() {
  const pop = document.createElement('div');
  pop.className = 'ed-modal';
  pop.innerHTML = `
    <div class="ed-card">
      <div class="ed-title">자동 저장된 작업이 있습니다</div>
      <div class="ed-body">"${attr(store.project.meta.title || '제목 없음')}" 작업을 불러왔습니다. 이어서 편집할까요?</div>
      <div class="ed-actions">
        <button class="tb-btn" data-m="new">새 프로젝트 시작</button>
        <button class="tb-btn primary" data-m="keep">이어서 하기</button>
      </div>
    </div>`;
  document.body.appendChild(pop);
  pop.querySelector('[data-m=keep]').addEventListener('click', () => pop.remove());
  pop.querySelector('[data-m=new]').addEventListener('click', async () => {
    if (!window.confirm('자동 저장된 작업과 이미지가 모두 삭제됩니다. 새로 시작할까요?')) return;
    await store.resetProject();
    pop.remove();
    toast('새 프로젝트로 시작합니다.');
  });
}

// 룸/로비 공용 참조 (mutate 콜백 안에서 사용)
function roomRef(p, id) { return id === '__lobby__' ? p.lobby : p.rooms.find(x => x.id === id); }

// ---- 룸 속성 (Space 탭) ----
function renderRoomProps() {
  const root = $('#room-props-root'); const room = store.selectedRoom;
  if (!room) { root.innerHTML = '<div class="inspector-empty">룸을 선택하세요.</div>'; return; }
  const isLobby = room.id === '__lobby__';
  const idx = store.project.rooms.indexOf(room);
  const isLast = !isLobby && idx === store.project.rooms.length - 1;
  const R = isLobby ? { w: LOBBY_RANGES.w, d: LOBBY_RANGES.d, h: LOBBY_RANGES.h }
                    : { w: RANGES.roomW, d: RANGES.roomD, h: RANGES.roomH };
  // A2: 자동 배치 배율 (전역 + 방별 오버라이드)
  const scaleSetting = store.project.autoLayout?.scaleSetting ?? 3.5;
  const hasAutoOverride = !isLobby && typeof room.autoScale === 'number';
  const effScale = isLobby ? scaleSetting : effectiveScale(store.project, room);
  // P3: 방 타입 — gallery(기본)|media. (finale 은 P4)
  const roomType = isLobby ? 'gallery' : (room.roomType || 'gallery');
  // P1-4: 출구 문은 모든 방(로비 제외)에서 설치 가능 — 마지막 방 제한 해제.
  const doorLayout = isLobby ? null : computeLayout(store.project);
  const doorConnected = !isLobby && room.exitDoor
    && doorCovered(doorLayout, room.id, room.exitDoor.wall, room.exitDoor.offset);
  const doorOpp = doorConnected ? findOppositeFace(store.project, room.id, room.exitDoor.wall, doorLayout) : null;
  root.innerHTML = `
    <div class="panel-title">${isLobby ? '로비 속성 (그랜드 로비)' : '룸 속성'}</div>
    ${isLobby ? '<div class="hint-note" style="margin-bottom:10px">전시 타이틀월과 입장 문이 있는 대공간입니다. 삭제·순서 변경 불가.</div>' : `
    <div class="field"><label>섹션명</label><input type="text" data-rp="name" value="${attr(room.name)}"></div>
    <div class="field"><label>섹션 서문</label><textarea data-rp="intro">${text(room.intro)}</textarea></div>`}
    <div class="field-row">
      <div class="field"><label>폭 W (${R.w.join('–')}m)</label><input type="number" step="0.5" data-size="w" value="${room.size.w}"></div>
      <div class="field"><label>깊이 D (${R.d.join('–')}m)</label><input type="number" step="0.5" data-size="d" value="${room.size.d}"></div>
    </div>
    <div class="field"><label>높이 H (${R.h.join('–')}m)</label><input type="number" step="0.1" data-size="h" value="${room.size.h}"></div>
    ${isLobby ? '' : `
    <div class="field"><label>방 타입</label>
      <div class="seg" data-room-type>
        <button data-v="gallery" class="${roomType === 'gallery' ? 'on' : ''}">일반 전시실</button>
        <button data-v="media" class="${roomType === 'media' ? 'on' : ''}">미디어 룸</button>
      </div></div>
    ${roomType === 'media' && room.screen ? `
    <div class="panel-title" style="margin-top:14px">미디어 스크린 (16:9)</div>
    <div class="hint-note">미디어 룸은 조명이 자동으로 어두워집니다. 영상 업로드는 다음 단계에서 추가됩니다.</div>
    <div class="field"><label>스크린 벽</label>
      <div class="seg" data-screen-wall>${PRESETS.wallDir.map(w => `<button data-v="${w}" class="${room.screen.wall === w ? 'on' : ''}">${DIR_KO[w]}</button>`).join('')}</div></div>
    <div class="field"><label>위치 offset (m · 비우면 중앙)</label><input type="number" step="0.1" data-screen-pos value="${room.screen.position ?? ''}"></div>
    <div class="field"><label>배율 <b class="screen-scale-lbl">${(room.screen.scale ?? 1).toFixed(2)}</b>x</label>
      <input type="range" data-screen-scale min="0.5" max="2.5" step="0.05" value="${room.screen.scale ?? 1}"></div>` : ''}`}
    ${isLobby || roomType !== 'gallery' ? '' : `
    <div class="panel-title" style="margin-top:14px">자동 배치</div>
    <div class="field"><label>기본 배율 <b class="auto-scale-lbl">${scaleSetting}x</b> (${AUTO_SCALE_RANGE.join('–')}) · 전역</label>
      <input type="range" data-auto-scale min="${AUTO_SCALE_RANGE[0]}" max="${AUTO_SCALE_RANGE[1]}" step="0.1" value="${scaleSetting}"></div>
    <div class="toggle-row"><label>이 방 개별 배율 (적용 ${effScale}x)</label><div class="switch ${hasAutoOverride ? 'on' : ''}" data-auto-override></div></div>
    ${hasAutoOverride ? `<div class="field"><label>이 방 배율 <b class="auto-room-lbl">${room.autoScale}x</b></label>
      <input type="range" data-auto-room min="${AUTO_SCALE_RANGE[0]}" max="${AUTO_SCALE_RANGE[1]}" step="0.1" value="${room.autoScale}"></div>` : ''}
    <div class="toggle-row"><label>방 크기 자동 조정</label><div class="switch ${store.project.autoLayout?.autoSizeRoom !== false ? 'on' : ''}" data-auto-size></div></div>
    <div class="toggle-row"><label>직접 옮긴 작품 보호</label><div class="switch ${store.project.autoLayout?.protectManual !== false ? 'on' : ''}" data-auto-protect></div></div>
    <button class="tb-btn accent" data-auto-run style="width:100%;margin-top:8px">✨ 이 방 자동 정렬 (${(room.artworks || []).length}점)</button>
    <button class="tb-btn" data-auto-all style="width:100%;margin-top:6px;font-size:12px">전체 미술관 자동 배치</button>`}
    ${isLobby ? `
    <div class="panel-title" style="margin-top:14px">관람 설정</div>
    <div class="toggle-row"><label>방 이동 메뉴 허용 (M키·모바일 버튼)</label><div class="switch ${store.project.meta.allowTeleport !== false ? 'on' : ''}" data-allow-tp></div></div>` : ''}
    ${isLobby ? '' : `
    <div class="panel-title" style="margin-top:14px">출구 문</div>
    <div class="toggle-row"><label>출구 문 설치</label><div class="switch ${room.exitDoor ? 'on' : ''}" data-door-toggle></div></div>
    ${room.exitDoor ? `
    <div class="field"><label>문 벽</label>
      <div class="seg" data-exit-wall>${PRESETS.wallDir.map(w => `<button data-v="${w}" class="${room.exitDoor.wall === w ? 'on' : ''}">${DIR_KO[w]}</button>`).join('')}</div></div>
    <div class="field"><label>문 위치 offset (m)</label><input type="number" step="0.1" data-exit-offset value="${room.exitDoor.offset ?? 3}"></div>
    <div class="field"><label>표시 방향 (단방향 문)</label>
      <div class="seg" data-door-dir>
        <button data-v="both" class="${(room.exitDoor.displayDir || 'both') === 'both' ? 'on' : ''}">양방향</button>
        <button data-v="a" class="${room.exitDoor.displayDir === 'a' ? 'on' : ''}">이 방만</button>
        <button data-v="b" class="${room.exitDoor.displayDir === 'b' ? 'on' : ''}">건너편만</button>
      </div></div>
    ${(room.exitDoor.displayDir && room.exitDoor.displayDir !== 'both')
      ? `<div class="hint-note">단방향 — ${room.exitDoor.displayDir === 'a' ? '이 방' : '건너편 방'}에서만 문이 보이고 통과됩니다. 반대쪽은 벽(작품 걸기 가능).</div>` : ''}
    ${doorConnected
      ? `<div class="hint-note">→ ${attr(doorOpp?.name || '인접 공간')}과(와) 연결됨</div>`
      : `<div class="hint-note" style="color:var(--danger)">이 벽에 인접한 공간이 없어 개구부가 생기지 않습니다.</div>
         <button class="tb-btn" data-connect-room style="width:100%;margin-top:4px">연결할 방 선택…</button>`}`
    : '<div class="hint-note">이 방에는 출구 문이 없습니다. 위 토글로 만들 수 있습니다.</div>'}`}
  `;
  const upd = (fn, opts = {}) => store.mutate(p => { const r = roomRef(p, room.id); if (r) fn(r); }, { detail: { silent: opts.silent !== false }, coalesce: opts.coalesce });
  root.querySelector('[data-rp=name]')?.addEventListener('input', e => upd(r => { r.name = e.target.value; }, { coalesce: `room.name:${room.id}` }));
  root.querySelector('[data-rp=intro]')?.addEventListener('input', e => upd(r => { r.intro = e.target.value; }, { coalesce: `room.intro:${room.id}` }));
  const SIZE_RANGE = R;
  root.querySelectorAll('[data-size]').forEach(inp => {
    inp.addEventListener('input', () => upd(r => { const v = parseFloat(inp.value); if (v > 0) r.size[inp.dataset.size] = v; }, { coalesce: `room.size:${inp.dataset.size}:${room.id}` }));
    // 확정(blur/Enter) 시 허용 범위로 클램프
    inp.addEventListener('change', () => {
      const [lo, hi] = SIZE_RANGE[inp.dataset.size];
      const v = Math.max(lo, Math.min(hi, parseFloat(inp.value) || lo));
      if (String(v) !== inp.value) inp.value = v;
      upd(r => { r.size[inp.dataset.size] = v; }, { coalesce: `room.size:${inp.dataset.size}:${room.id}` });
      store.breakCoalesce();
    });
  });
  // A2: 자동 배치 배율 — 전역 슬라이더 + 방별 오버라이드 (드래그 중 재렌더 없이 라벨만 갱신)
  root.querySelector('[data-auto-scale]')?.addEventListener('input', e => {
    const v = +parseFloat(e.target.value).toFixed(1);
    store.mutate(p => { p.autoLayout.scaleSetting = v; }, { detail: { silent: true }, coalesce: 'auto.scale' });
    const lbl = root.querySelector('.auto-scale-lbl'); if (lbl) lbl.textContent = v + 'x';
  });
  root.querySelector('[data-auto-scale]')?.addEventListener('change', () => { store.breakCoalesce(); renderRoomProps(); });
  root.querySelector('[data-auto-override]')?.addEventListener('click', () => {
    upd(r => { if (typeof r.autoScale === 'number') delete r.autoScale; else r.autoScale = store.project.autoLayout.scaleSetting; }, { silent: false });
    renderRoomProps();
  });
  root.querySelector('[data-auto-room]')?.addEventListener('input', e => {
    const v = +parseFloat(e.target.value).toFixed(1);
    upd(r => { r.autoScale = v; }, { coalesce: `auto.room:${room.id}` });
    const lbl = root.querySelector('.auto-room-lbl'); if (lbl) lbl.textContent = v + 'x';
  });
  root.querySelector('[data-auto-room]')?.addEventListener('change', () => store.breakCoalesce());
  // A5: 방 크기 자동 조정 / 보호 토글 (전역)
  root.querySelector('[data-auto-size]')?.addEventListener('click', () => {
    store.mutate(p => { p.autoLayout.autoSizeRoom = p.autoLayout.autoSizeRoom === false; }, { detail: { silent: true }, noUndo: true });
    renderRoomProps();
  });
  root.querySelector('[data-auto-protect]')?.addEventListener('click', () => {
    store.mutate(p => { p.autoLayout.protectManual = p.autoLayout.protectManual === false; }, { detail: { silent: true }, noUndo: true });
    renderRoomProps();
  });
  // A5.1: 이 방 자동 정렬
  root.querySelector('[data-auto-run]')?.addEventListener('click', () => {
    if (!(room.artworks || []).length) { toast('이 방에 배치할 작품이 없습니다.', true); return; }
    const plan = layoutRoom(store, room.id, {});
    const w = plan?.warnings || [];
    toast(w.length ? w[0] : `자동 정렬 완료 (${plan?.count ?? 0}점).`, w.length > 0);
  });
  // A5.4: 전체 자동 배치 — 기존 배치가 있으면 확인 다이얼로그
  root.querySelector('[data-auto-all]')?.addEventListener('click', () => {
    const hasPlaced = store.project.rooms.some(r => (r.artworks || []).length);
    const run = () => {
      const plans = layoutAll(store, {});
      const warns = plans.flatMap(p => p.warnings);
      toast(warns.length ? warns[0] : '전체 자동 배치를 완료했습니다.', warns.length > 0);
    };
    if (hasPlaced) confirmDialog('전체 자동 배치', '모든 방의 작품 크기·위치·방 크기가 다시 계산됩니다. 직접 옮긴 작품은 보호 옵션이 켜져 있으면 유지됩니다. 진행할까요?', run);
    else run();
  });
  // P2(v1.4): 관람자 방 이동 허용 토글 (프로젝트 전역 — 로비 속성에 배치)
  root.querySelector('[data-allow-tp]')?.addEventListener('click', () => {
    store.mutate(p => { p.meta.allowTeleport = p.meta.allowTeleport === false; }, { detail: {} });
    renderRoomProps();
  });
  // P1-4: 출구 문 설치/제거 토글 — 인접 공간 있는 벽 자동 선택, 없으면 north 기본(→ 연결 UI)
  root.querySelector('[data-door-toggle]')?.addEventListener('click', () => {
    const layout = computeLayout(store.project);
    const lrect = layout.rooms[idx]?.rect;
    upd(r => {
      if (r.exitDoor) { r.exitDoor = null; return; }
      let created = null;
      if (lrect) {
        const others = [layout.lobby, ...layout.rooms.filter(lr => lr.id !== r.id).map(lr => lr.rect)];
        for (const B of others) { const sd = sharedDoor(lrect, B); if (sd) { created = sd; break; } }
      }
      r.exitDoor = created || { wall: 'north', offset: +(r.size.w / 2).toFixed(2) };
    }, { silent: false });
    renderRoomProps();
  });
  root.querySelector('[data-connect-room]')?.addEventListener('click', () => connectRoomPicker(room));
  root.querySelector('[data-door-dir]')?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    upd(r => { if (r.exitDoor) r.exitDoor.displayDir = b.dataset.v; }, { silent: false });
    renderRoomProps();
  });
  // P3: 방 타입 전환 (미디어 룸 → 스크린 생성 + P2 조명 자동 어두움) / 스크린 컨트롤
  root.querySelector('[data-room-type]')?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const v = b.dataset.v;
    upd(r => {
      if (v === 'gallery') { delete r.roomType; delete r.screen; }
      else {
        r.roomType = v;
        if (v === 'media') {
          r.screen = r.screen || makeScreen({ wall: 'north' });
          r.ceiling = r.ceiling || {};
          if ((r.ceiling.lightIntensity ?? 1) >= 0.9) r.ceiling.lightIntensity = 0.3; // 자동 어두움
        }
      }
    }, { silent: false });
    renderRoomProps(); renderAtmosphere();
  });
  root.querySelector('[data-screen-wall]')?.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { upd(r => { if (r.screen) r.screen.wall = b.dataset.v; }, { silent: false }); renderRoomProps(); } });
  root.querySelector('[data-screen-pos]')?.addEventListener('input', e => upd(r => { if (r.screen) { const v = parseFloat(e.target.value); r.screen.position = isFinite(v) ? v : null; } }, { coalesce: `screen.pos:${room.id}` }));
  root.querySelector('[data-screen-scale]')?.addEventListener('input', e => { upd(r => { if (r.screen) r.screen.scale = parseFloat(e.target.value); }, { coalesce: `screen.scale:${room.id}` }); const l = root.querySelector('.screen-scale-lbl'); if (l) l.textContent = parseFloat(e.target.value).toFixed(2); });
  const ew = root.querySelector('[data-exit-wall]');
  if (ew) ew.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; upd(r => { r.exitDoor = r.exitDoor || { offset: 3 }; r.exitDoor.wall = b.dataset.v; }, { silent: false }); renderRoomProps(); });
  const eo = root.querySelector('[data-exit-offset]');
  if (eo) {
    eo.addEventListener('input', e => upd(r => { const v = parseFloat(e.target.value); if (r.exitDoor) r.exitDoor.offset = v; }, { coalesce: `room.exit:${room.id}` }));
    // 확정 시 실제 배치 rect 기준 벽 길이로 클램프
    eo.addEventListener('change', () => {
      const layout = computeLayout(store.project);
      const i = store.project.rooms.findIndex(x => x.id === room.id);
      const r = store.project.rooms[i];
      if (!r?.exitDoor || !layout.rooms[i]) return;
      const len = wallLength(layout.rooms[i].rect, r.exitDoor.wall);
      const v = Math.max(LAYOUT.DOOR_W / 2, Math.min(len - LAYOUT.DOOR_W / 2, parseFloat(eo.value) || LAYOUT.DOOR_W / 2));
      if (String(v) !== eo.value) eo.value = +v.toFixed(2);
      upd(rr => { rr.exitDoor.offset = +v.toFixed(2); }, { coalesce: `room.exit:${room.id}` });
      store.breakCoalesce();
    });
  }
}

// ---- 분위기 (우측) ----
const DECOR_LABELS = {
  benches: '벤치', spotlights: '스포트라이트',
  chandelier: '샹들리에', columns: '기둥', cofferedCeiling: '코퍼드 천장',
  goldTrim: '골드 몰딩', carpet: '레드 카펫',
};
function renderAtmosphere() {
  const root = $('#atmosphere-root'); const room = store.selectedRoom;
  if (!room) { root.innerHTML = '<div class="inspector-empty">룸을 선택하세요.</div>'; return; }
  const decorRows = Object.keys(room.decor).map(k =>
    `<div class="toggle-row"><label>${DECOR_LABELS[k] || k}</label><div class="switch ${room.decor[k] ? 'on' : ''}" data-decor="${k}"></div></div>`).join('');
  // P3: 정면뷰 = 진입한 벽의 "이 룸 쪽 면"만 편집, 평면도 = 룸 일괄(개별 면 오버라이드 제거)
  const faceMode = mode === 'elevation';
  const wallDir = store.selection.wall || 'north';
  const hasOverride = faceMode && !!(room.wallFaces && room.wallFaces[wallDir]);
  const W = faceMode ? ((room.wallFaces || {})[wallDir] || room.wall) : room.wall;
  const F = room.floor;
  const C = room.ceiling || {}; // P2: 천장
  const PATTERN_LABELS = { damask: '다마스크', stripes: '줄무늬', plaster: '플라스터', fabric: '패브릭', dots: '도트', plain: '민무늬', custom: '커스텀' };
  const patternOpts = ['damask', 'stripes', 'plaster', 'fabric', 'dots', 'plain', ...(W.patternAsset ? ['custom'] : [])];
  root.innerHTML = `
    <div class="swatch-group"><h4>${faceMode ? `벽 색 — ${DIR_KO[wallDir]} 벽면만` : '벽 색 (룸 전체 일괄)'}</h4>
    ${faceMode ? `<div class="hint-note" style="margin:-4px 0 8px">${attr(room.name)} 쪽 면에만 적용 — 반대쪽 면은 영향 없음${hasOverride ? ' · <b style="color:var(--accent)">개별 지정됨</b>' : ''}</div>` : ''}
      <div class="field-row" style="align-items:center;gap:6px">
        <input type="color" data-wall-color value="${W.color}" style="width:40px;height:30px;border:none;border-radius:6px;background:none;cursor:pointer">
        <input type="text" data-wall-hex value="${W.color}" style="flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:6px 8px;font-size:12px">
      </div>
      <div class="swatches" style="margin-top:8px">${Object.entries(WALL_SWATCH).map(([k, c]) =>
        `<div class="swatch ${W.color === c ? 'on' : ''}" data-wall-quick="${c}" style="background:${c}"><span>${LABELS[k]}</span></div>`).join('')}</div>
    </div>
    <div class="swatch-group"><h4>벽 패턴</h4>
      <select data-wall-pattern style="width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px">
        ${patternOpts.map(o => `<option value="${o}" ${W.pattern === o ? 'selected' : ''}>${PATTERN_LABELS[o]}</option>`).join('')}
      </select>
      <div class="field" style="margin-top:8px"><label>패턴 강도 ${Math.round((W.patternOpacity ?? 1) * 100)}%</label>
        <input type="range" data-wall-op min="0" max="1" step="0.05" value="${W.patternOpacity ?? 1}"></div>
      <div class="field"><label>반복 크기 ${W.patternScale}m (0.25–4)</label>
        <input type="range" data-wall-scale min="0.25" max="4" step="0.25" value="${W.patternScale}"></div>
      <div class="toggle-row"><label>미러 반복(이음매 완화)</label><div class="switch ${W.patternMirror ? 'on' : ''}" data-wall-mirror></div></div>
      <label class="lib-browse" style="display:block;text-align:center;margin-top:6px;font-size:12px">패턴 이미지 업로드<input type="file" accept="image/*" data-wall-upload hidden></label>
      ${faceMode && hasOverride ? '<button class="tb-btn" data-face-reset style="width:100%;margin-top:8px;font-size:12px">이 면 개별 스타일 제거 (룸 기본값 사용)</button>' : ''}
    </div>
    <div class="swatch-group"><h4>바닥</h4>
      <div class="seg" data-floor-mode style="margin-bottom:8px">
        <button data-v="color" class="${F.mode === 'color' ? 'on' : ''}">단색</button>
        <button data-v="texture" class="${F.mode !== 'color' ? 'on' : ''}">텍스처</button>
      </div>
      ${F.mode === 'color' ? `
      <div class="field-row" style="align-items:center;gap:6px">
        <input type="color" data-floor-color value="${F.color}" style="width:40px;height:30px;border:none;border-radius:6px;background:none;cursor:pointer">
        <input type="text" data-floor-hex value="${F.color}" style="flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:6px 8px;font-size:12px">
      </div>
      <div class="swatches" style="margin-top:8px">${Object.entries(WALL_SWATCH).map(([k, c]) =>
        `<div class="swatch ${F.color === c ? 'on' : ''}" data-floor-quick="${c}" style="background:${c}"><span>${LABELS[k]}</span></div>`).join('')}</div>
      ` : `
      <div class="swatches">${Object.entries(FLOOR_SWATCH).map(([k, c]) =>
        `<div class="swatch ${F.preset === k ? 'on' : ''}" data-floor="${k}" style="background:${c}"><span>${LABELS[k]}</span></div>`).join('')}
        <div class="swatch ${F.preset === 'custom' ? 'on' : ''}" data-floor="custom" style="background:#444;display:${F.asset ? 'block' : 'none'}"><span>커스텀</span></div>
      </div>
      ${F.preset === 'custom' ? `<div class="field" style="margin-top:8px"><label>타일 크기 ${F.scale}m</label>
        <input type="range" data-floor-scale min="0.25" max="4" step="0.25" value="${F.scale || 1}"></div>
      <div class="toggle-row"><label>미러 반복</label><div class="switch ${F.mirror ? 'on' : ''}" data-floor-mirror></div></div>` : ''}
      <label class="lib-browse" style="display:block;text-align:center;margin-top:6px;font-size:12px">바닥 이미지 업로드<input type="file" accept="image/*" data-floor-upload hidden></label>
      `}
      <div class="toggle-row" style="margin-top:8px"><label>유광 (은은한 반사)</label><div class="switch ${F.roughness === 'gloss' ? 'on' : ''}" data-floor-gloss></div></div>
      <button class="tb-btn" data-floor-all style="width:100%;margin-top:8px;font-size:12px">이 바닥을 모든 공간에 일괄 적용</button>
    </div>
    <div class="swatch-group"><h4>천장</h4>
      <div class="field-row" style="align-items:center;gap:6px">
        <input type="color" data-ceil-color value="${C.color || '#ece4d6'}" style="width:40px;height:30px;border:none;border-radius:6px;background:none;cursor:pointer">
        <input type="text" data-ceil-hex value="${C.color || '#ece4d6'}" style="flex:1;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:6px 8px;font-size:12px">
      </div>
      <div class="swatches" style="margin-top:8px">${Object.entries(CEIL_SWATCH).map(([k, c]) =>
        `<div class="swatch ${C.color === c ? 'on' : ''}" data-ceil-quick="${c}" style="background:${c}"><span>${CEIL_LABELS[k]}</span></div>`).join('')}</div>
      <div class="field" style="margin-top:8px"><label>밝기 ${Math.round((C.lightIntensity ?? 1) * 100)}% (방 조명)</label>
        <input type="range" data-ceil-light min="0" max="2" step="0.05" value="${C.lightIntensity ?? 1}"></div>
      <div class="field"><label>조명 소품</label>
        <select data-ceil-fixture style="width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px">
          ${FIXTURES.map(f => `<option value="${f.v}" ${(C.fixture || 'none') === f.v ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select></div>
      <label class="lib-browse" style="display:block;text-align:center;margin-top:6px;font-size:12px">천장화 업로드 (최대 2048px)<input type="file" accept="image/*" data-ceil-mural hidden></label>
      ${C.muralImage ? `<div class="field" style="margin-top:6px"><label>천장화 표시</label>
        <div class="seg" data-ceil-muralmode><button data-v="full" class="${C.muralMode !== 'center' ? 'on' : ''}">전체</button><button data-v="center" class="${C.muralMode === 'center' ? 'on' : ''}">중앙 패널</button></div></div>
      <button class="tb-btn" data-ceil-mural-clear style="width:100%;margin-top:6px;font-size:12px">천장화 제거</button>` : ''}
      <button class="tb-btn" data-ceil-all style="width:100%;margin-top:8px;font-size:12px">이 천장을 모든 공간에 일괄 적용</button>
    </div>
    <div class="swatch-group"><h4>조명 무드</h4>
      <div class="seg" data-mood>${PRESETS.lightingMood.map(m => `<button data-v="${m}" class="${room.lighting.mood === m ? 'on' : ''}">${LABELS[m]}</button>`).join('')}</div></div>
    ${decorRows}`;

  const upd = (fn, rerender = true) => { store.mutate(p => { const r = roomRef(p, room.id); if (r) fn(r); }, { detail: {} }); if (rerender) renderAtmosphere(); };
  const updQuiet = (fn, coalesce) => store.mutate(p => { const r = roomRef(p, room.id); if (r) fn(r); }, { detail: { silent: true }, coalesce });

  // P3: 벽 스타일 변경 대상. 정면뷰 = 해당 벽면(오버라이드 생성/수정), 평면도 = 룸 일괄 + 개별 면 제거.
  const wallT = (r) => {
    if (!faceMode) { delete r.wallFaces; return r.wall; }
    r.wallFaces = r.wallFaces || {};
    if (!r.wallFaces[wallDir]) r.wallFaces[wallDir] = JSON.parse(JSON.stringify(r.wall));
    return r.wallFaces[wallDir];
  };
  const co = (k) => k + ':' + room.id + (faceMode ? ':' + wallDir : '');

  root.querySelector('[data-wall-color]').addEventListener('input', e => { updQuiet(r => { wallT(r).color = e.target.value; }, co('wallcolor')); root.querySelector('[data-wall-hex]').value = e.target.value; });
  root.querySelector('[data-wall-hex]').addEventListener('change', e => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) upd(r => { wallT(r).color = v; }); });
  root.querySelectorAll('[data-wall-quick]').forEach(el => el.addEventListener('click', () => upd(r => { wallT(r).color = el.dataset.wallQuick; })));
  root.querySelector('[data-wall-pattern]').addEventListener('change', e => upd(r => { wallT(r).pattern = e.target.value; }));
  root.querySelector('[data-wall-op]').addEventListener('input', e => updQuiet(r => { wallT(r).patternOpacity = parseFloat(e.target.value); }, co('wallop')));
  root.querySelector('[data-wall-scale]').addEventListener('input', e => updQuiet(r => { wallT(r).patternScale = parseFloat(e.target.value); }, co('wallsc')));
  root.querySelector('[data-wall-mirror]').addEventListener('click', () => upd(r => { const t = wallT(r); t.patternMirror = !t.patternMirror; }));
  root.querySelector('[data-wall-upload]').addEventListener('change', (e) => uploadPattern(e.target.files[0], room.id, 'wall', faceMode ? wallDir : null));
  root.querySelector('[data-face-reset]')?.addEventListener('click', () => upd(r => {
    if (r.wallFaces) { delete r.wallFaces[wallDir]; if (!Object.keys(r.wallFaces).length) delete r.wallFaces; }
  }));
  // P1(v1.4): 바닥 단색/텍스처 모드 + 색상 + 유광 + 전체 일괄
  root.querySelector('[data-floor-mode]').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    upd(r => { r.floor.mode = b.dataset.v === 'color' ? 'color' : (r.floor.preset === 'custom' ? 'custom' : 'preset'); });
  });
  const fcolor = root.querySelector('[data-floor-color]');
  if (fcolor) fcolor.addEventListener('input', e => { updQuiet(r => { r.floor.color = e.target.value; }, 'floorcolor:' + room.id); root.querySelector('[data-floor-hex]').value = e.target.value; });
  root.querySelector('[data-floor-hex]')?.addEventListener('change', e => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) upd(r => { r.floor.color = v; }); });
  root.querySelectorAll('[data-floor-quick]').forEach(el => el.addEventListener('click', () => upd(r => { r.floor.color = el.dataset.floorQuick; })));
  root.querySelector('[data-floor-gloss]').addEventListener('click', () => upd(r => { r.floor.roughness = r.floor.roughness === 'gloss' ? 'matte' : 'gloss'; }));
  root.querySelector('[data-floor-all]').addEventListener('click', () => {
    store.mutate(p => {
      const src = roomRef(p, room.id); if (!src) return;
      const def = JSON.stringify(src.floor);
      for (const r of p.rooms) r.floor = JSON.parse(def);
      if (p.lobby) p.lobby.floor = JSON.parse(def);
    }, { detail: {} });
    toast('모든 공간 바닥에 일괄 적용했습니다.');
    renderAtmosphere();
  });
  root.querySelectorAll('[data-floor]').forEach(el => el.addEventListener('click', () => {
    if (el.dataset.floor === 'custom' && !room.floor.asset) return;
    upd(r => { r.floor.preset = el.dataset.floor; r.floor.mode = el.dataset.floor === 'custom' ? 'custom' : 'preset'; if (el.dataset.floor === 'custom') { r.floor.scale = r.floor.scale || 1; } });
  }));
  root.querySelector('[data-floor-scale]')?.addEventListener('input', e => updQuiet(r => { r.floor.scale = parseFloat(e.target.value); }, 'floorsc:' + room.id));
  root.querySelector('[data-floor-mirror]')?.addEventListener('click', () => upd(r => { r.floor.mirror = !r.floor.mirror; }));
  root.querySelector('[data-floor-upload]').addEventListener('change', (e) => uploadPattern(e.target.files[0], room.id, 'floor'));
  root.querySelector('[data-mood]').addEventListener('click', e => { const b = e.target.closest('button'); if (b) upd(r => { r.lighting.mood = b.dataset.v; }); });
  root.querySelectorAll('[data-decor]').forEach(el => el.addEventListener('click', () => upd(r => { r.decor[el.dataset.decor] = !r.decor[el.dataset.decor]; })));

  // P2(v1.6): 천장 — 색·밝기·조명 소품·천장화·일괄 (바닥 UI 패턴 재사용)
  const ceilOf = (r) => (r.ceiling = r.ceiling || {});
  root.querySelector('[data-ceil-color]')?.addEventListener('input', e => { updQuiet(r => { ceilOf(r).color = e.target.value; }, 'ceilcolor:' + room.id); root.querySelector('[data-ceil-hex]').value = e.target.value; });
  root.querySelector('[data-ceil-hex]')?.addEventListener('change', e => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) upd(r => { ceilOf(r).color = v; }); });
  root.querySelectorAll('[data-ceil-quick]').forEach(el => el.addEventListener('click', () => upd(r => { ceilOf(r).color = el.dataset.ceilQuick; })));
  root.querySelector('[data-ceil-light]')?.addEventListener('input', e => updQuiet(r => { ceilOf(r).lightIntensity = parseFloat(e.target.value); }, 'ceillight:' + room.id));
  root.querySelector('[data-ceil-light]')?.addEventListener('change', () => renderAtmosphere());
  root.querySelector('[data-ceil-fixture]')?.addEventListener('change', e => upd(r => { ceilOf(r).fixture = e.target.value; }));
  root.querySelector('[data-ceil-mural]')?.addEventListener('change', e => uploadPattern(e.target.files[0], room.id, 'ceiling'));
  root.querySelector('[data-ceil-muralmode]')?.addEventListener('click', e => { const b = e.target.closest('button'); if (b) upd(r => { ceilOf(r).muralMode = b.dataset.v; }); });
  root.querySelector('[data-ceil-mural-clear]')?.addEventListener('click', () => upd(r => { if (r.ceiling) r.ceiling.muralImage = null; }));
  root.querySelector('[data-ceil-all]')?.addEventListener('click', () => {
    store.mutate(p => {
      const src = roomRef(p, room.id); if (!src) return;
      const def = JSON.stringify(src.ceiling || {});
      for (const r of p.rooms) r.ceiling = JSON.parse(def);
      if (p.lobby) p.lobby.ceiling = JSON.parse(def);
    }, { detail: {} });
    toast('모든 공간 천장에 일괄 적용했습니다.');
    renderAtmosphere();
  });
}

// 커스텀 패턴 업로드 (P5): 1024px WebP 최적화 → IndexedDB → wall/floor 필드 연결
// faceDir (P3): 정면뷰에서 업로드 시 해당 벽면 오버라이드에만 적용
async function uploadPattern(file, roomId, kind, faceDir = null) {
  if (!file) return;
  try {
    const { processImageFile } = await import('./libraryPanel.js');
    // P2: 천장화는 최대 2048px (벽/바닥 패턴은 1024px)
    const res = await processImageFile(file, kind === 'ceiling' ? 2048 : 1024);
    const id = 'pat-' + Math.random().toString(36).slice(2, 8);
    await store.addImage(id, res.blob, res.thumbBlob);
    store.mutate(p => {
      const r = roomId === '__lobby__' ? p.lobby : p.rooms.find(x => x.id === roomId);
      if (!r) return;
      if (kind === 'wall') {
        let t = r.wall;
        if (faceDir) {
          r.wallFaces = r.wallFaces || {};
          if (!r.wallFaces[faceDir]) r.wallFaces[faceDir] = JSON.parse(JSON.stringify(r.wall));
          t = r.wallFaces[faceDir];
        } else delete r.wallFaces;
        t.pattern = 'custom'; t.patternAsset = id; t.patternScale = t.patternScale || 1;
      }
      else if (kind === 'ceiling') { r.ceiling = r.ceiling || {}; r.ceiling.muralImage = id; r.ceiling.muralMode = r.ceiling.muralMode || 'full'; }
      else { r.floor.preset = 'custom'; r.floor.mode = 'custom'; r.floor.asset = id; r.floor.scale = r.floor.scale || 1; }
    }, { detail: {} });
    renderAtmosphere();
    if (kind === 'ceiling') toast(`천장화를 적용했습니다 (${Math.round(res.blob.size / 1024)}KB).`);
    else toast('패턴을 적용했습니다. 반복 크기로 타일링을 조정하세요.');
  } catch (err) { toast('패턴 업로드 실패: ' + err.message, true); }
}

// ---- 관람 순서(대본 목차) ----
function renderRoute() {
  const root = $('#route-root'); if (!root) return;
  const route = store.project.route || [];
  const byId = {};
  for (const r of store.project.rooms) for (const a of (r.artworks || [])) byId[a.id] = a;
  for (const a of (store.project.lobby?.artworks || [])) byId[a.id] = a;
  root.innerHTML = `<div class="panel-title">관람 순서 (대본 목차)</div>` +
    (route.length ? `<ol style="padding-left:18px;font-size:13px;line-height:1.9">` +
      route.map(id => `<li>${attr(byId[id]?.caption?.title || id)}</li>`).join('') + `</ol>`
      : '<div class="inspector-empty">배치된 작품이 없습니다.</div>');
}

// ---- 룸 스트립 ----
function bindStrip() {
  $('#btn-add-room').addEventListener('click', () => {
    createRoom();
    store.select({ roomId: store.project.rooms[store.project.rooms.length - 1].id });
  });
  renderStrip();
}

// P2 자유 배치: 마지막 룸 주변 빈 자리(북→동→서→남)에 자동 배치 + 맞닿는 벽 중앙에 문 자동 설정.
// A1(v1.5): 파일명 그룹핑에서도 재사용 (LibraryPanel onCreateRoom). 새 룸 id 반환.
function createRoom(name) {
  let newId = null;
  store.mutate(p => {
    const layout = computeLayout(p);
    const prev = p.rooms[p.rooms.length - 1];
    const prevRect = layout.rooms[layout.rooms.length - 1]?.rect;
    const size = { w: 12, d: 9 };
    const origin = findFreeSpot(layout, prevRect, size);
    if (prev && !prev.exitDoor && prevRect) {
      prev.exitDoor = sharedDoor(prevRect, { xMin: origin.x, xMax: origin.x + size.w, zMin: origin.z, zMax: origin.z + size.d })
        || { wall: 'north', offset: +(wallLength(prevRect, 'north') / 2).toFixed(2) };
    }
    const room = makeRoom({ name: name || `${p.rooms.length + 1}. 새 섹션`, exitDoor: null, origin }, p.rooms.length);
    p.rooms.push(room);
    newId = room.id;
  }, { detail: {} });
  return newId;
}
function renderStrip() {
  const root = $('#strip-scroll'); if (!root) return;
  const lb = store.project.lobby;
  const lobbyCard = `
    <div class="room-card lobby-card ${store.selection.roomId === '__lobby__' ? 'on' : ''}" data-id="__lobby__">
      <div class="rc-name">🏛 로비</div>
      <div class="rc-meta">${(lb?.artworks || []).length}점 · ${lb?.size.w}×${lb?.size.d}m</div>
    </div>`;
  root.innerHTML = lobbyCard + store.project.rooms.map((r, i) => `
    <div class="room-card ${r.id === store.selection.roomId ? 'on' : ''}" draggable="true" data-id="${r.id}" data-i="${i}">
      <button class="rc-del" title="삭제">✕</button>
      <div class="rc-name">${attr(r.name)}</div>
      <div class="rc-meta">${(r.artworks || []).length}점 · ${r.size.w}×${r.size.d}m</div>
    </div>`).join('');
  root.querySelectorAll('.room-card').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', (e) => { if (e.target.classList.contains('rc-del')) return; store.select({ roomId: id }); });
    card.querySelector('.rc-del')?.addEventListener('click', () => deleteRoom(id));
    if (id !== '__lobby__') {
      card.addEventListener('dragstart', e => e.dataTransfer.setData('text/room-idx', card.dataset.i));
      card.addEventListener('dragover', e => e.preventDefault());
      card.addEventListener('drop', e => { e.preventDefault(); reorderRoom(+e.dataTransfer.getData('text/room-idx'), +card.dataset.i); });
    }
  });
}
function deleteRoom(id) {
  if (store.project.rooms.length <= RANGES.rooms[0]) { toast(`룸은 최소 ${RANGES.rooms[0]}개입니다.`, true); return; }
  store.mutate(p => {
    const i = p.rooms.findIndex(r => r.id === id); if (i < 0) return;
    for (const a of (p.rooms[i].artworks || [])) p.route = p.route.filter(x => x !== a.id);
    p.rooms.splice(i, 1);
    const last = p.rooms[p.rooms.length - 1]; if (last) last.exitDoor = null;
  }, { detail: {} });
  if (store.selection.roomId === id) store.select({ roomId: store.project.rooms[0].id, artworkId: null });
}
function reorderRoom(from, to) {
  if (from === to || from == null) return;
  store.mutate(p => {
    const [r] = p.rooms.splice(from, 1); p.rooms.splice(to, 0, r);
    p.rooms.forEach((rm, i) => { if (i === p.rooms.length - 1) rm.exitDoor = null; else if (!rm.exitDoor) rm.exitDoor = { wall: 'north', offset: rm.size.w / 2 }; });
  }, { detail: {} });
}

// ---- 키보드 ----
function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.target?.matches?.('input,textarea')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
    else if (e.key === 'Escape') {
      // P2: ESC = 정면뷰 → 평면도 복귀 / 평면도 → 선택 해제
      if (mode === 'elevation') setMode('plan');
      else if (store.selection.roomId) store.select({ roomId: null, artworkId: null, wall: null, textId: null });
    }
  });
}

// ---- P2: 새 룸 자동 배치 헬퍼 ----
// 기준 룸의 북/동/서/남 순으로 겹치지 않는 자리 탐색. 실패 시 전체 동쪽.
function findFreeSpot(layout, baseRect, size) {
  const rects = [layout.lobby, ...layout.rooms.map(r => r.rect)];
  const base = baseRect || layout.lobby;
  const cx = (base.xMin + base.xMax) / 2, cz = (base.zMin + base.zMax) / 2;
  const cands = [
    { x: cx - size.w / 2, z: base.zMin - size.d },   // 북
    { x: base.xMax, z: cz - size.d / 2 },            // 동
    { x: base.xMin - size.w, z: cz - size.d / 2 },   // 서
    { x: cx - size.w / 2, z: base.zMax },            // 남
  ];
  const overlaps = (o) => rects.some(R =>
    Math.min(o.x + size.w, R.xMax) - Math.max(o.x, R.xMin) > 1e-6 &&
    Math.min(o.z + size.d, R.zMax) - Math.max(o.z, R.zMin) > 1e-6);
  for (const c of cands) {
    const o = { x: +c.x.toFixed(2), z: +c.z.toFixed(2) };
    if (!overlaps(o)) return o;
  }
  return { x: +(layout.bounds.xMax + 2).toFixed(2), z: +(-size.d).toFixed(2) };
}

// P1-4: 연결할 방 선택 — 인접 공간 없는 문에 방을 이동해 연결. C1: 자동 이동 금지.
// 반드시 확인 다이얼로그를 거치고, 대상 방이 이미 연결됐거나 자리가 없으면 이동 차단.
function connectRoomPicker(room) {
  const door = room.exitDoor;
  if (!door) return;
  const others = store.project.rooms.filter(r => r.id !== room.id);
  if (!others.length) { toast('연결할 다른 방이 없습니다.', true); return; }
  const pop = document.createElement('div');
  pop.className = 'ed-modal';
  pop.innerHTML = `
    <div class="ed-card">
      <div class="ed-title">연결할 방 선택</div>
      <div class="ed-body">"${attr(room.name)}"의 ${DIR_KO[door.wall]} 벽 문 앞으로 선택한 방을 이동해 연결합니다. 이미 다른 문으로 연결됐거나 이동할 자리가 없는 방은 이동할 수 없습니다.</div>
      <div style="max-height:220px;overflow:auto;margin-bottom:8px">${others.map(r => `<button class="tb-btn" data-rid="${r.id}" style="width:100%;margin-bottom:6px">${attr(r.name)}</button>`).join('')}</div>
      <div class="ed-actions"><button class="tb-btn" data-m="cancel">취소</button></div>
    </div>`;
  document.body.appendChild(pop);
  pop.querySelector('[data-m=cancel]').addEventListener('click', () => pop.remove());
  pop.querySelectorAll('[data-rid]').forEach(btn => btn.addEventListener('click', () => {
    const B = store.project.rooms.find(r => r.id === btn.dataset.rid);
    pop.remove();
    if (B) tryConnectRoom(room, B);
  }));
}

function tryConnectRoom(A, B) {
  const layout = computeLayout(store.project);
  const i = layout.rooms.findIndex(r => r.id === A.id);
  const Arect = layout.rooms[i]?.rect;
  const door = A.exitDoor;
  if (!Arect || !door) return;
  // C1: B 가 이미 유효한 출구 문으로 연결돼 있으면 이동 금지
  if (B.exitDoor && doorCovered(layout, B.id, B.exitDoor.wall, B.exitDoor.offset)) {
    toast(`"${B.name}" 방은 이미 다른 문으로 연결되어 있어 이동할 수 없습니다.`, true); return;
  }
  const origin = flushOriginFor(Arect, door, B.size);
  const newRect = { xMin: origin.x, xMax: origin.x + B.size.w, zMin: origin.z, zMax: origin.z + B.size.d };
  const obstacles = [layout.lobby, ...layout.rooms.filter(r => r.id !== A.id && r.id !== B.id).map(r => r.rect)];
  const overlaps = obstacles.some(R => R
    && Math.min(newRect.xMax, R.xMax) - Math.max(newRect.xMin, R.xMin) > 1e-6
    && Math.min(newRect.zMax, R.zMax) - Math.max(newRect.zMin, R.zMin) > 1e-6);
  if (overlaps) { toast(`"${B.name}" 방을 이동할 자리가 없습니다. 방을 직접 옮긴 뒤 다시 시도하세요.`, true); return; }
  confirmDialog('방 이동', `"${B.name}" 방을 "${A.name}"의 문 앞으로 이동합니다. 진행할까요?`, () => {
    store.mutate(p => { const b = p.rooms.find(r => r.id === B.id); if (b) b.origin = { x: origin.x, z: origin.z }; }, { detail: {} });
    toast(`"${B.name}" 방을 이동해 문을 연결했습니다.`);
    renderRoomProps();
  });
}

// 방 B 를 A 의 문 벽에 딱 붙여 문 중앙에 정렬하는 origin(rect 북서 꼭짓점).
function flushOriginFor(Arect, door, Bsize) {
  const c = wallLeftToWorld(Arect, door.wall, door.offset);
  if (door.wall === 'north') return { x: +(c.x - Bsize.w / 2).toFixed(2), z: +(Arect.zMin - Bsize.d).toFixed(2) };
  if (door.wall === 'south') return { x: +(c.x - Bsize.w / 2).toFixed(2), z: +Arect.zMax.toFixed(2) };
  if (door.wall === 'east') return { x: +Arect.xMax.toFixed(2), z: +(c.z - Bsize.d / 2).toFixed(2) };
  return { x: +(Arect.xMin - Bsize.w).toFixed(2), z: +(c.z - Bsize.d / 2).toFixed(2) }; // west
}

// 두 rect 가 맞닿은 변 → 기준 룸(A)의 문 {wall, offset = 공유 스팬 중앙} (wallLeftToWorld 규약)
function sharedDoor(A, B) {
  const EPS = 1e-3;
  const xlo = Math.max(A.xMin, B.xMin), xhi = Math.min(A.xMax, B.xMax);
  const zlo = Math.max(A.zMin, B.zMin), zhi = Math.min(A.zMax, B.zMax);
  if (Math.abs(B.zMax - A.zMin) < EPS && xhi - xlo >= LAYOUT.DOOR_W) return { wall: 'north', offset: +((xlo + xhi) / 2 - A.xMin).toFixed(2) };
  if (Math.abs(B.zMin - A.zMax) < EPS && xhi - xlo >= LAYOUT.DOOR_W) return { wall: 'south', offset: +(A.xMax - (xlo + xhi) / 2).toFixed(2) };
  if (Math.abs(B.xMin - A.xMax) < EPS && zhi - zlo >= LAYOUT.DOOR_W) return { wall: 'east', offset: +((zlo + zhi) / 2 - A.zMin).toFixed(2) };
  if (Math.abs(B.xMax - A.xMin) < EPS && zhi - zlo >= LAYOUT.DOOR_W) return { wall: 'west', offset: +(A.zMax - (zlo + zhi) / 2).toFixed(2) };
  return null;
}

// ---- 유틸 ----
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function attr(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function text(s) { return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

window.__toast = toast;
main();
