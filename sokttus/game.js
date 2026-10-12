// 속뜻 카드 — 규칙 계산과 모둠 방 동작
//
// 문서 세 종류 (경로 앞부분 BASE 는 store.js)
//   g{N}                         방 문서: 모두가 구독. 공개해도 되는 것만 둔다
//   g{N}/sokttus_players/{pid}   한 사람의 손패·낸 카드·투표·근거: 그 사람만 구독
//   g{N}/sokttus_secret/deck     남은 덱·버린 카드: 아무도 구독하지 않음
// 정답·누가 낸 카드인지·투표·근거는 마지막 투표가 들어온 순간에야 방 문서(reveal)로 옮겨진다.
// 틀린 사람의 근거는 방 문서에 아예 쓰지 않는다.
import { CARDS } from './cards.js';

export const ROOMS = 8, HAND = 5, HINT_MAX = 12, REASON_MIN = 10, MIN_P = 3, MAX_P = 5;
export const STALE_MS = 60 * 60 * 1000;      // 한 시간 넘게 아무 일 없던 방은 다음 입장 때 새 방으로
export const CARD = Object.fromEntries(CARDS.map(c => [c.id, c]));

export const roomP = g => [`g${g}`];
export const playerP = (g, pid) => [`g${g}`, 'sokttus_players', pid];
export const deckP = g => [`g${g}`, 'sokttus_secret', 'deck'];

/* ── 규칙 (순수 함수) ─────────────────────────────────────── */

export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const squash = s => String(s ?? '').replace(/\s+/g, '');
export const charLen = s => [...String(s ?? '')].length;
export const normName = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// 힌트: 공백 포함 12자 이내. 금지어는 공백을 지우고 부분 문자열로 찾는다(한 글자 금지어 포함).
// 막힌 낱말 자체는 알려 주지 않는다.
export function checkHint(hint, card) {
  const h = String(hint ?? '').trim();
  if (!h) return { ok: false, msg: '' };
  if (charLen(h) > HINT_MAX) return { ok: false, msg: `힌트는 ${HINT_MAX}자까지 쓸 수 있어요` };
  if (card && card.ban.some(w => squash(h).includes(squash(w)))) return { ok: false, ban: true, msg: '카드에 있는 낱말은 쓸 수 없어요' };
  return { ok: true, msg: '' };
}

// 근거 글자 수는 띄어쓰기를 빼고 센다 (빈칸으로 채우기 방지)
export const reasonCount = s => charLen(squash(s));
export const reasonOk = s => reasonCount(s) >= REASON_MIN;

// 점수: 투표자 전원 맞힘·전원 틀림 → 이야기꾼 0, 나머지 각 2
//       그 밖 → 이야기꾼 3, 맞힌 사람 각 3
//       이야기꾼이 아닌 사람은 자기 카드에 들어온 표마다 +1
export function scoreRound({ order, teller, plays, votes }) {
  const answer = plays[teller];
  const voters = order.filter(p => p !== teller);
  const right = voters.filter(p => votes[p] === answer);
  const kind = right.length === 0 ? 'none' : right.length === voters.length ? 'all' : 'some';
  const delta = Object.fromEntries(order.map(p => [p, 0]));
  if (kind === 'some') { delta[teller] += 3; right.forEach(p => { delta[p] += 3; }); }
  else voters.forEach(p => { delta[p] += 2; });
  const owner = Object.fromEntries(order.map(p => [plays[p], p]));
  for (const p of voters) { const o = owner[votes[p]]; if (o && o !== teller) delta[o] += 1; }
  return { answer, right, kind, delta };
}

export function deal(ids, order) {
  const draw = shuffle(ids), hands = {};
  for (const p of order) hands[p] = draw.splice(0, HAND);
  return { hands, deck: { draw, discard: [] } };
}

// 손패를 5장까지 채운다. 덱이 비면 버린 카드를 섞어서 다시 덱으로.
export function refill(hands, deck, order) {
  let draw = deck.draw.slice(), discard = deck.discard.slice();
  const out = {};
  for (const p of order) {
    const h = hands[p].slice();
    while (h.length < HAND) {
      if (!draw.length) { draw = shuffle(discard); discard = []; if (!draw.length) break; }
      h.push(draw.pop());
    }
    out[p] = h;
  }
  return { hands: out, deck: { draw, discard } };
}

// 동점은 같은 순위
export function ranking(order, scores) {
  return order.map(p => ({ pid: p, score: scores[p] || 0 }))
    .sort((a, b) => b.score - a.score)
    .map((x, _, all) => ({ ...x, rank: 1 + all.filter(y => y.score > x.score).length }));
}

/* ── 방 동작 (store.tx 안에서: 읽기를 모두 끝낸 뒤 쓴다) ─────── */

