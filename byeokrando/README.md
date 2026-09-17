# ⚓ 벽란도 무역항

5학년 사회 「고려의 대외 교류」 모둠 무역 게임 · 전자칠판 `board.html` + 모둠 태블릿 `team.html`
주소: https://sikke12632.github.io/5-2gonkeasuup/byeokrando/

## ① Firestore 보안 규칙 (Firebase 콘솔 › Firestore › 규칙 에 전체를 붙여넣고 [게시])

기존 낱말 경매장(`auction`) 블록은 그대로 두고 `trade` 블록만 더했습니다.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 낱말·요리 경매장 (기존 그대로). 경매장도 계속 쓰려면 날짜를 (2026, 11, 1) 로 바꾸세요
    match /auction/s0916/{document=**} {
      allow read, write: if request.time < timestamp.date(2026, 9, 17);
    }
    // 벽란도 무역항
    match /trade/byeokrando/{document=**} {
      allow read, write: if request.time < timestamp.date(2026, 11, 1);
    }
  }
}
```

## ② 수업 당일 조작 순서

1. 칠판에서 `board.html` 열기 → 왼쪽에서 **모둠 수(5~8)** 고르기 → 아이들 태블릿에서 `team.html` 열기 (자리 자동 배정)
2. **[1라운드 시작 ⛵]** → 말로 흥정, 약속되면 태블릿으로 제안·수락 (시간은 −1분/+1분/멈춤)
3. **[아라비아 상선 입항 ⛵]** 두 번 누르기 → 입항 화면 설명 → **[2라운드 시작 🔔]**
4. **[무역 끝 · 정리 📋]** 두 번 누르기 → 「정리 표」로 나라별 교류 정리 → 「순위」
5. 와이파이 장애 시 오른쪽 위 **📜 나라별 품목표**(또는 `board.html?chart=1`)만 띄우고 말로 진행

---
- 점검 모드: 주소 뒤에 `?demo=1` (한 컴퓨터의 여러 탭끼리만 통신). 예) `team.html?demo=1&team=송`
- 품목·주문서·점수는 `board.html` 안 `DATA` 한 곳에서 고칩니다. 수량은 모든 주문서를 채울 수 있게 자동 계산되고, 고친 뒤에는 `node byeokrando/check-balance.mjs` 로 다시 확인할 수 있어요.

밸런스 확인(`check-balance.mjs`, 모둠 수별 무작위 거래 200회 흉내): 5·6·7·8모둠 모두 기본 수량으로 모든 모둠의 주문서가 동시에 완성 가능 (1라운드 주문서·입항 후 주문서 둘 다 200/200).
