// 속뜻 카드 규칙 점검 — node sokttus/check.mjs
// 화면 없이 game.js 의 방 동작을 메모리 저장소로 끝까지 돌려 본다.
import assert from 'node:assert/strict';
import { CARDS } from './cards.js';
import * as G from './game.js';

let fails = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => console.log('  ✔', name), e => { fails++; console.log('  ✘', name, '\n    ', e.message); });

function memStore() {
  const db = new Map(), k = p => p.join('/');
  return {
    db,
    peek: p => structuredClone(db.get(k(p)) ?? null),
    poke: (p, d) => db.set(k(p), structuredClone(d)),
    async tx(fn) {
      const w = new Map();
      const out = await fn({ get: async p => structuredClone(db.get(k(p)) ?? null), set: (p, d) => w.set(k(p), structuredClone(d)), del: p => w.set(k(p), null) });
      for (const [kk, v] of w) v === null ? db.delete(kk) : db.set(kk, v);
      return out;
    }
  };
}
const C = id => G.CARD[id];

console.log('카드 데이터');
await ok('40장, id 겹침 없음', () => { assert.equal(CARDS.length, 40); assert.equal(new Set(CARDS.map(c => c.id)).size, 40); });
await ok('ban 낱말은 모두 카드 문장 안에 있음', () => {
  for (const c of CARDS) for (const w of c.ban) assert.ok(c.text.replace(/\s/g, '').includes(w), `${c.id} ${w}`);
});

console.log('힌트·근거 검사 (완료 기준 3)');
await ok('"버스 앞자리" 거부', () => assert.equal(G.checkHint('버스 앞자리', C('c12')).ban, true));
await ok('"꿈쩍도 안 했다" 통과', () => assert.equal(G.checkHint('꿈쩍도 안 했다', C('c12')).ok, true));
await ok('띄어 쓴 금지어 "앞 자 리"도 거부', () => assert.equal(G.checkHint('앞 자 리', C('c12')).ban, true));
await ok('한 글자 금지어 "웃"', () => { assert.equal(G.checkHint('다들 웃기만 해', C('c32')).ban, true); assert.equal(G.checkHint('나만 모르는 농담', C('c32')).ok, true); });
await ok('막힌 낱말을 알려 주지 않음', () => assert.equal(G.checkHint('버스', C('c12')).msg, '카드에 있는 낱말은 쓸 수 없어요'));
await ok('공백 포함 12자까지', () => { assert.equal(G.checkHint('가나다라 마바사아 자', C('c12')).ok, true); assert.equal(G.checkHint('가나다라 마바사아 자차카', C('c12')).ok, false); });
await ok('근거 9자 → 안 됨, 10자 → 됨', () => { assert.equal(G.reasonOk('가나다라마바사아자'), false); assert.equal(G.reasonOk('가나다라마바사아자차'), true); assert.equal(G.reasonOk('가 나 다 라 마 바 사 아 자'), false); });

