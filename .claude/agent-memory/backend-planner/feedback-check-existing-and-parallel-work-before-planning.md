---
name: feedback-check-existing-and-parallel-work-before-planning
description: プランを書く前に、対象が先行タスクで既に仕込まれていないか・並行中の兄弟チケットが同じ共通部品（ストレージ操作・設定値・権限関数・ADR の決定番号）を作っていないかを確かめる
metadata:
  type: feedback
  scope: durable
---

issue 本文の「◯◯を追加する」をそのまま受け取ると、既にある物を二重に作ったり、並行チケットと衝突したりする。
M5（SS-18〜21）と SS-112 / SS-113 で実際に起きた2つの型をまとめる。

**Why:**
- **先行タスクが受け口を仕込んでいる**: E2E を止めないために、backend 実装より先に env の受け渡し経路だけを通しておく運用が
  ある。例: SS-44 の `MAPS_MODE` は、SS-21 の時点で `compose.yaml` / `.env.example` / `mobile-e2e.yml` に受け口と
  暫定コメントが先に入っていた。
- **兄弟チケットが同じ土台を作る**: SS-113（地図管理 API）の初版プランは `ObjectStorage.delete_many()`・
  `PIN_PHOTO_DELETE_DEADLINE_SECONDS`・best-effort 削除の部品・`sanpo_maps/permissions.py` の関数・ADR-009 の
  決定番号を新設する内容だったが、同じ時期に SS-112（ピン編集・削除）が別 worktree で同じものを実装していた。
  ユーザー判断で SS-113 は SS-112 のマージ後に始め、プランを全面改訂した。同じ ADR の BK 項目を分担する兄弟チケットは
  同じ土台を必要としやすく、両方が新設するとマージ時に重複や番号の衝突が起きる。

**How to apply:**
- issue 本文が「追加する」と書いていても、対象ファイルを開いて**既に存在しないか必ず確認する**。存在する場合の作業は
  「追加」ではなく「先行タスクで書かれた TODO / 暫定コメントの解消」になる（陳腐化したコメントの掃除もプランに入れる）。
- ADR の移行事項（BK-n）を実装するプランでは、同じ ADR の他の BK 項目が進行中でないかをコーディネーター／ユーザーに
  確認する（`../` の兄弟 worktree や Plane の状態も手掛かりになる）。
- 重なりそうなら、共通部品は先に入るチケットに寄せ、後のチケットは「流用する」前提で書く。ADR の決定番号はプランで固定しない。
- 改訂するときは、既存の private ヘルパーを切り出すより、既存の service が port を直接満たす方が差分が小さく、既存のテストを
  壊しにくいことがある（SS-113 では `PinService` が `sanpo_maps` の port を満たし、`_delete_photo_keys_best_effort` を
  無変更で再利用した）。

関連: [[feedback-deadline-must-budget-inflight-call]]
