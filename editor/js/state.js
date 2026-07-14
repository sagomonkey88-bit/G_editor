// editor/js/state.js
// 프로젝트 모델 + 자동저장(IndexedDB) + undo/redo + 이미지 Blob 저장 + 프로젝트 zip 입출력.
import { makeProject, makeRoom, makeArtwork, validateProject, ensureLobby, ensureTextStyles, normalizeSurfaces, ensureOrigins, ensureTexts, ensureArtMeta, ensureAutoLayout, computeLayout, wallLength, reflowOrigins, SCHEMA_VERSION } from '../../shared/schema.js';
import { resolvePlacement, EYE_LEVEL_CM } from '../../shared/placementRules.js';
import { computeRoomPlan, applyRoomPlan, ensureSectionText } from './autoLayout.js'; // v1.5 보완 B1/B2

// P3-3(v1.6): 자산 확장자/MIME — 이미지 + 미디어 영상(webm/mp4) 공용 pack/unpack.
function assetExt(type = '') {
  if (type.includes('webm')) return 'webm';
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('webp')) return 'webp';
  if (type.includes('png')) return 'png';
  return 'jpg';
}
function assetMime(path = '') {
  if (path.endsWith('webm')) return 'video/webm';
  if (path.endsWith('mp4')) return 'video/mp4';
  if (path.endsWith('webp')) return 'image/webp';
  if (path.endsWith('png')) return 'image/png';
  return 'image/jpeg';
}