console.log('예시 라운드 (완료 기준 2)');
async function exampleRound() {
  const s = memStore(), g = 3, P = {};
  for (const n of ['민준', '서아', '도현', '지유']) P[n] = (await G.join(s, g, n)).pid;
  await G.start(s, g, P.민준);
  // 예시 카드가 그 사람 손패에 오도록, 지금 가진 곳(덱이나 다른 손패)과 맞바꾼다
  const want = { 민준: 'c12', 서아: 'c39', 도현: 'c18', 지유: 'c08' };
  const all = Object.values(want);
  for (const [n, id] of Object.entries(want)) {
    const m = s.peek(G.playerP(g, P[n]));
    if (m.hand.includes(id)) continue;
    const give = m.hand.find(c => !all.includes(c));
    m.hand[m.hand.indexOf(give)] = id;
    const d = s.peek(G.deckP(g));
    if (d.draw.includes(id)) { d.draw[d.draw.indexOf(id)] = give; s.poke(G.deckP(g), d); }
    else for (const p of Object.values(P)) {
      const o = s.peek(G.playerP(g, p));
      if (p !== P[n] && o.hand.includes(id)) { o.hand[o.hand.indexOf(id)] = give; s.poke(G.playerP(g, p), o); }
    }
    s.poke(G.playerP(g, P[n]), m);
  }
  await assert.rejects(G.giveHint(s, g, P.민준, 'c12', '버스 앞자리'), /카드에 있는 낱말/);
  await G.giveHint(s, g, P.민준, 'c12', '꿈쩍도 안 했다');
  await G.playCard(s, g, P.서아, 'c39');
  await G.playCard(s, g, P.도현, 'c18');
  assert.equal(s.peek(G.roomP(g)).phase, 'play');
  await G.playCard(s, g, P.지유, 'c08');
  let r = s.peek(G.roomP(g));
  assert.equal(r.phase, 'vote');
  assert.deepEqual([...r.table].sort(), ['c08', 'c12', 'c18', 'c39']);
  assert.equal(JSON.stringify(r).includes('서아'), true);              // 이름은 있어도
  assert.equal(r.reveal, null);                                         // 정답·주인은 아직 없음
  await assert.rejects(G.castVote(s, g, P.지유, 'c08', '내 카드에 투표해 보기 연습'), /내가 낸 카드/);
  await assert.rejects(G.castVote(s, g, P.서아, 'c12', '가나다라마바사아자'), /10자/);
  await G.castVote(s, g, P.서아, 'c12', '꿈쩍도 안 했다니까 일어나지 않은 1번');
  await G.castVote(s, g, P.도현, 'c08', '꿈쩍도 안 하고 서 있었으니까');
  assert.equal(s.peek(G.roomP(g)).reveal, null);
  await G.castVote(s, g, P.지유, 'c12', '시켜도 안 움직이는 거라서 ①');
  r = s.peek(G.roomP(g));
  return { s, g, P, r };
}
const ex = await exampleRound();
await ok('민준 3 · 서아 3 · 지유 4 · 도현 0', () => {
  const { r, P } = ex;
  assert.equal(r.phase, 'reveal');
  assert.deepEqual([r.reveal.delta[P.민준], r.reveal.delta[P.서아], r.reveal.delta[P.지유], r.reveal.delta[P.도현]], [3, 3, 4, 0]);
  assert.deepEqual([r.scores[P.민준], r.scores[P.서아], r.scores[P.지유], r.scores[P.도현]], [3, 3, 4, 0]);
});
await ok('공개 근거는 서아·지유 것만 (도현 근거는 방 문서 어디에도 없음)', () => {
  const { r, P } = ex;
  assert.deepEqual(r.reveal.reasons.map(x => x.pid), [P.서아, P.지유]);
  assert.equal(JSON.stringify(r).includes('서 있었으니까'), false);
});
await ok('공개 표: 정답 c12 · 각 카드 주인 · 투표', () => {
  const { r, P } = ex, row = id => r.reveal.rows.find(x => x.card === id);
  assert.equal(r.reveal.answer, 'c12');
  assert.equal(row('c12').owner, P.민준); assert.deepEqual(row('c12').voters.sort(), [P.서아, P.지유].sort());
  assert.deepEqual(row('c08').voters, [P.도현]); assert.equal(row('c39').owner, P.서아);
});

