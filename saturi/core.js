/*
  ══════════════════════════════════════════════════════════════
   방언 장터 · 공용 코드 (board.html / team.html 이 함께 씀)
  ══════════════════════════════════════════════════════════════
  · 학생 한 명 = 디벗 한 대 = 상인 한 명. 지역 팀에 자동 배정, 닉네임은 바꿀 수 있음.
  · 카드 앞면(표현)은 모두가 보고, 뒷면(지역·뜻)은 카드 주인만 봄 → 정직하게 팔든 속여 팔든 자유.
  · 거래는 메이플식 거래창: 요청 → 수락 → 둘 다 카드 올리기 → 둘 다 [확인] → 교환 → 뒷면 공개 → 별점.
  · Firebase 는 다른 수업 게임과 같은 open-cbd39. 규칙을 안 바꾸려고 trade/byeokrando 문서 아래에
    d_ 로 시작하는 컬렉션을 씀(벽란도 모둠판·개인판과 섞이지 않음). 학생 화면은 자기에게 필요한 문서만 구독.
  · 주소 뒤에 ?demo=1 → 점검 모드(한 컴퓨터의 여러 탭끼리만 통신).
*/
import { GAME, REGIONS, CARDS, TSV } from './cards.js';
export { GAME, REGIONS, CARDS };

const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyD9E86qHToh_f_fNVAcYQldyjCPpARZB-Q",
  authDomain: "open-cbd39.firebaseapp.com",
  projectId: "open-cbd39",
  storageBucket: "open-cbd39.firebasestorage.app",
  messagingSenderId: "322878081506",
  appId: "1:322878081506:web:40efbcf61190f867b451bb"
});
const ROOM = "byeokrando", PREFIX = "d_";   // trade/byeokrando/d_state, d_players, d_inv, d_teams, d_win, d_log, d_meta, d_seen

export const PHASE_LABEL = Object.freeze({ lobby: '준비', r1: '1라운드', mid: '중간 점검', r2: '2라운드', end: '장터 끝 · 시상' });
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clone = v => JSON.parse(JSON.stringify(v ?? null));
export const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const sum = o => Object.values(o || {}).reduce((s, n) => s + (Number(n) || 0), 0);
export const newId = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ── 카드 풀: CARDS 묶음 + TSV 칸. id = 지역-앞면 해시(카드를 더하거나 빼도 다른 카드 id 가 안 바뀜) ──
   같은 앞면이 두 지역 이상에 있으면 헷갈리므로 풀에서 뺌(AMBIG 에 기록) */
