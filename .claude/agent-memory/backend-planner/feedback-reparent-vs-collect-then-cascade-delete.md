---
name: feedback-reparent-vs-collect-then-cascade-delete
description: 子の親を付け替える変更（ピンの地図移動など）を設計するときは、親の削除が「キー収集→CASCADE→commit→S3 削除」の順で子をロックせずにキーを集めていないか確認する。生き残った子の S3 実体を消す競合になる
metadata:
  type: feedback
  scope: durable
---

SS-175（ピンの地図移動）のプラン作成時に見つけた競合の型。地図削除（`SanpoMapService.delete_map`）は
「地図行 FOR UPDATE → 写真キーを収集（ピン行はロックしない）→ CASCADE → commit → S3 を best-effort 削除」の順で動く。
同じタイミングでピンを別の地図へ移す UPDATE が走ると、キーの収集には移動前のピンが入る。一方 CASCADE はピン行のロックを待った後に
再評価してそのピンを外すので、ピンは移動先で生き残るのに写真の実体だけが S3 から消える（ADR-009 決定4 の不変条件が崩れる）。

**Why:** 親の付け替えという操作が無かったころは、「収集した時点の子 = CASCADE で消える子」が成り立っていた。付け替えを足した途端に、
既存の削除手順の前提が黙って崩れる。TestClient の逐次テストでは見えない。

**How to apply:**
- 親の付け替え（FK の変更）を足すプランでは、旧親・新親それぞれの削除経路を読み、キー収集の前に子の行をロックしているかを確認する。
  対処は「削除側で、収集の前に子を `FOR UPDATE` でロックする」が単純（CASCADE も同じ行をロックするので範囲は増えない）。
- 新しい親は `FOR KEY SHARE` で取ると、削除（FOR UPDATE）とだけ衝突し、削除が先なら待った後に行が消えて 404 にできる（FK 違反の 500 を避けられる）。
- ロックの順序（子の行 → 親の行 か、その逆か）を経路ごとに列挙し、循環しないことをプランに書く。既存の「ピン行 → 地図行（mark_used）」の向きと揃える。
- 副作用: 付け替えを待っていた同じ子への `JOIN ... FOR UPDATE OF 子` は、READ COMMITTED の再評価で JOIN 条件が外れて「見つからない」になる。
  これは既知の限界として ADR に書く。
- 再現テストは `threading` + 別 `Session` の既存手法（`pins/tests/test_service.py` の真の同時再送テスト）で書き、修正前に落ちることを確かめる。

関連: [[feedback-check-existing-and-parallel-work-before-planning]] [[feedback-deadline-must-budget-inflight-call]]

**追記（SS-175 のレビューで見つかった見落とし）:** 「値が同じでも権限判定する」入力（新親 = 今の親）でも新親に `FOR KEY SHARE`
を取ると、「子 FOR UPDATE → 親 KEY SHARE 待ち」と「親 FOR UPDATE → 子 FOR UPDATE 待ち」（削除側）が循環してデッドロックの 500 になる。
新親が今の親と同じときはロックを取らず、手元の role で判定する。デッドロック分析は「実際に付け替える場合」だけでなく
「同じ値を送る no-op」も経路として列挙すること。並行テストの待機は固定 sleep ではなく `pg_stat_activity` の
`wait_event_type='Lock'` をポーリングして、相手が本当に待っていることを確かめてから進める（遅い CI で偽陰性になるため）。
