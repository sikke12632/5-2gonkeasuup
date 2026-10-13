// 방언 장터 · 밸런스 확인:  node saturi/check-balance.mjs
// cards.js 와 core.js 의 카드 나눠 주기를 그대로 써서, 인원 수별로 무작위 거래(1:1 맞교환, 같은 지역끼리 금지)를
// 200번 흉내 내어 모든 팀이 주문서를 동시에 채울 수 있는지 확인합니다.
globalThis.window = { addEventListener() {}, dispatchEvent() {} }; globalThis.location = { search: '' };
const { GAME, REGIONS, CAT, buildGame, pickDeck, pickTeam, sum } = await import('./core.js');
function rng(s) { s >>>= 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function roster(N) { const counts = {}, r = {}, team = {}; for (let i = 0; i < N; i++) { const t = pickTeam(REGIONS.map(x => x.id), counts); counts[t] = (counts[t] || 0) + 1; (r[t] ??= []).push('p' + i); team['p' + i] = t; } return { r, team }; }
function sim(N, seed) {
  const R = rng(seed), pick = a => a[Math.floor(R() * a.length)];
  const { r, team } = roster(N), g = buildGame(r, pickDeck(Object.keys(r), {}, GAME, R)), H = JSON.parse(JSON.stringify(g.hand)), got = {}; let trades = 0;
  const own = p => Object.keys(H[p]).filter(c => H[p][c] > 0 && CAT[c].region === team[p]);
  const spare = p => Object.keys(H[p]).filter(c => H[p][c] > 0 && CAT[c].region !== team[p]);
  const deliverAll = () => Object.keys(H).forEach(p => own(p).forEach(c => { got[team[p]] = (got[team[p]] || 0) + H[p][c]; H[p][c] = 0; }));
  const done = () => g.teamIds.every(t => (got[t] || 0) >= g.target[t]);
  for (let it = 0; it < 4000 && !done(); it++) {
    deliverAll(); if (done()) break;
    const need = Object.keys(H).filter(p => (got[team[p]] || 0) < g.target[team[p]] && spare(p).length);
    if (!need.length) break;
    const x = pick(need), holders = Object.keys(H).filter(y => team[y] !== team[x] && spare(y).some(c => CAT[c].region === team[x]));
    if (!holders.length) continue;
    const y = pick(holders), cy = pick(spare(y).filter(c => CAT[c].region === team[x]));
    const useful = spare(x).filter(c => CAT[c].region === team[y]), cx = pick(useful.length ? useful : spare(x));
    H[x][cx]--; H[y][cx] = (H[y][cx] || 0) + 1; H[y][cy]--; H[x][cy] = (H[x][cy] || 0) + 1; trades++;
  }
  deliverAll();
  return { ok: done(), trades, per: Object.values(g.hand).map(sum) };
}
let all = true; const out = [];
for (const N of [10, 15, 20, 24, 25, 26, 27, 28, 30]) {
  let ok = 0, mx = 0, per = null; for (let s = 1; s <= 200; s++) { const z = sim(N, s * 131); if (z.ok) { ok++; mx = Math.max(mx, z.trades); } per ??= z.per; }
  const { r } = roster(N); all &&= ok === 200;
  console.log(`${String(N).padStart(2)}명: ${REGIONS.filter(x => r[x.id]).map(x => x.id + r[x.id].length).join(' ')} · 한 사람 카드 ${Math.min(...per)}~${Math.max(...per)}장 · 동시 완성 ${ok}/200 · 필요 거래 최대 ${mx}건`);
  out.push(`${N}명 ${ok === 200 ? '가능' : '불가'}`);
}
console.log(`\n결과: ${out.join(' · ')} → ${all ? '모든 인원에서 모든 팀 동시 완성 가능' : '확인 필요'}`);
process.exit(all ? 0 : 1);