export const REG = Object.fromEntries(REGIONS.map(r => [r.id, r]));
const hash = t => { let x = 5381; for (const ch of t) x = ((x * 33) ^ ch.codePointAt(0)) >>> 0; return x.toString(36); };
const norm = t => String(t || '').replace(/[\s.,!?~…·"'“”‘’()]/g, '');
const regionOf = t => { const k = String(t || '').trim().replace(/(도|지역|방언)$/g, ''); return REG[k] ? k : REGIONS.find(r => r.label === String(t).trim())?.id || null; };
const raw = [];
for (const [region, list] of Object.entries(CARDS || {})) list.forEach(([front, mean, flag]) => raw.push({ region, front, mean, flag }));
String(TSV || '').split(/\r?\n/).forEach(line => { const c = line.split('\t').map(x => x.trim()); const region = regionOf(c[0]); if (region && c[1] && c[2]) raw.push({ region, front: c[1], mean: c[2], flag: '' }); });
const regionsByFront = {};
raw.forEach(x => { (regionsByFront[norm(x.front)] ??= new Set()).add(x.region); });
export const CAT = {}, AMBIG = [];
raw.forEach(x => {
  const key = norm(x.front); if (!key) return;
  if (regionsByFront[key].size > 1) { if (!AMBIG.includes(x.front)) AMBIG.push(x.front); return; }
  const id = `${x.region}-${hash(key)}`; if (!CAT[id]) CAT[id] = { id, front: x.front, mean: x.mean, region: x.region, flag: x.flag || '' };
});
export const poolOf = region => Object.keys(CAT).filter(id => CAT[id].region === region);
export const cardsOf = (cards, region) => Object.entries(cards || {}).filter(([id, n]) => n > 0 && CAT[id]?.region === region).reduce((s, [, n]) => s + n, 0);

/* ── 진행 ── */
export const isTradePhase = p => p === 'r1' || p === 'r2';
export function timeLeft(st, t = Date.now()) { if (!st || !isTradePhase(st.phase)) return null; return st.paused ? (st.left || 0) : (st.endsAt || 0) - t; }
export function tradeOpen(st, t = Date.now()) { return !!st && isTradePhase(st.phase) && !st.paused && t < (st.endsAt || 0) + 3000; }
export const deliverOpen = st => !!st && ['r1', 'mid', 'r2'].includes(st.phase);
export function closedReason(st, t = Date.now()) {
  if (!st) return '아직 연결 중이에요';
  if (st.phase === 'lobby') return '선생님이 1라운드를 시작하면 장터가 열려요';
  if (st.phase === 'mid') return '중간 점검 시간이에요. 칠판을 보세요! (납품은 할 수 있어요)';
  if (st.phase === 'end') return '장터가 끝났어요';
  if (st.paused) return '선생님이 잠깐 멈췄어요';
  if (t >= (st.endsAt || 0)) return '이번 라운드 시간이 끝났어요';
  return '';
}
/* 팀 점수: 납품한 우리 지역 카드 ÷ 주문서 장수 (100%를 넘어 더 모아도 점수) */
export function teamStatus(tm) { const target = tm?.target || 0, got = tm?.got || 0; return { got, target, done: target > 0 && got >= target, pct: target ? Math.round(got * 100 / target) : 0 }; }
export const activeTeams = (st, teams) => (st?.teamIds || []).map(id => teams?.[id]).filter(Boolean);
export function ranking(st, teams) {
  const list = activeTeams(st, teams).map(t => ({ id: t.id, team: t, ...teamStatus(t) }));
  list.sort((a, b) => b.pct - a.pct || (a.team.doneAt || 9e15) - (b.team.doneAt || 9e15) || b.got - a.got);
  list.forEach((x, i) => { const p = list[i - 1]; x.rank = p && p.pct === x.pct && (p.team.doneAt || 0) === (x.team.doneAt || 0) ? p.rank : i + 1; });
  list.forEach(x => { x.tie = list.filter(y => y.rank === x.rank).length > 1; });
  return { list, allDone: list.length > 0 && list.every(x => x.done) };
}
export const stars = r => r?.n ? (r.sum / r.n) : 0;
export const starText = r => r?.n ? `⭐${stars(r).toFixed(1)}` : '⭐-';

/* ── 통신 계층 (벽란도에서 이식) ── */
const validConfig = () => !Object.values(firebaseConfig).some(v => String(v).includes('PASTE_HERE'));
function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) deepMerge(target[k], v);
    else target[k] = clone(v);
  }
  return target;
}
function mockTransport() {
  const key = `trade-demo-${ROOM}-${PREFIX}`, channel = new BroadcastChannel(key), subs = [];
  const load = () => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
  const emit = () => { const d = load(); subs.forEach(s => s(d)); };
  const save = d => { localStorage.setItem(key, JSON.stringify(d)); channel.postMessage('change'); emit(); };
  channel.onmessage = emit;
  window.addEventListener('storage', e => { if (e.key === key) emit(); });
  const ops = d => ({
    get: async (col, id) => clone(d[col]?.[id] ?? null),
    set: (col, id, data) => { (d[col] ??= {})[id] = clone(data); },
    update: (col, id, patch) => { (d[col] ??= {})[id] = deepMerge(d[col][id] || {}, patch); },
    del: (col, id) => { if (d[col]) delete d[col][id]; }
  });
  const sub = fn => { subs.push(fn); fn(load()); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; };
  return {
    demo: true,
    watch: (col, cb) => sub(d => cb(clone(d[col] || {}))),
    watchDoc: (col, id, cb) => sub(d => cb(clone(d[col]?.[id] ?? null))),
    watchWhere: (col, field, value, cb) => sub(d => cb(Object.fromEntries(Object.entries(clone(d[col] || {})).filter(([, x]) => x?.[field] === value)))),
    async tx(fn) { const d = load(); const r = await fn(ops(d)); save(d); return r; },
    async batch(list) { const d = load(); const o = ops(d); list.forEach(x => o[x.op](x.col, x.id, x.data)); save(d); }
  };
}
async function firestoreTransport() {
  const appMod = await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js');
  const fs = await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js');
  const app = appMod.initializeApp(firebaseConfig, 'saturi');
  const db = fs.initializeFirestore(app, { localCache: fs.memoryLocalCache() });
  const colRef = col => fs.collection(db, 'trade', ROOM, PREFIX + col);
  const ref = (col, id) => fs.doc(db, 'trade', ROOM, PREFIX + col, id);
  const onErr = err => { console.error(err); window.dispatchEvent(new CustomEvent('db-error', { detail: err })); };
  const writer = tx => ({
    set: (col, id, data) => tx.set(ref(col, id), clone(data)),
    update: (col, id, patch) => tx.set(ref(col, id), clone(patch), { merge: true }),
    del: (col, id) => tx.delete(ref(col, id))
  });
  const mapSnap = (q, cb) => { const map = {}; return fs.onSnapshot(q, snap => { snap.docChanges().forEach(ch => { if (ch.type === 'removed') delete map[ch.doc.id]; else map[ch.doc.id] = ch.doc.data(); }); cb({ ...map }); }, onErr); };
  return {
    demo: false,
    watch: (col, cb) => mapSnap(colRef(col), cb),
    watchWhere: (col, field, value, cb) => mapSnap(fs.query(colRef(col), fs.where(field, '==', value)), cb),
    watchDoc: (col, id, cb) => fs.onSnapshot(ref(col, id), s => cb(s.exists() ? s.data() : null), onErr),
    async tx(fn) { return fs.runTransaction(db, async tx => fn({ get: async (col, id) => { const s = await tx.get(ref(col, id)); return s.exists() ? s.data() : null; }, ...writer(tx) })); },
    async batch(list) { for (let i = 0; i < list.length; i += 450) { const b = fs.writeBatch(db), w = writer(b); list.slice(i, i + 450).forEach(x => w[x.op](x.col, x.id, x.data)); await b.commit(); } }
  };
}
export async function createTransport() {
  const forceDemo = new URLSearchParams(location.search).get('demo') === '1';
  const T = (forceDemo || !validConfig()) ? mockTransport() : await firestoreTransport();
  T.update = (col, id, data) => T.batch([{ op: 'update', col, id, data }]);
  return T;
}

