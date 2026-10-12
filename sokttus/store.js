// 저장소 두 벌 — 쓰는 쪽 모양은 같다: watch(path, cb) / tx(async t => { t.get · t.set · t.del })
//   firestoreStore : 실제 수업용 (Firestore만. Realtime Database는 학교망에서 막힘)
//   localStore     : ?demo=1 점검 모드. 한 브라우저의 여러 탭끼리만 (localStorage)

const FIREBASE = Object.freeze({
  apiKey: "AIzaSyD9E86qHToh_f_fNVAcYQldyjCPpARZB-Q",
  authDomain: "open-cbd39.firebaseapp.com",
  projectId: "open-cbd39",
  storageBucket: "open-cbd39.firebasestorage.app",
  messagingSenderId: "322878081506",
  appId: "1:322878081506:web:40efbcf61190f867b451bb"
});

/* Firestore 문서 경로의 앞부분.
   지금 보안 규칙은 auction/s0916 아래만 로그인 없이 열려 있어서(새 최상위 경로는 403) 그 밑에
   sokttus_rooms 컬렉션을 따로 만들어 둔다. 경매 게임의 문서와는 섞이지 않는다.
   규칙에 /sokttus_rooms 를 열면 아래 한 줄을 ['sokttus_rooms'] 로 바꾸면 끝이다 (README 참고). */
export const BASE = ['auction', 's0916', 'sokttus_rooms'];

export async function firestoreStore() {
  const [{ initializeApp }, fs] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js')
  ]);
  const db = fs.getFirestore(initializeApp(FIREBASE));
  const ref = path => fs.doc(db, ...BASE, ...path);
  return {
    demo: false,
    watch(path, cb, onErr) {
      return fs.onSnapshot(ref(path), s => cb(s.exists() ? s.data() : null), onErr);
    },
    tx(fn) {
      return fs.runTransaction(db, tx => fn({
        get: async p => { const s = await tx.get(ref(p)); return s.exists() ? s.data() : null; },
        set: (p, d) => { tx.set(ref(p), d); },
        del: p => { tx.delete(ref(p)); }
      }));
    }
  };
}

export function localStore(ns = 'sokttus-demo') {
  const key = p => `${ns}:${p.join('/')}`;
  const subs = new Map();
  const read = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
  const emit = k => subs.get(k)?.forEach(cb => cb(read(k)));
  addEventListener('storage', e => { if (e.key && subs.has(e.key)) emit(e.key); });
  return {
    demo: true,
    watch(path, cb) {
      const k = key(path);
      if (!subs.has(k)) subs.set(k, new Set());
      subs.get(k).add(cb);
      setTimeout(() => cb(read(k)));
      return () => subs.get(k).delete(cb);
    },
    async tx(fn) {
      const writes = new Map();
      const out = await fn({
        get: async p => read(key(p)),
        set: (p, d) => { writes.set(key(p), JSON.stringify(d)); },
        del: p => { writes.set(key(p), null); }
      });
      for (const [k, v] of writes) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
      for (const k of writes.keys()) emit(k);
      return out;
    }
  };
}