const now = () => Date.now();
const bad = msg => { throw new Error(msg); };
const voters = r => r.order.filter(p => p !== r.teller);
const blankPlayer = (hand, game, round) => ({ hand, play: null, vote: null, reason: '', game, round });

export function freshRoom(prev) {
  return { epoch: (prev?.epoch || 0) + 1, updatedAt: now(), members: [], names: {}, host: null,
    phase: 'lobby', game: 0, round: 0, order: [], scores: {}, teller: null, hint: '', done: [], table: [], reveal: null };
}
function wipe(t, g, r) {
  for (const pid of Object.keys(r?.names || {})) t.del(playerP(g, pid));
  t.del(deckP(g));
  return freshRoom(r);
}
async function readPlayers(t, g, order) {
  const list = await Promise.all(order.map(p => t.get(playerP(g, p))));
  if (list.some(x => !x)) bad('손패 정보를 찾지 못했어요. 잠시 뒤 다시 눌러 주세요');
  return Object.fromEntries(order.map((p, i) => [p, list[i]]));
}

// 들어가기 · 다시 들어가기(같은 이름이면 같은 자리)
// expectEpoch 를 주면 그 방이 그사이 비워졌을 때 들어가지 않는다(새로고침 자동 복귀용).
export async function join(store, g, rawName, expectEpoch = null) {
  const name = normName(rawName);
  if (!name) bad('이름을 써 주세요');
  if (!(g >= 1 && g <= ROOMS)) bad('모둠 번호를 골라 주세요');
  return store.tx(async t => {
    let r = await t.get(roomP(g));
    const stale = !r || now() - (r.updatedAt || 0) > STALE_MS;
    if (expectEpoch != null && (stale || r.epoch !== expectEpoch)) bad('STALE');
    if (stale) r = wipe(t, g, r);
    let pid = r.members.find(p => r.names[p] === name);
    if (!pid) {
      if (r.phase !== 'lobby' && r.phase !== 'end') bad('이 모둠은 게임 중이에요. 처음에 함께 들어온 이름으로만 다시 들어올 수 있어요');
      if (r.members.length >= MAX_P) bad(`이 모둠은 ${MAX_P}명이 다 찼어요`);
      pid = 'p' + Math.random().toString(36).slice(2, 10);
      r = { ...r, members: [...r.members, pid], names: { ...r.names, [pid]: name }, host: r.host || pid };
    }
    t.set(roomP(g), { ...r, updatedAt: now() });
    return { pid, epoch: r.epoch, name };
  });
}

function dropMember(t, g, r, pid) {
  const members = r.members.filter(p => p !== pid);
  if (!members.length) { t.set(roomP(g), wipe(t, g, r)); return; }
  t.set(roomP(g), { ...r, members, host: r.host === pid ? members[0] : r.host, updatedAt: now() });
}

export async function leave(store, g, pid) {
  return store.tx(async t => {
    const r = await t.get(roomP(g));
    if (!r || !r.members.includes(pid)) return;
    if (r.phase !== 'lobby' && r.phase !== 'end') bad('게임 중에는 나갈 수 없어요');
    dropMember(t, g, r, pid);
  });
}

export async function kick(store, g, by, pid) {
  return store.tx(async t => {
    const r = await t.get(roomP(g));
    if (!r || r.phase !== 'lobby' || r.host !== by || pid === by || !r.members.includes(pid)) return;
    dropMember(t, g, r, pid);
  });
}

// 시작 · 한 판 더: 40장을 새로 섞어 5장씩. 이야기꾼은 들어온 순서대로.
export async function start(store, g, by) {
  return store.tx(async t => {
    const r = await t.get(roomP(g));
    if (!r) bad('방을 찾지 못했어요');
    if (r.phase === 'lobby') { if (r.host !== by) bad('방장만 시작할 수 있어요'); }
    else if (r.phase !== 'end') return;                       // 누군가 먼저 시작함
    if (!r.members.includes(by)) bad('이 방에 없는 사람이에요');
    if (r.members.length < MIN_P || r.members.length > MAX_P) bad(`${MIN_P}~${MAX_P}명이 모여야 시작할 수 있어요`);
    const order = r.members.slice(), game = r.game + 1;
    const { hands, deck } = deal(CARDS.map(c => c.id), order);
    for (const p of order) t.set(playerP(g, p), blankPlayer(hands[p], game, 0));
    t.set(deckP(g), deck);
    t.set(roomP(g), { ...r, phase: 'hint', game, round: 0, order, scores: Object.fromEntries(order.map(p => [p, 0])),
      teller: order[0], hint: '', done: [], table: [], reveal: null, updatedAt: now() });
  });
}

