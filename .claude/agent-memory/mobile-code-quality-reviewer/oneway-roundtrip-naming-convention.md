---
name: oneway-roundtrip-naming-convention
description: 探索・散歩ルートの値は、候補一覧の近似値（/explore/places、片道×2）と周回の実値（/explore/routes/loop）を型名・関数名で区別している（ADR-M-008 に記載）。この境界を跨ぐ実装をレビューする際の3点チェック
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md
---

決定と理由（SS-33 の rename、候補一覧を近似値のまま据え置いた理由）は
`packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md` の SS-33 追補にある。要点は次のとおり。
- `SpotCandidate.roundTripMinutes`/`roundTripKm`: 候補一覧の近似値（`/explore/places` 由来、片道×2）
- `ActiveWalk.loopMinutes`/`loopKm`: 選択後の周回の実値（`/explore/routes/loop` 由来）
- `src/features/walk/lib/walkRoute.ts` の `toRouteMinutes()`/`toKilometers()`: 周回の値を変換するだけ。
  片道×2 の近似計算はもう無い

**How to apply:** この領域（探索・散歩ルート・周回ルート）のレビューでは、次の3点を横断的にチェックする。
1. 表示文言が「片道」「往復」「周回」「目安」のどれか。
2. その値が近似と実値のどちら由来か。
3. 近似値を独自に2倍・半分にする処理が新設されていないか。

`SpotCard` の「往復の目安」と、`WalkRouteSummary`/`WalkActiveView` の周回表示は出典が異なるため、
数字が少しずれていても即バグとは判断しない。
