// 벽란도 무역항 · 밸런스 확인 스크립트
// 사용법:  node byeokrando/check-balance.mjs
// board.html 의 DATA·buildSetup 을 그대로 읽어, 모둠 수 5~8 각각에 대해
//  ① 물건마다 전체 수량 ≥ 모든 주문서 합 (1라운드 주문서 / 입항 후 주문서)
//  ② 실제 규칙(1:1 이상 맞교환, 한쪽은 반드시 고려, 아라비아는 고려만·금/비단 1개)으로
//     무작위 순서 거래를 200번 흉내 내어 모든 모둠의 주문서가 "동시에" 완성되는지 확인합니다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'board.html'), 'utf8');
const src = html.slice(html.indexOf('/*<DATA>*/'), html.indexOf('/*</DATA>*/'));
const { DATA, buildSetup } = new Function(`${src}; return { DATA, buildSetup };`)();

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function simulate(setup, withArabia, seed) {
  const R = rng(seed), pick = a => a[Math.floor(R() * a.length)];
  const T = setup.teams.map(t => ({ ...t, inv: { ...t.inv }, order: withArabia ? { ...t.order, ...Object.fromEntries(Object.entries(t.arabOrder).map(([g, q]) => [g, (t.order[g] || 0) + q])) } : { ...t.order } }));
  const stock = { ...setup.arabia.stock }, price = setup.arabia.price, arabSells = Object.keys(stock);
  const gor = t => t.nation === '고려';
  const need = (t, g) => Math.max(0, (t.order[g] || 0) - (t.inv[g] || 0));
  const spare = (t, g) => Math.max(0, (t.inv[g] || 0) - (t.order[g] || 0));
  const spareItems = t => Object.keys(t.inv).filter(g => spare(t, g) > 0);
  const done = () => T.every(t => Object.keys(t.order).every(g => need(t, g) === 0));
  let trades = 0;
  const swap = (x, gx, y, gy) => { x.inv[gx]--; y.inv[gx] = (y.inv[gx] || 0) + 1; y.inv[gy]--; x.inv[gy] = (x.inv[gy] || 0) + 1; trades++; };
  for (let iter = 0; iter < 5000 && !done(); iter++) {
    let progress = false;
    for (const x of [...T].sort(() => R() - .5)) {
      for (const g of Object.keys(x.order).filter(g => need(x, g) > 0)) {
        if (withArabia && gor(x) && arabSells.includes(g)) {                                  // 아라비아에서 사기
          const p = Object.keys(price).find(p => stock[g] > 0 && spare(x, p) >= price[p]);
          if (p) { x.inv[p] -= price[p]; x.inv[g] = (x.inv[g] || 0) + 1; stock[g]--; trades++; progress = true; continue; }
          // 낼 금·비단이 없으면: 금·비단을 가진 고려 상인에게서 사 오기
          const pays = Object.keys(price);
          const y = T.find(y => y !== x && pays.some(p => spare(y, p) > 0) && (gor(x) || gor(y)));
          const give = spareItems(x).filter(h => !pays.includes(h));
          if (y && give.length) { const p = pays.find(p => spare(y, p) > 0); swap(x, pick(give), y, p); progress = true; }
          continue;
        }
        const holders = T.filter(y => y !== x && spare(y, g) > 0);
        const direct = holders.filter(y => gor(x) || gor(y));
        const giveList = spareItems(x);
        if (direct.length && giveList.length) {
          const y = pick(direct), useful = giveList.filter(h => need(y, h) > 0);
          swap(x, pick(useful.length ? useful : giveList), y, g); progress = true; continue;
        }
        if (holders.length && !gor(x)) {                                                      // 외국 ↔ 외국: 고려 상인이 중계
          const y = pick(holders), m = pick(T.filter(gor)), mGive = spareItems(m).filter(h => h !== g);
          if (mGive.length) { swap(m, pick(mGive), y, g); progress = true; }
        }
      }
    }
    if (!progress) break;
  }
  return { ok: done(), trades, left: T.filter(t => Object.keys(t.order).some(g => need(t, g) > 0)).map(t => t.id) };
}

let allOk = true;
const lines = [];
for (const n of [5, 6, 7, 8]) {
  const s = buildSetup(n);
  // ① 수량 합 확인
  const total = {}, need1 = {}, need2 = {};
  s.teams.forEach(t => { Object.entries(t.inv).forEach(([g, q]) => total[g] = (total[g] || 0) + q); Object.entries(t.order).forEach(([g, q]) => { need1[g] = (need1[g] || 0) + q; need2[g] = (need2[g] || 0) + q; }); Object.entries(t.arabOrder).forEach(([g, q]) => need2[g] = (need2[g] || 0) + q); });
  Object.entries(s.arabia.stock).forEach(([g, q]) => total[g] = (total[g] || 0) + q);
  const payNeed = Object.keys(s.arabia.price).reduce((sum, p) => sum + (total[p] || 0) - (need1[p] || 0), 0), arabUnits = Object.values(s.arabDemand).reduce((a, b) => a + b, 0);
  const short1 = Object.entries(need1).filter(([g, q]) => (total[g] || 0) < q), short2 = Object.entries(need2).filter(([g, q]) => (total[g] || 0) < q);
  const payOk = payNeed >= arabUnits;
  // ② 거래 흉내
  let ok1 = 0, ok2 = 0, maxTrades = 0; const RUNS = 200;
  for (let seed = 1; seed <= RUNS; seed++) { const a = simulate(s, false, seed), b = simulate(s, true, seed * 7919); if (a.ok) ok1++; if (b.ok) { ok2++; maxTrades = Math.max(maxTrades, b.trades); } else if (seed < 3) console.log('  실패 예', n, b.left); }
  const ok = !short1.length && !short2.length && payOk && ok1 === RUNS && ok2 === RUNS;
  allOk &&= ok;
  console.log(`\n■ ${n}모둠: ${s.teamIds.join(' · ')}`);
  s.teams.forEach(t => console.log(`  ${t.id.padEnd(4)} 창고 ${JSON.stringify(t.inv)}  주문 ${JSON.stringify(t.order)}${Object.keys(t.arabOrder).length ? ' +입항 ' + JSON.stringify(t.arabOrder) : ''}`));
  console.log(`  아라비아 재고 ${JSON.stringify(s.arabia.stock)} · 값 ${JSON.stringify(s.arabia.price)}`);
  console.log(`  수량 부족(1R) ${short1.length ? JSON.stringify(short1) : '없음'} · 수량 부족(입항 후) ${short2.length ? JSON.stringify(short2) : '없음'} · 아라비아 값 ${payOk ? '충분' : '부족'}`);
  console.log(`  흉내 ${RUNS}회: 1라운드 주문서 전부 완성 ${ok1}/${RUNS} · 입항 후 주문서 전부 완성 ${ok2}/${RUNS} (필요 거래 최대 ${maxTrades}건)`);
  lines.push(`${n}모둠 ${ok ? '가능' : '불가'}`);
}
console.log(`\n결과: ${lines.join(' · ')} → ${allOk ? '모든 모둠 수에서 모든 주문서 동시 완성 가능' : '확인 필요'}`);
process.exit(allOk ? 0 : 1);