export async function giveHint(store, g, pid, cardId, hint) {
  const h = String(hint ?? '').trim(), chk = checkHint(h, CARD[cardId]);
  if (!CARD[cardId]) bad('카드를 골라 주세요');
  if (!chk.ok) bad(chk.msg || '힌트를 써 주세요');
  return store.tx(async t => {
    const r = await t.get(roomP(g)), m = await t.get(playerP(g, pid));
    if (r?.phase !== 'hint' || r.teller !== pid) return;
    if (!m?.hand.includes(cardId)) bad('손패에 없는 카드예요');
    t.set(playerP(g, pid), { ...m, hand: m.hand.filter(c => c !== cardId), play: cardId });
    t.set(roomP(g), { ...r, hint: h, phase: 'play', done: [], updatedAt: now() });
  });
}

export async function playCard(store, g, pid, cardId) {
  return store.tx(async t => {
    const r = await t.get(roomP(g));
    if (r?.phase !== 'play' || pid === r.teller || !r.order.includes(pid) || r.done.includes(pid)) return;
    const ps = await readPlayers(t, g, r.order), m = ps[pid];
    if (!m.hand.includes(cardId)) bad('손패에 없는 카드예요');
    ps[pid] = { ...m, hand: m.hand.filter(c => c !== cardId), play: cardId };
    t.set(playerP(g, pid), ps[pid]);
    const done = [...r.done, pid], next = { ...r, done, updatedAt: now() };
    if (voters(r).every(p => done.includes(p)))
      Object.assign(next, { phase: 'vote', done: [], table: shuffle(r.order.map(p => ps[p].play)) });
    t.set(roomP(g), next);
  });
}

export async function castVote(store, g, pid, cardId, reason) {
  if (!reasonOk(reason)) bad(`근거를 ${REASON_MIN}자 이상 써 주세요`);
  return store.tx(async t => {
    const r = await t.get(roomP(g));
    if (r?.phase !== 'vote' || pid === r.teller || !r.order.includes(pid) || r.done.includes(pid)) return;
    const ps = await readPlayers(t, g, r.order), m = ps[pid];
    if (!r.table.includes(cardId)) bad('그 카드는 없어요');
    if (cardId === m.play) bad('내가 낸 카드에는 투표할 수 없어요');
    ps[pid] = { ...m, vote: cardId, reason: String(reason).trim() };
    t.set(playerP(g, pid), ps[pid]);
    const done = [...r.done, pid], next = { ...r, done, updatedAt: now() };
    if (voters(r).every(p => done.includes(p))) Object.assign(next, revealOf(r, ps), { phase: 'reveal', done: [] });
    t.set(roomP(g), next);
  });
}

function revealOf(r, ps) {
  const plays = Object.fromEntries(r.order.map(p => [p, ps[p].play]));
  const votes = Object.fromEntries(r.order.map(p => [p, ps[p].vote]));
  const sc = scoreRound({ order: r.order, teller: r.teller, plays, votes });
  const owner = Object.fromEntries(r.order.map(p => [plays[p], p]));
  const rows = r.table.map(card => ({ card, owner: owner[card], voters: voters(r).filter(p => votes[p] === card) }));
  const reasons = sc.right.map(p => ({ pid: p, text: ps[p].reason }));     // 맞힌 사람 것만
  const scores = { ...r.scores };
  for (const p of r.order) scores[p] = (scores[p] || 0) + sc.delta[p];
  return { scores, reveal: { answer: sc.answer, kind: sc.kind, rows, reasons, delta: sc.delta } };
}

// 공개 화면의 [다음]: 모두 누르면 손패를 5장으로 채우고 다음 이야기꾼으로. 마지막 라운드였으면 끝.
export async function next(store, g, pid) {
  return store.tx(async t => {
    const r = await t.get(roomP(g));
    if (r?.phase !== 'reveal' || !r.order.includes(pid) || r.done.includes(pid)) return;
    const done = [...r.done, pid];
    if (!r.order.every(p => done.includes(p))) { t.set(roomP(g), { ...r, done, updatedAt: now() }); return; }
    const round = r.round + 1;
    if (round >= r.order.length) { t.set(roomP(g), { ...r, phase: 'end', done: [], updatedAt: now() }); return; }
    const deck = await t.get(deckP(g)), ps = await readPlayers(t, g, r.order);
    const hands = Object.fromEntries(r.order.map(p => [p, ps[p].hand]));
    const fill = refill(hands, { draw: deck?.draw || [], discard: [...(deck?.discard || []), ...r.table] }, r.order);
    for (const p of r.order) t.set(playerP(g, p), blankPlayer(fill.hands[p], r.game, round));
    t.set(deckP(g), fill.deck);
    t.set(roomP(g), { ...r, phase: 'hint', round, teller: r.order[round], hint: '', done: [], table: [], reveal: null, updatedAt: now() });
  });
}

// 담임용: 1~8모둠 방을 모두 비운다
export function resetAll(store) {
  return Promise.all(Array.from({ length: ROOMS }, (_, i) => store.tx(async t => {
    const g = i + 1, r = await t.get(roomP(g));
    t.set(roomP(g), wipe(t, g, r));
  })));
}
