// 벽란도 무역항 · 개인 상인판 · 밸런스 확인
// 사용법:  node byeokrando/solo/check-balance.mjs
// board.html 의 DATA·buildGame 과 공용 코드의 자동 배정(pickTeam)을 그대로 읽어, 반 인원 수별로
//  ① 자동 배정 결과(팀 인원)  ② 물건 수량 ≥ 주문서  ③ 실제 규칙(고려↔외국만, 1:1 맞교환, 납품, 아라비아)으로
//     무작위 순서 거래를 200번 흉내 내어 모든 팀 주문서가 "동시에" 완성되는지 확인합니다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'board.html'), 'utf8');
const grab = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const src = grab('/*<DATA>*/', '/*</DATA>*/'), pick = grab('function pickTeam', 'async function joinGame');
const { DATA, buildGame, pickTeam } = new Function(`const sum = o => Object.values(o || {}).reduce((s, n) => s + (Number(n) || 0), 0); ${src}; ${pick}; return { DATA, buildGame, pickTeam };`)();
const sum = o => Object.values(o || {}).reduce((s, n) => s + (Number(n) || 0), 0);

function roster(N) {
  const counts = {}, r = {}, team = {};
  for (let i = 0; i < N; i++) { const d = pickTeam(DATA.teams, counts); counts[d.id] = (counts[d.id] || 0) + 1; (r[d.id] ??= []).push('p' + i); team['p' + i] = d; }
  return { r, team };
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function simulate(N, seed) {
  const R = rng(seed), choose = a => a[Math.floor(R() * a.length)];
  const { r, team } = roster(N), g = buildGame(r);
  const P = Object.keys(team).map(id => ({ id, team: team[id].id, gor: team[id].nation === '고려', nation: team[id].nation, items: { ...g.items[id] } }));
  const T = Object.fromEntries(g.teamIds.map(id => [id, { order: { ...g.order[id] }, got: {} }]));
  Object.entries(g.arabOrder).forEach(([id, o]) => Object.entries(o).forEach(([x, q]) => T[id].order[x] = (T[id].order[x] || 0) + q));
  const stock = { ...g.arabia.stock }, pays = Object.keys(g.arabia.price);
  const members = id => P.filter(p => p.team === id);
  const needT = (id, x) => Math.max(0, (T[id].order[x] || 0) - (T[id].got[x] || 0));
  const haveT = (id, x) => members(id).reduce((s, p) => s + (p.items[x] || 0), 0);
  const short = (id, x) => Math.max(0, needT(id, x) - haveT(id, x));                   // 팀이 아직 구해야 하는 수
  const spare = (p, x) => Math.min(p.items[x] || 0, Math.max(0, haveT(p.team, x) - needT(p.team, x)));
  const spareList = p => Object.keys(p.items).filter(x => spare(p, x) > 0);
  const ok = (a, b) => a.team !== b.team && (a.gor || b.gor);   // 한 팀끼리·외국끼리 금지, 고려 상단끼리는 가능
  let trades = 0;
  const swap = (a, x, b, y) => { a.items[x]--; b.items[x] = (b.items[x] || 0) + 1; b.items[y]--; a.items[y] = (a.items[y] || 0) + 1; trades++; };
  const deliverAll = p => { Object.keys(p.items).forEach(x => { const n = Math.min(p.items[x], needT(p.team, x)); if (n > 0) { p.items[x] -= n; T[p.team].got[x] = (T[p.team].got[x] || 0) + n; } }); };
  const done = () => Object.keys(T).every(id => Object.keys(T[id].order).every(x => needT(id, x) === 0));
  for (let it = 0; it < 3000 && !done(); it++) {
    let progress = false;
    for (const x of [...P].sort(() => R() - .5)) {
      deliverAll(x);
      const wants = Object.keys(T[x.team].order).filter(y => short(x.team, y) > 0);
      if (!wants.length) continue;
      const y = choose(wants);
      if (x.gor && stock[y] !== undefined) {                                            // 아라비아
        const p = pays.find(p => spare(x, p) > 0);
        if (p && stock[y] > 0) { x.items[p]--; x.items[y] = (x.items[y] || 0) + 1; stock[y]--; progress = true; continue; }
        const cands = P.filter(o => ok(x, o) && pays.some(p => spare(o, p) > 0)), give = spareList(x).filter(h => !pays.includes(h));
        if (cands.length && give.length) { const o = choose(cands); swap(x, choose(give), o, pays.find(p => spare(o, p) > 0)); progress = true; continue; }
        const mid = P.filter(o => !o.gor && spareList(o).length), hold = P.filter(o => o.gor && o !== x && pays.some(p => spare(o, p) > 0));
        if (mid.length && hold.length) { const m = choose(mid), h = choose(hold); const p = pays.find(p => spare(h, p) > 0); const mg = spareList(m); if (mg.length) { swap(m, choose(mg), h, p); progress = true; } }
        continue;
      }
      const holders = P.filter(o => o !== x && spare(o, y) > 0), direct = holders.filter(o => ok(x, o)), give = spareList(x);
      if (direct.length && give.length) { const o = choose(direct), useful = give.filter(h => short(o.team, h) > 0); swap(x, choose(useful.length ? useful : give), o, y); progress = true; continue; }
      if (holders.length) {                                                             // 중계: 반대편 상인이 대신 사 옴
        const h = choose(holders), mids = P.filter(m => ok(m, h) && ok(m, x) && spareList(m).filter(z => z !== y).length);
        if (mids.length) { const m = choose(mids); swap(m, choose(spareList(m).filter(z => z !== y)), h, y); progress = true; }
      }
    }
    if (!progress && !done()) { P.forEach(deliverAll); if (!done()) break; }
  }
  P.forEach(deliverAll);
  return { ok: done(), trades, left: Object.keys(T).filter(id => Object.keys(T[id].order).some(x => needT(id, x) > 0)) };
}

let allOk = true; const lines = [];
for (const N of [12, 16, 20, 22, 24, 25, 26, 27, 28, 30]) {
  const { r } = roster(N), g = buildGame(r);
  const sizes = g.teamIds.map(id => `${id}${r[id].length}`).join(' ');
  const gor = g.teamIds.filter(id => DATA.teams.find(d => d.id === id).nation === '고려').reduce((s, id) => s + r[id].length, 0);
  let okN = 0, maxT = 0, fail = null; const RUNS = 200;
  for (let s = 1; s <= RUNS; s++) { const res = simulate(N, s * 97); if (res.ok) { okN++; maxT = Math.max(maxT, res.trades); } else fail ??= res.left; }
  allOk &&= okN === RUNS;
  if (N === 26) {
    console.log(`\n■ 26명 자세히`);
    g.teamIds.forEach(id => console.log(`  ${id.padEnd(4)} ${r[id].length}명  주문 ${JSON.stringify(g.order[id])}${Object.keys(g.arabOrder[id] || {}).length ? '  +입항 ' + JSON.stringify(g.arabOrder[id]) : ''}`));
    const per = Object.values(g.items).map(sum); console.log(`  한 사람 물건 수: ${Math.min(...per)}~${Math.max(...per)}개 · 아라비아 재고 ${JSON.stringify(g.arabia.stock)}`);
    r['송'].slice(0, 2).concat(r['개경'].slice(0, 2)).forEach(p => console.log(`  예) ${p}: ${JSON.stringify(g.items[p])}`));
  }
  console.log(`${String(N).padStart(2)}명: 고려 ${gor} : 외국 ${N - gor} · ${sizes} · 동시 완성 ${okN}/${RUNS}${fail ? ' (실패 예 ' + fail.join(',') + ')' : ''} · 필요 거래 최대 ${maxT}건`);
  lines.push(`${N}명 ${okN === RUNS ? '가능' : '불가'}`);
}
console.log(`\n결과: ${lines.join(' · ')} → ${allOk ? '모든 인원 수에서 모든 팀 주문서 동시 완성 가능' : '확인 필요'}`);
process.exit(allOk ? 0 : 1);