/* ── 입장·닉네임 ── */
export function pickTeam(ids, counts) { return [...ids].sort((a, b) => (counts?.[a] || 0) - (counts?.[b] || 0) || ids.indexOf(a) - ids.indexOf(b))[0]; }
export function defaultNick(region, n) { const list = REG[region]?.nick || [region]; const base = list[(n - 1) % list.length], lap = Math.floor((n - 1) / list.length); return lap ? `${base} ${lap + 1}` : base; }
export function cleanNick(s) { return String(s || '').replace(/[<>"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10); }
export async function joinGame(T, me) {
  return T.tx(async t => {
    const st = await t.get('state', 'main'), p = await t.get('players', me), meta = await t.get('meta', 'roster');
    if (!st) throw new Error('선생님이 아직 장터를 열지 않았어요');
    if (p?.team) return p;
    const counts = { ...(meta?.counts || {}) }, nos = { ...(meta?.nos || {}) };
    const team = pickTeam(REGIONS.map(r => r.id), counts), no = (nos[team] || 0) + 1;
    const player = { id: me, team, no, name: defaultNick(team, no), joinedAt: Date.now(), rating: { sum: 0, n: 0 } };
    counts[team] = (counts[team] || 0) + 1; nos[team] = no;
    t.set('players', me, player); t.set('meta', 'roster', { counts, nos });
    return player;
  });
}
export async function setNick(T, id, nick) { nick = cleanNick(nick); if (!nick) throw new Error('닉네임을 한 글자 이상 적어요'); await T.update('players', id, { name: nick }); return nick; }

/* ── 거래창 ──
   win: { a(요청한 사람), b(받은 사람), status: request|open|done|cancel, aItems, bItems, aOk, bOk, created, updated, result, aRate, bRate }
   한 사람은 한 번에 거래창 하나(busy). 요청 15초, 거래창 90초 동안 아무 변화가 없으면 자동 취소 */
export const side = (w, me) => w?.a === me ? 'a' : w?.b === me ? 'b' : null;
export const other = (w, me) => w?.a === me ? w.b : w.a;
const stale = (w, now = Date.now()) => !w || w.status === 'done' || w.status === 'cancel' || (w.status === 'request' && now - (w.created || 0) > (GAME.reqSec + 5) * 1000) || (w.status === 'open' && now - (w.updated || 0) > (GAME.idleSec + 10) * 1000);
function sameTeamMsg(a, b) { if (a.team === b.team) throw new Error('같은 지역 친구끼리는 거래할 수 없어요. 다른 지역 상인을 찾아가요'); }
export async function requestTrade(T, me, to) {
  return T.tx(async t => {
    const st = await t.get('state', 'main'), a = await t.get('players', me), b = await t.get('players', to);
    if (!a || !b) throw new Error('상인을 찾을 수 없어요');
    if (a.id === b.id) throw new Error('나와는 거래할 수 없어요');
    sameTeamMsg(a, b);
    if (!tradeOpen(st)) throw new Error(closedReason(st) || '지금은 거래할 수 없어요');
    const ia = await t.get('inv', me), ib = await t.get('inv', to);
    const wa = ia?.busy ? await t.get('win', ia.busy) : null, wb = ib?.busy ? await t.get('win', ib.busy) : null, now = Date.now();
    if (!stale(wa, now)) throw new Error('이미 진행 중인 거래가 있어요');
    if (!stale(wb, now)) throw new Error(`${b.name}님은 지금 다른 친구와 거래 중이에요`);
    const cool = ia?.cool?.[to] || 0; if (now < cool) throw new Error(`${b.name}님이 거절했어요. ${Math.ceil((cool - now) / 1000)}초 뒤에 다시 신청해요`);
    for (const w of [wa, wb]) if (w && (w.status === 'request' || w.status === 'open')) { t.update('win', w.id, { status: 'cancel', reason: '시간이 지나 닫힘', updated: now }); }
    const id = newId('w');
    t.set('win', id, { id, a: me, b: to, an: a.name, bn: b.name, at: a.team, bt: b.team, status: 'request', aItems: {}, bItems: {}, aOk: false, bOk: false, created: now, updated: now, aRate: 0, bRate: 0 });
    t.update('inv', me, { busy: id }); t.update('inv', to, { busy: id });
    return id;
  });
}
export async function answerRequest(T, me, winId, accept) {
  return T.tx(async t => {
    const w = await t.get('win', winId); const st = await t.get('state', 'main');
    if (!w || w.b !== me) throw new Error('나에게 온 신청이 아니에요');
    if (w.status !== 'request') throw new Error('이미 끝난 신청이에요');
    const now = Date.now();
    if (accept) { if (!tradeOpen(st)) throw new Error(closedReason(st)); t.update('win', winId, { status: 'open', updated: now }); return true; }
    t.update('win', winId, { status: 'cancel', reason: 'rejected', updated: now });
    t.update('inv', w.a, { busy: null, cool: { [me]: now + GAME.coolSec * 1000 } }); t.update('inv', w.b, { busy: null });
    return false;
  });
}
/* 내 쪽에 올린 카드 바꾸기 → 둘 다 [확인]이 풀림 (마지막 순간 바꿔치기 방지) */
export async function setItems(T, me, winId, items) {
  return T.tx(async t => {
    const w = await t.get('win', winId), inv = await t.get('inv', me), s = side(w, me);
    if (!w || !s) throw new Error('거래창을 찾을 수 없어요');
    if (w.status !== 'open') throw new Error('거래창이 닫혔어요');
    const clean = {}; for (const [id, n] of Object.entries(items || {})) { const k = Math.floor(Number(n)); if (CAT[id] && k > 0) { if ((inv?.cards?.[id] || 0) < k) throw new Error('가진 것보다 많이 올릴 수 없어요'); clean[id] = k; } }
    t.set('win', winId, { ...w, [s + 'Items']: clean, aOk: false, bOk: false, updated: Date.now() });   // 통째로 덮어써서 뺀 카드가 남지 않게
    return clean;
  });
}
/* 확인: 둘 다 확인이면 한 트랜잭션에서 양쪽 카드 확인 → 교환 → 기록 */
export async function confirmTrade(T, me, winId) {
  return T.tx(async t => {
    const w = await t.get('win', winId), st = await t.get('state', 'main'), s = side(w, me);
    if (!w || !s) throw new Error('거래창을 찾을 수 없어요');
    if (w.status !== 'open') throw new Error('거래창이 닫혔어요');
    const ia = await t.get('inv', w.a), ib = await t.get('inv', w.b), now = Date.now();
    const okA = s === 'a' ? true : w.aOk, okB = s === 'b' ? true : w.bOk;
    if (!sum(w.aItems) || !sum(w.bItems)) throw new Error('두 사람 모두 카드를 한 장 이상 올려야 해요');
    if (!(okA && okB)) { t.update('win', winId, { [s + 'Ok']: true, updated: now }); return { done: false }; }
    if (!tradeOpen(st)) throw new Error(closedReason(st));
    const has = (inv, items) => Object.entries(items).every(([id, n]) => (inv?.cards?.[id] || 0) >= n);
    if (!has(ia, w.aItems) || !has(ib, w.bItems)) { t.update('win', winId, { status: 'cancel', reason: '카드가 모자라서 취소됐어요', updated: now }); t.update('inv', w.a, { busy: null }); t.update('inv', w.b, { busy: null }); return { done: false, failed: true }; }
    const A = { ...ia.cards }, B = { ...ib.cards };
    for (const [id, n] of Object.entries(w.aItems)) { A[id] -= n; B[id] = (B[id] || 0) + n; }
    for (const [id, n] of Object.entries(w.bItems)) { B[id] -= n; A[id] = (A[id] || 0) + n; }
    t.set('inv', w.a, { ...ia, cards: A, busy: null, trades: (ia.trades || 0) + 1 });
    t.set('inv', w.b, { ...ib, cards: B, busy: null, trades: (ib.trades || 0) + 1 });
    t.update('win', winId, { status: 'done', aOk: true, bOk: true, updated: now, doneAt: now, round: st.phase === 'r2' ? 2 : 1 });
    return { done: true };
  });
}
export async function cancelTrade(T, me, winId, reason = 'canceled') {
  return T.tx(async t => {
    const w = await t.get('win', winId); if (!w || (w.status !== 'request' && w.status !== 'open')) return false;
    if (me && !side(w, me)) throw new Error('내 거래가 아니에요');
    if (me && w.status === 'request' && w.b === me) throw new Error('신청은 [거절]로 답해요');
    const ia = await t.get('inv', w.a), ib = await t.get('inv', w.b);
    t.update('win', winId, { status: 'cancel', reason, updated: Date.now(), by: me || 'board' });
    if (ia?.busy === winId) t.update('inv', w.a, { busy: null });
    if (ib?.busy === winId) t.update('inv', w.b, { busy: null });
    return true;
  });
}
/* 별점: 거래가 끝난 뒤 상대에게 1~5. 한 거래에 한 번 */
export async function rateTrade(T, me, winId, n) {
  n = Math.max(1, Math.min(5, Math.round(Number(n) || 0)));
  return T.tx(async t => {
    const w = await t.get('win', winId), s = side(w, me);
    if (!w || !s || w.status !== 'done') throw new Error('끝난 거래에만 별점을 줄 수 있어요');
    if (w[s + 'Rate']) throw new Error('이미 별점을 줬어요');
    const to = other(w, me), p = await t.get('players', to);
    t.update('win', winId, { [s + 'Rate']: n });
    t.update('players', to, { rating: { sum: (p?.rating?.sum || 0) + n, n: (p?.rating?.n || 0) + 1 } });
    return n;
  });
}
/* 납품: 내 지역 카드를 모두 팀 창고로 */
export async function deliver(T, me) {
  return T.tx(async t => {
    const p = await t.get('players', me), st = await t.get('state', 'main');
    if (!p?.team) throw new Error('팀 정보가 없어요');
    const inv = await t.get('inv', me), tm = await t.get('teams', p.team);
    if (!deliverOpen(st)) throw new Error('지금은 납품할 수 없어요');
    if (inv?.busy) { const w = await t.get('win', inv.busy); if (w && (w.status === 'open')) throw new Error('거래창을 먼저 닫아요'); }
    const cards = { ...(inv?.cards || {}) }, moved = {};
    for (const [id, n] of Object.entries(cards)) if (n > 0 && CAT[id]?.region === p.team) { moved[id] = n; cards[id] = 0; }
    const n = sum(moved); if (!n) throw new Error(`${REG[p.team].label} 방언 카드가 없어요. 다른 지역 친구에게서 구해 와요`);
    const got = (tm?.got || 0) + n, now = Date.now(), done = got >= (tm?.target || 0) && !tm?.doneAt;
    t.update('inv', me, { cards, delivered: (inv?.delivered || 0) + n });
    t.update('teams', p.team, { got, ...(done ? { doneAt: now } : {}) });
    const id = newId('D'); t.set('log', id, { id, kind: 'deliver', who: me, name: p.name, team: p.team, cards: moved, n, ts: now });
    return { n, moved, done };
  });
}

/* ── 카드 나눠 주기: 실제 명단 { 지역: [사람...] } → 팀 주문서 + 개인 카드 ──
   지역마다 (인원 × perPerson × copies)장을 찍어서, 그 지역이 아닌 사람들에게 고르게 나눠 줌(같은 표현이 한 사람에게 겹치지 않게) */
/* 한 판에 쓸 방언 고르기: 지역마다 perRegion 개, 지난 판에 덜 나온 것부터(같으면 무작위) */
export function pickDeck(teamIds, used = {}, G = GAME, rnd = Math.random) {
  return teamIds.flatMap(r => poolOf(r).map(id => ({ id, k: (used[id] || 0) + rnd() * 0.9 })).sort((a, b) => a.k - b.k).slice(0, G.perRegion).map(x => x.id));
}
/* 장날 새 카드: 그 사람 지역이 아닌 지역 중에서, 아직 이번 판에 안 나온 방언 먼저 */
export function restockPick(team, teamIds, deck, used = {}, rnd = Math.random) {
  const regs = teamIds.filter(r => r !== team); if (!regs.length) return null;
  const inDeck = new Set(deck), r = regs[Math.floor(rnd() * regs.length)];
  const fresh = poolOf(r).filter(id => !inDeck.has(id)).sort((a, b) => (used[a] || 0) - (used[b] || 0) || rnd() - .5);
  if (fresh.length) return fresh[0];
  const old = deck.filter(id => CAT[id]?.region === r); return old.length ? old[Math.floor(rnd() * old.length)] : null;
}
export function buildGame(roster, deck = null, G = GAME) {
  const teamIds = REGIONS.map(r => r.id).filter(id => (roster[id] || []).length);
  const everyone = teamIds.flatMap(id => roster[id].map(p => ({ p, team: id })));
  const hand = Object.fromEntries(everyone.map(x => [x.p, {}])), count = Object.fromEntries(everyone.map(x => [x.p, 0]));
  const target = {}, copies = {};
  teamIds.forEach(id => { target[id] = roster[id].length * G.perPerson; copies[id] = Math.ceil(target[id] * G.copies); });
  let turn = 0;
  teamIds.forEach(id => {
    const ids = (deck || Object.keys(CAT)).filter(c => CAT[c]?.region === id), others = everyone.filter(x => x.team !== id);
    if (!ids.length || !others.length) return;
    for (let i = 0; i < copies[id]; i++) {
      const c = ids[i % ids.length];
      const pool = [...others].sort((x, y) => count[x.p] - count[y.p] || (hand[x.p][c] ? 1 : 0) - (hand[y.p][c] ? 1 : 0) || ((everyone.indexOf(x) + turn) % everyone.length) - ((everyone.indexOf(y) + turn) % everyone.length));
      const who = pool[0].p; hand[who][c] = (hand[who][c] || 0) + 1; count[who]++; turn++;
    }
  });
  return { teamIds, target, copies, hand };
}