const DB_NAME = 'museum-maker';
const DB_VER = 1;
const STORE_KV = 'kv';
const STORE_IMG = 'images';
const AUTOSAVE_MS = 2000;
const UNDO_MAX = 50;
const COALESCE_MS = 1200; // 연속 제스처(드래그/타이핑) undo 병합 간격

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
      if (!db.objectStoreNames.contains(STORE_IMG)) db.createObjectStore(STORE_IMG);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbGet(db, store, key) {
  return new Promise((res, rej) => { const t = db.transaction(store).objectStore(store).get(key); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
}
function idbPut(db, store, val, key) {
  return new Promise((res, rej) => { const t = db.transaction(store, 'readwrite').objectStore(store).put(val, key); t.onsuccess = () => res(); t.onerror = () => rej(t.error); });
}
function idbDel(db, store, key) {
  return new Promise((res, rej) => { const t = db.transaction(store, 'readwrite').objectStore(store).delete(key); t.onsuccess = () => res(); t.onerror = () => rej(t.error); });
}
function idbKeys(db, store) {
  return new Promise((res, rej) => { const t = db.transaction(store).objectStore(store).getAllKeys(); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); });
}

export class ProjectStore extends EventTarget {
  constructor() {
    super();
    this.db = null;
    this.project = null;
    this.images = new Map();   // id → { blob, thumbBlob, url, thumbUrl }
    this.selection = { roomId: null, artworkId: null, wall: null };
    this._undo = [];
    this._redo = [];
    this._saveTimer = null;
    this._dirtyImages = new Set();
  }

  async init() {
    this.db = await openDB();
    const saved = await idbGet(this.db, STORE_KV, 'project');
    this.restoredFromSave = !!saved; // P8-2: 재진입 복구 다이얼로그 트리거
    if (saved) {
      this.project = saved;
      // v1.0 아바타 필드 마이그레이션 (a1~a4 / hairColor·topColor → preset·body·garment)
      const av = this.project.avatarDefaults || {};
      const legacy = { a1: 'owl', a2: 'capybara', a3: 'rabbit', a4: 'dragon' };
      if (legacy[av.preset]) {
        this.project.avatarDefaults = { preset: legacy[av.preset], body: 'default', garment: av.topColor || '#8DA98A' };
      }
      await this._loadImages();
    } else {
      this.project = makeProject({ meta: { slug: 'my-museum', title: '새 미술관' } });
      // 룸이 최소 2개 필요(스키마 검증). 기본 1개 → 2개로.
      if (this.project.rooms.length < 2) {
        this.project.rooms.push(makeRoom({ name: '2. 두 번째 섹션', exitDoor: null }, 1));
        this.project.rooms[0].exitDoor = { wall: 'north', offset: this.project.rooms[0].size.w / 2 };
      }
    }
    ensureLobby(this.project);        // P3: lobby 필드 부재 시 기본값 생성 (구 프로젝트 호환)
    ensureTextStyles(this.project);   // P4: 텍스트월 스타일 기본값
    normalizeSurfaces(this.project);  // P5: 벽 색/패턴 필드 정규화 (구 프리셋 → 색 매핑)
    ensureOrigins(this.project);      // P2: 문 체인 배치 → 자유 배치(origin) 마이그레이션
    ensureTexts(this.project);        // P4: 고정 타이틀월/섹션 패널 → 자유 배치 텍스트 오브젝트
    ensureArtMeta(this.project);      // v1.4 P4: 작품 메타데이터 + 캡션 스타일
    ensureAutoLayout(this.project);   // v1.5 A2: 자동 배치 설정 기본값
    if (!this.selection.roomId && this.project.rooms[0]) this.selection.roomId = this.project.rooms[0].id;
    this.emit('load');
    return this;
  }

  async _loadImages() {
    const keys = await idbKeys(this.db, STORE_IMG);
    for (const id of keys) {
      const rec = await idbGet(this.db, STORE_IMG, id);
      if (rec) {
        this.images.set(id, {
          blob: rec.blob, thumbBlob: rec.thumbBlob,
          url: URL.createObjectURL(rec.blob),
          thumbUrl: URL.createObjectURL(rec.thumbBlob || rec.blob),
        });
      }
    }
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, cb) { this.addEventListener(type, cb); }

  // ---- 변경 트랜잭션 (undo 스냅샷 + 자동저장) ----
  // opts.coalesce: 같은 키의 연속 변경(드래그/타이핑)은 첫 호출만 스냅샷을 남긴다.
  // 제스처가 COALESCE_MS 이상 끊기거나 breakCoalesce() 호출 시 다음 변경은 새 스냅샷.
  mutate(fn, opts = {}) {
    const key = opts.coalesce || null;
    const now = Date.now();
    const coalesced = key && key === this._coKey && (now - this._coTime) < COALESCE_MS;
    if (!opts.noUndo && !coalesced) {
      this._undo.push(JSON.stringify(this.project));
      if (this._undo.length > UNDO_MAX) this._undo.shift();
    }
    this._redo.length = 0;
    this._coKey = key; this._coTime = now;
    fn(this.project);
    this._scheduleSave();
    this.emit('change', opts.detail);
  }
  breakCoalesce() { this._coKey = null; }

  undo() { this._swap(this._undo, this._redo); }
  redo() { this._swap(this._redo, this._undo); }
  _swap(from, to) {
    if (!from.length) return;
    this._coKey = null; // undo/redo 후 이어지는 제스처는 새 스냅샷
    to.push(JSON.stringify(this.project));
    this.project = JSON.parse(from.pop());
    // 선택 유효성 보정
    if (!this.project.rooms.find(r => r.id === this.selection.roomId)) {
      this.selection.roomId = this.project.rooms[0]?.id || null;
      this.selection.artworkId = null;
    }
    this._scheduleSave();
    this.emit('change');
    this.emit('undoredo');
  }
  canUndo() { return this._undo.length > 0; }
  canRedo() { return this._redo.length > 0; }

  // ---- 저장 ----
  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this.emit('dirty');
    this._saveTimer = setTimeout(() => this.save(), AUTOSAVE_MS);
  }
  async save() {
    clearTimeout(this._saveTimer);
    await idbPut(this.db, STORE_KV, this.project, 'project');
    for (const id of this._dirtyImages) {
      const im = this.images.get(id);
      if (im) await idbPut(this.db, STORE_IMG, { blob: im.blob, thumbBlob: im.thumbBlob }, id);
    }
    this._dirtyImages.clear();
    this.emit('saved');
  }

  // ---- 이미지 ----
  async addImage(id, blob, thumbBlob) {
    const url = URL.createObjectURL(blob);
    const thumbUrl = URL.createObjectURL(thumbBlob || blob);
    this.images.set(id, { blob, thumbBlob, url, thumbUrl });
    this._dirtyImages.add(id);
    await idbPut(this.db, STORE_IMG, { blob, thumbBlob }, id);
    this.emit('images');
  }
  getImageURL(id) { return this.images.get(id)?.url || ''; }
  getThumbURL(id) { return this.images.get(id)?.thumbUrl || ''; }
  async removeImage(id) {
    const im = this.images.get(id);
    if (im) { URL.revokeObjectURL(im.url); URL.revokeObjectURL(im.thumbUrl); }
    this.images.delete(id);
    await idbDel(this.db, STORE_IMG, id);
  }

  // ---- 선택 도우미 ----
  // 로비('__lobby__')는 룸과 같은 인터페이스의 래퍼로 반환 (nested 객체는 project.lobby 를 직접 참조)
  get selectedRoom() {
    if (this.selection.roomId === '__lobby__') {
      const lb = ensureLobby(this.project);
      return { id: '__lobby__', isLobby: true, name: '로비', intro: '',
               size: lb.size, wall: lb.wall, wallFaces: lb.wallFaces, floor: lb.floor, ceiling: lb.ceiling,
               lighting: lb.lighting, decor: lb.decor, exitDoor: null, artworks: lb.artworks,
               texts: lb.texts };
    }
    return this.project.rooms.find(r => r.id === this.selection.roomId) || null;
  }
  get selectedArtwork() {
    for (const r of this.project.rooms) {
      const a = (r.artworks || []).find(x => x.id === this.selection.artworkId);
      if (a) return a;
    }
    return (this.project.lobby?.artworks || []).find(x => x.id === this.selection.artworkId)
      || (this.project._library || []).find(x => x.id === this.selection.artworkId) // P4: 배치 전 편집
      || null;
  }
  select(sel) { Object.assign(this.selection, sel); this.emit('select'); }

  // ---- A1(v1.5): 작품 → 섹션 할당 ----
  // 보관함(_library) 또는 다른 방/로비에서 작품을 꺼내 대상 방에 넣는다.
  // v1.5 보완 B1: 같은 mutate 안에서 자동 정렬(A4)까지 실행 — 벽 분배·크기 정규화·
  // 방 크기 산정·섹션 텍스트(B2)가 배치 한 번으로 끝난다. undo 1단계.
  // 반환: 자동 정렬 경고 문자열 배열(없으면 빈 배열). 로비는 할당 대상이 아니다.
  assignToRoom(ids, roomId) {
    ids = (ids || []).filter(Boolean);
    if (!ids.length || roomId === '__lobby__') return [];
    let warnings = [];
    this.mutate(p => {
      const room = p.rooms.find(r => r.id === roomId);
      if (!room) return;
      const lr = computeLayout(p).rooms.find(r => r.id === roomId);
      const rect = lr?.rect;
      const door = room.exitDoor;
      // 문이 있는 벽은 피해 임시 배치 (자동 배치에서 최종 결정)
      const wall = door && door.wall === 'north' ? 'east' : 'north';
      const wallLen = rect ? wallLength(rect, wall) : room.size.w;
      room.artworks = room.artworks || [];
      p.route = p.route || [];
      for (const id of ids) {
        const art = this._extractArt(p, id);
        if (!art) continue;
        const res = resolvePlacement({
          wallLen, wallH: room.size.h, u: wallLen / 2, v: EYE_LEVEL_CM / 100,
          aw: art, others: room.artworks.filter(o => o.placement.wall === wall),
          door: door && door.wall === wall ? { offset: door.offset } : null,
        });
        art.placement = { wall, x: +res.u.toFixed(2), centerHeightCm: Math.round(res.v * 100) };
        room.artworks.push(art);
        if (!p.route.includes(id)) p.route.push(id);
      }
      // B1: 배치 즉시 자동 정렬 — 계획(A3) → 적용(A4) → 하류 재배치 → 섹션 텍스트(B2)
      const idx = p.rooms.findIndex(r => r.id === roomId);
      const plan = computeRoomPlan(p, roomId);
      if (plan) {
        applyRoomPlan(p, plan);
        reflowOrigins(p, idx);
        ensureSectionText(p, roomId);
        warnings = plan.warnings;
      }
    }, { detail: { assign: roomId, autoLayout: roomId } });
    this.breakCoalesce();
    return warnings;
  }

  // 작품 id 를 보관함/모든 방/로비에서 떼어내고 그 객체를 반환 (없으면 null).
  _extractArt(p, id) {
    const li = (p._library || []).findIndex(a => a.id === id);
    if (li >= 0) return p._library.splice(li, 1)[0];
    for (const r of p.rooms) {
      const i = (r.artworks || []).findIndex(a => a.id === id);
      if (i >= 0) return r.artworks.splice(i, 1)[0];
    }
    const bi = (p.lobby?.artworks || []).findIndex(a => a.id === id);
    if (bi >= 0) return p.lobby.artworks.splice(bi, 1)[0];
    return null;
  }

  // 보관함(대기함) 순서 재정렬 — 이 순서가 관람 동선(route) 채움 순서의 기준이 된다.
  reorderLibrary(fromId, toId) {
    if (!fromId || fromId === toId) return;
    this.mutate(p => {
      const lib = p._library || [];
      const fi = lib.findIndex(a => a.id === fromId);
      const ti = lib.findIndex(a => a.id === toId);
      if (fi < 0 || ti < 0) return;
      const [it] = lib.splice(fi, 1);
      lib.splice(ti, 0, it);
    }, { detail: { silent: true } });
  }

  // ---- 검증 ----
  validate() { return validateProject(this.project); }

  // ---- 커스텀 패턴 자산 id 수집 (P5 — 프리뷰/Publish/작업파일 공용) ----
  patternAssetIds() {
    const ids = new Set();
    const scan = (r) => {
      if (r?.wall?.patternAsset) ids.add(r.wall.patternAsset);
      if (r?.floor?.asset) ids.add(r.floor.asset);
      if (r?.ceiling?.muralImage) ids.add(r.ceiling.muralImage); // P2(v1.6) 천장화
      if (r?.screen?.source === 'upload' && r.screen.file) ids.add(r.screen.file); // P3-3(v1.6) 미디어 영상
      for (const f of Object.values(r?.wallFaces || {})) if (f?.patternAsset) ids.add(f.patternAsset); // P3
    };
    for (const r of this.project.rooms) scan(r);
    scan(this.project.lobby);
    return [...ids];
  }

  // ---- 프로젝트 zip 입출력 (작업 파일 · NAS 백업용) ----
  // JSZip 은 전역(window.JSZip)로 로드됨.
  async exportProjectZip() {
    const zip = new window.JSZip();
    // 이미지 원본(webp) + 썸네일을 실제 참조 경로로 저장
    // 배치된 작품(rooms) + 미배치 보관함(_library) 모두 포함해야 왕복 무손실.
    const proj = JSON.parse(JSON.stringify(this.project));
    const packArt = (a) => {
      const im = this.images.get(a.id);
      if (!im) return;
      const ext = im.blob.type.includes('webp') ? 'webp' : (im.blob.type.includes('png') ? 'png' : 'jpg');
      a.image = `assets/artworks/${a.id}.${ext}`;
      a.thumb = `assets/thumbs/${a.id}.${ext}`;
      zip.file(a.image, im.blob);
      zip.file(a.thumb, im.thumbBlob || im.blob);
    };
    for (const r of proj.rooms) for (const a of (r.artworks || [])) packArt(a);
    for (const a of (proj.lobby?.artworks || [])) packArt(a);
    for (const a of (proj._library || [])) packArt(a);
    // 커스텀 패턴 (P5) — 작업파일에도 포함해 왕복 무손실 유지
    const packPattern = (holder, field) => {
      const id = holder?.[field];
      if (!id || String(id).startsWith('assets/')) return;
      const im = this.images.get(id);
      if (!im) return;
      const ext = assetExt(im.blob.type);
      holder[field] = `assets/patterns/${id}.${ext}`;
      zip.file(holder[field], im.blob);
    };
    const packFaces = (r) => { for (const f of Object.values(r?.wallFaces || {})) packPattern(f, 'patternAsset'); }; // P3
    for (const r of proj.rooms) { packPattern(r.wall, 'patternAsset'); packPattern(r.floor, 'asset'); packPattern(r.ceiling, 'muralImage'); packPattern(r.screen, 'file'); packFaces(r); }
    if (proj.lobby) { packPattern(proj.lobby.wall, 'patternAsset'); packPattern(proj.lobby.floor, 'asset'); packPattern(proj.lobby.ceiling, 'muralImage'); packFaces(proj.lobby); }
    zip.file('museum.json', JSON.stringify(proj, null, 2));
    zip.file('_projectfile.txt', '이 zip 은 미술관 메이커의 "작업 파일"입니다. Publish 배포본과 다릅니다.\n에디터에서 [프로젝트 불러오기]로 다시 열 수 있습니다.');
    return await zip.generateAsync({ type: 'blob' });
  }

  async importProjectZip(file) {
    const zip = await window.JSZip.loadAsync(file);
    const jsonFile = zip.file('museum.json');
    if (!jsonFile) throw new Error('museum.json 이 zip 에 없습니다.');
    const project = JSON.parse(await jsonFile.async('string'));
    // 이미지 로드 (배치 작품 + 보관함)
    const newImages = new Map();
    const unpackArt = async (a) => {
      const f = a.image && zip.file(a.image);
      const tf = a.thumb && zip.file(a.thumb);
      if (!f) return;
      const blob = await f.async('blob');
      const thumbBlob = tf ? await tf.async('blob') : blob;
      const type = a.image.endsWith('webp') ? 'image/webp' : a.image.endsWith('png') ? 'image/png' : 'image/jpeg';
      newImages.set(a.id, { blob: blob.slice(0, blob.size, type), thumbBlob: thumbBlob.slice(0, thumbBlob.size, type) });
    };
    for (const r of project.rooms) for (const a of (r.artworks || [])) await unpackArt(a);
    for (const a of (project.lobby?.artworks || [])) await unpackArt(a);
    for (const a of (project._library || [])) await unpackArt(a);
    // 커스텀 패턴 복원 (P5): 경로 → blob 로드 → 원래 id 로 되돌림
    const unpackPattern = async (holder, field) => {
      const path = holder?.[field];
      if (!path || !String(path).startsWith('assets/patterns/')) return;
      const f = zip.file(path);
      if (!f) { delete holder[field]; return; }
      const blob = await f.async('blob');
      const fname = path.split('/').pop();
      const id = fname.replace(/\.[^.]+$/, '');
      const type = assetMime(path);
      newImages.set(id, { blob: blob.slice(0, blob.size, type), thumbBlob: blob.slice(0, blob.size, type) });
      holder[field] = id;
    };
    const unpackFaces = async (r) => { for (const f of Object.values(r?.wallFaces || {})) await unpackPattern(f, 'patternAsset'); }; // P3
    for (const r of project.rooms) { await unpackPattern(r.wall, 'patternAsset'); await unpackPattern(r.floor, 'asset'); await unpackPattern(r.ceiling, 'muralImage'); await unpackPattern(r.screen, 'file'); await unpackFaces(r); }
    if (project.lobby) { await unpackPattern(project.lobby.wall, 'patternAsset'); await unpackPattern(project.lobby.floor, 'asset'); await unpackPattern(project.lobby.ceiling, 'muralImage'); await unpackFaces(project.lobby); }
    // 기존 이미지 정리
    for (const [id, im] of this.images) { URL.revokeObjectURL(im.url); URL.revokeObjectURL(im.thumbUrl); await idbDel(this.db, STORE_IMG, id); }
    this.images.clear();
    for (const [id, rec] of newImages) await this.addImage(id, rec.blob, rec.thumbBlob);

    this.project = project;
    ensureLobby(this.project);
    ensureTextStyles(this.project);
    normalizeSurfaces(this.project);
    ensureOrigins(this.project);
    ensureTexts(this.project);
    ensureArtMeta(this.project);
    ensureAutoLayout(this.project);
    this.selection = { roomId: project.rooms[0]?.id || null, artworkId: null, wall: null };
    this._undo.length = 0; this._redo.length = 0;
    await this.save();
    this.emit('load');
    this.emit('change');
  }

  // P8-2: 새 프로젝트로 초기화 (자동 저장본 폐기 — 복구 다이얼로그의 "새로 시작")
  async resetProject() {
    for (const [id, im] of this.images) {
      URL.revokeObjectURL(im.url); URL.revokeObjectURL(im.thumbUrl);
      await idbDel(this.db, STORE_IMG, id);
    }
    this.images.clear();
    this.project = makeProject({ meta: { slug: 'my-museum', title: '새 미술관' } });
    if (this.project.rooms.length < 2) {
      this.project.rooms.push(makeRoom({ name: '2. 두 번째 섹션', exitDoor: null }, 1));
      this.project.rooms[0].exitDoor = { wall: 'north', offset: this.project.rooms[0].size.w / 2 };
    }
    ensureLobby(this.project);
    ensureTextStyles(this.project);
    normalizeSurfaces(this.project);
    ensureOrigins(this.project);
    ensureTexts(this.project);
    ensureArtMeta(this.project);
    ensureAutoLayout(this.project);
    this.selection = { roomId: this.project.rooms[0].id, artworkId: null, wall: null, textId: null };
    this._undo.length = 0; this._redo.length = 0;
    await this.save();
    this.emit('load');
    this.emit('change');
  }

  // 편의 팩토리 재노출
  static makeRoom = makeRoom;
  static makeArtwork = makeArtwork;
}
