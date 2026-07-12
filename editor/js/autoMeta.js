// editor/js/autoMeta.js — 파일명 → 명화 사전 퍼지 매칭 + Anthropic API 보조 채우기 (v1.4 P4).
// 에디터 전용 — Publish ZIP 에 포함되지 않는다. 매칭 결과 텍스트만 프로젝트 JSON 에 저장.
import { ART_DICTIONARY } from './artDictionary.js';

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'la', 'le', 'les', 'de', 'du', 'der', 'die', 'das',
  'with', 'at', 'on', 'in', 'off', 'by', 'el', 'il', 'los', 'las']);
const NOISE = new Set(['copy', 'final', 'edit', 'scan', 'hd', 'full', 'img', 'image', 'photo', 'wiki',
  'wikimedia', 'commons', 'google', 'art', 'project', 'painting', 'detail', 'jpeg', 'jpg', 'png', 'webp']);

// 파일명 → 소문자 토큰 (확장자/구분자/연도/노이즈 제거)
export function tokensOf(filename) {
  let s = String(filename || '').toLowerCase();
  s = s.replace(/\.[a-z0-9]+$/, '');                    // 확장자
  s = s.replace(/[_\-.+,()\[\]'!]/g, ' ');              // 구분자
  s = s.replace(/\b\d{2,4}px\b/g, ' ');                 // 해상도 표기
  s = s.replace(/\b(1[0-9]{3}|20[0-2][0-9])s?\b/g, ' ');// 연도(제작/파일 연도 모두 매칭에서 제외)
  s = s.replace(/\b\d+\b/g, ' ');                       // 잔여 숫자 (버전 번호 등)
  return s.split(/\s+/).filter(t => t && !NOISE.has(t));
}

// 사전 매칭. 반환: 사전 항목 | null.
// 규칙 — 화가 키 히트 시: 제목 키 커버리지 임계(2개 이하 = 1개, 3개+ = 66%) 충족.
//        화가 없이 제목만: 제목 키 2개 이상 전부 일치할 때만 (starry_night.jpg 등).
export function matchFilename(filename) {
  const toks = tokensOf(filename);
  if (!toks.length) return null;
  const joined = ' ' + toks.join(' ') + ' ';
  const has = (k) => joined.includes(' ' + k + ' ');
  let best = null;
  for (const e of ART_DICTIONARY) {
    const artistHit = e.artistKeys.some(has);
    const tks = e.titleKeys.filter(k => !STOP.has(k));
    if (!tks.length) continue;
    const hit = tks.filter(has).length;
    const cover = hit / tks.length;
    let score = 0;
    if (artistHit) {
      const needed = tks.length <= 2 ? 1 : Math.ceil(tks.length * 0.66);
      if (hit >= needed) score = 2 + cover + hit * 0.01;
    } else if (tks.length >= 2 && hit === tks.length) {
      score = 1 + cover + hit * 0.01; // 제목 단독 완전 일치
    }
    if (score > 0 && (!best || score > best.score)) best = { e, score };
  }
  return best ? best.e : null;
}

// 사전 항목 → artwork.meta 패치 (source: 'auto')
export function metaFromEntry(e) {
  return {
    titleKo: e.titleKo, titleEn: e.titleEn,
    artistKo: e.artistKo, artistEn: e.artistEn,
    year: e.year, description: e.desc,
    source: 'auto', verified: false,
  };
}

// ---- AI 로 정보 채우기 (선택 · 온라인 필요) ----------------------------------
// Anthropic Messages API 직접 호출 (브라우저 — anthropic-dangerous-direct-browser-access).
// API 키는 localStorage 에만 저장 (에디터 로컬 전용, 프로젝트/Publish 에 포함되지 않음).
const KEY_LS = 'museum-anthropic-key';
export function getApiKey() { try { return localStorage.getItem(KEY_LS) || ''; } catch (e) { return ''; } }
export function setApiKey(k) { try { localStorage.setItem(KEY_LS, k || ''); } catch (e) { /* 무시 */ } }

const META_SCHEMA = {
  type: 'object',
  properties: {
    known: { type: 'boolean' },
    titleKo: { type: 'string' }, titleEn: { type: 'string' },
    artistKo: { type: 'string' }, artistEn: { type: 'string' },
    year: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['known', 'titleKo', 'titleEn', 'artistKo', 'artistEn', 'year', 'description'],
  additionalProperties: false,
};

// 파일명 기반 추론. 반환: meta 패치(source:'ai') | null(미상). 실패 시 throw(Error 메시지 한글).
export async function aiFill(filename, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      output_config: { format: { type: 'json_schema', schema: META_SCHEMA } },
      messages: [{
        role: 'user',
        content: `다음은 미술 작품 이미지의 파일명이다: "${filename}"

이 파일명이 실존하는 특정 미술 작품을 가리키는지 판단하라.
- 확실히 식별 가능하면 known=true 로 하고, 작품명(한국어 통용 번역/영어 원제), 화가명(한국어 표기/영어), 제작 연도, 관람객용 한국어 설명 2~3문장(평서문, 100~180자)을 채워라.
- 식별할 수 없거나 추측 수준이면 known=false 로 하고 모든 문자열 필드를 빈 값으로 두어라. 지어내지 마라.`,
      }],
    }),
  });
  if (!res.ok) {
    let msg = `API 오류 (${res.status})`;
    try { msg += ': ' + (await res.json())?.error?.message; } catch (e) { /* 무시 */ }
    throw new Error(msg);
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw new Error('요청이 거부되었습니다. 다시 시도해 주세요.');
  const text = (data.content || []).find(b => b.type === 'text')?.text;
  if (!text) throw new Error('응답이 비어 있습니다.');
  const out = JSON.parse(text);
  if (!out.known) return null;
  return {
    titleKo: out.titleKo, titleEn: out.titleEn,
    artistKo: out.artistKo, artistEn: out.artistEn,
    year: out.year, description: out.description,
    source: 'ai', verified: false,
  };
}

// meta → caption 동기화 (라이브러리 그리드·관람 순서 목록·구버전 호환용 표시 필드)
export function syncCaption(a) {
  a.caption = a.caption || {};
  a.caption.title = a.meta.titleKo || a.meta.titleEn || a.caption.title || '';
  a.caption.artist = a.meta.artistKo || a.meta.artistEn || '';
  a.caption.year = a.meta.year || '';
}
