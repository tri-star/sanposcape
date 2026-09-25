---
name: feedback-check-sibling-tickets-before-shared-infra
description: 共通部品（ObjectStorage のメソッド・設定値・権限関数・ADR の決定番号）を新設するプランは、並行中の兄弟チケットと重ならないか先に確かめる。後から入った実装に合わせて流用する形へ改訂する
metadata:
  type: feedback
  scope: durable
---

SS-113（地図管理 API）の初版プランは `ObjectStorage.delete_many()`・`PIN_PHOTO_DELETE_DEADLINE_SECONDS`・
best-effort 削除の部品・`sanpo_maps/permissions.py` の関数・ADR-009 の決定番号を新設する内容だった。ところが同じ時期に
SS-112（ピン編集・削除）が別 worktree で同じものを実装しており、ユーザー判断で SS-113 は SS-112 のマージ後に始めることになった。
SS-113 のプランは、マージ後の main に合わせて全面改訂した。

**Why:** 同じ ADR の BK 項目を分担する兄弟チケットは、同じ土台（ストレージ操作・時間予算・権限関数・決定番号）を必要としやすい。
両方が新設すると、マージ時に重複や番号の衝突が起き、プランを書き直すことになる。

**How to apply:**
- ADR の移行事項（BK-n）を実装するプランでは、同じ ADR の他の BK 項目が進行中でないか、コーディネーター／ユーザーに確認する
  （`../` の兄弟 worktree や Plane の状態も手掛かりになる）。
- 重なりそうなら、共通部品は先に入るチケットに寄せ、後のチケットは「流用する」前提で書く。ADR の決定番号はプランで固定しない。
- 改訂するときは、既存の private ヘルパーを切り出すより、既存の service が port を直接満たす方が差分が小さく、既存のテストを
  壊しにくいことがある（SS-113 では `PinService` が `sanpo_maps` の port を満たし、`_delete_photo_keys_best_effort` を無変更で再利用した）。

関連: [[feedback-deadline-must-budget-inflight-call]]