console.log('끝까지 진행');
// 아무 카드나 내고 아무 데나 투표하면서 한 판을 끝까지
async function playGame(s, g, P, { checkHands = true } = {}) {
  let r = s.peek(G.roomP(g)), rounds = 0;
  while (r.phase !== 'end') {
    if (r.phase === 'hint') {
      const m = s.peek(G.playerP(g, r.teller));
      if (checkHands) for (const p of r.order) assert.equal(s.peek(G.playerP(g, p)).hand.length, 5, '손패 5장');
      await G.giveHint(s, g, r.teller, m.hand[0], '어떤 마음일까');
    } else if (r.phase === 'play') {
      for (const p of r.order) if (p !== r.teller) await G.playCard(s, g, p, s.peek(G.playerP(g, p)).hand[1]);
    } else if (r.phase === 'vote') {
      for (const p of r.order) if (p !== r.teller) {
        const mine = s.peek(G.playerP(g, p)).play;
        await G.castVote(s, g, p, r.table.find(c => c !== mine), '아무래도 이 카드 같아요');
      }
    } else if (r.phase === 'reveal') {
      rounds++;
      // 카드 보존: 손패 + 덱 + 버린 카드 + 이번 판에 낸 카드 = 40장, 겹침 없음
      const d = s.peek(G.deckP(g)), cards = [...d.draw, ...d.discard, ...r.table];
      for (const p of r.order) cards.push(...s.peek(G.playerP(g, p)).hand);
      assert.equal(cards.length, 40); assert.equal(new Set(cards).size, 40);
      for (const p of r.order) await G.next(s, g, p);
    }
    r = s.peek(G.roomP(g));
  }
  return { r, rounds };
}
await ok('4명: 예시 라운드에 이어 4라운드 끝, 이야기꾼 한 번씩', async () => {
  const { s, g, P } = ex;
  const tellers = [s.peek(G.roomP(g)).teller];
  let r = s.peek(G.roomP(g));
  for (const p of r.order) await G.next(s, g, p);
  r = s.peek(G.roomP(g));
  assert.equal(r.round, 1); tellers.push(r.teller);
  const res = await playGame(s, g, P);
  assert.equal(res.rounds, 3); assert.equal(res.r.phase, 'end');
  assert.equal(G.ranking(res.r.order, res.r.scores).length, 4);
});
await ok('5명: 덱이 떨어지면 버린 카드를 섞어 다시 씀', async () => {
  const s = memStore(), g = 5, P = {};
  for (const n of ['가', '나', '다', '라', '마']) P[n] = (await G.join(s, g, n)).pid;
  await G.start(s, g, P.가);
  const res = await playGame(s, g, P);
  assert.equal(res.rounds, 5);
});
await ok('3명: 투표자 2명, 1명만 맞히면 이야기꾼·맞힌 사람 +3', async () => {
  const d = G.scoreRound({ order: ['a', 'b', 'c'], teller: 'a', plays: { a: 'x', b: 'y', c: 'z' }, votes: { b: 'x', c: 'y' } }).delta;
  assert.deepEqual(d, { a: 3, b: 3 + 1, c: 0 });
  const s = memStore(), g = 7, P = {};
  for (const n of ['가', '나', '다']) P[n] = (await G.join(s, g, n)).pid;
  await G.start(s, g, P.가);
  assert.equal((await playGame(s, g, P)).rounds, 3);
});
await ok('전원 맞힘 · 전원 틀림 → 이야기꾼 0, 나머지 2 (+표)', () => {
  const base = { order: ['a', 'b', 'c', 'd'], teller: 'a', plays: { a: 'w', b: 'x', c: 'y', d: 'z' } };
  assert.deepEqual(G.scoreRound({ ...base, votes: { b: 'w', c: 'w', d: 'w' } }).delta, { a: 0, b: 2, c: 2, d: 2 });
  assert.deepEqual(G.scoreRound({ ...base, votes: { b: 'y', c: 'x', d: 'x' } }).delta, { a: 0, b: 4, c: 3, d: 2 });
});

console.log('방');
await ok('같은 이름으로 다시 들어오면 같은 자리 · 게임 중 새 이름은 못 들어옴', async () => {
  const s = memStore(), g = 1, P = {};
  for (const n of ['가', '나', '다']) P[n] = (await G.join(s, g, n)).pid;
  await assert.rejects(G.start(s, g, P.나), /방장/);
  await G.start(s, g, P.가);
  assert.equal((await G.join(s, g, ' 나 ')).pid, P.나);
  await assert.rejects(G.join(s, g, '라'), /게임 중/);
});
await ok('6번째는 못 들어옴 · 다른 모둠 방은 따로', async () => {
  const s = memStore();
  for (const n of ['1', '2', '3', '4', '5']) await G.join(s, 2, n);
  await assert.rejects(G.join(s, 2, '6'), /5명/);
  await G.join(s, 4, '6');
  assert.equal(s.peek(G.roomP(4)).members.length, 1);
});
await ok('담임 비우기: 8개 방 모두 새 방(epoch+1), 손패 문서도 지움', async () => {
  const s = memStore(), P = {};
  for (const n of ['가', '나', '다']) P[n] = (await G.join(s, 6, n)).pid;
  await G.start(s, 6, P.가);
  const e = s.peek(G.roomP(6)).epoch;
  await G.resetAll(s);
  assert.equal(s.peek(G.roomP(6)).epoch, e + 1); assert.equal(s.peek(G.roomP(6)).members.length, 0);
  assert.equal(s.peek(G.playerP(6, P.가)), null); assert.equal(s.peek(G.deckP(6)), null);
  for (let g = 1; g <= 8; g++) assert.equal(s.peek(G.roomP(g)).phase, 'lobby');
  await assert.rejects(G.join(s, 6, '가', e), /STALE/);
});

console.log(fails ? `\n✘ ${fails}개 실패` : '\n모두 통과');
process.exit(fails ? 1 : 0);
