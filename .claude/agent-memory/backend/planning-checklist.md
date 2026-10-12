---
name: planning-checklist
description: backend のプランを書く前・書くときに確かめること。既存の受け口と並行チケットの衝突、参照 ADR 節が未マージブランチにだけある、列追加のデプロイ順、Lambda で状態を持つ設計の境界テスト、長い ADR の該当節への索引
metadata:
  type: feedback
  scope: durable
---

## 1. 着手前に、既存の仕込みと並行チケットを確かめる

issue 本文の「◯◯を追加する」をそのまま受け取ると、既にある物を二重に作ったり、並行チケットと衝突したりする。

**Why:**
- **先行タスクが受け口を仕込んでいる**: E2E を止めないために、backend 実装より先に env の受け渡し経路だけを通しておく運用がある。
  例: SS-44 の `MAPS_MODE` は、SS-21 の時点で `compose.yaml` / `.env.example` / `mobile-e2e.yml` に受け口と暫定コメントが先に入っていた。
- **兄弟チケットが同じ土台を作る**: SS-113（地図管理 API）の初版プランは `ObjectStorage.delete_many()`・削除の締め切り設定・
  best-effort 削除の部品・`sanpo_maps/permissions.py` の関数・ADR-009 の決定番号を新設する内容だったが、同じ時期に SS-112 が
  別 worktree で同じものを実装していた。ユーザー判断で SS-113 は SS-112 のマージ後に始め、プランを全面改訂した。

**How to apply:**
- issue 本文が「追加する」と書いていても、対象ファイルを開いて**既に存在しないか必ず確認する**。存在する場合の作業は
  「先行タスクで書かれた TODO / 暫定コメントの解消」になる（陳腐化したコメントの掃除もプランに入れる）。
- ADR の移行事項（BK-n）を実装するプランでは、同じ ADR の他の BK 項目が進行中でないかをユーザーに確認する
  （兄弟 worktree や Plane の状態も手掛かりになる）。
- 重なりそうなら、共通部品は先に入るチケットに寄せ、後のチケットは「流用する」前提で書く。ADR の決定番号はプランで固定しない。
- 兄弟 worktree の `alembic/versions/` と ADR（ルート・`packages/mobile/adr/`）を glob すると、未マージの衝突を見つけられる。
  SS-173 では、SS-171/172 が同じ Alembic head からリビジョンを切っており、ADR-009 決定31 と ADR-M-019 も先に使っていた。
  後からマージする側が `down_revision` と番号を付け替える。
- **指示が参照する ADR の節が worktree に無いことがある**（SS-197: 「ADR-002 SS-195 追補」は未マージの `tri-star/ss-195` にだけあった）。
  worktree の `.git` ファイル → メインの `.git/refs/heads/`・`refs/remotes/origin/` を見れば、どのブランチが main より先かが分かる。
  その ADR を同じチケットで編集する場合は「先行のマージ → rebase → 追補」の順をプランとユーザー確認事項に書く。
- 改訂するときは、既存の private ヘルパーを切り出すより、既存の service が必要な口を直接満たす方が差分が小さく、既存のテストを
  壊しにくいことがある（SS-113 では `PinService` の既存の削除処理を無変更で再利用した）。

## 2. 既存テーブルへの列追加はデプロイ順序を節として書く

既存テーブルにモデルの列を足すと、deploy から手動 migrate までの間、そのテーブルを読む API が `UndefinedColumn` で 500 になる
（マイグレーション Lambda は API と同じ成果物なので先に流せない）。手順と理由の正本は `docs/release-runbook.md` §2
「デプロイとマイグレーションの間に生じる隙間」・§7.4 と ADR-008 決定7 の SS-171 追補。

**How to apply:** 列追加を含むプランでは「デプロイ順序」の節を必ず立て、マイグレーションはモデル変更と別のコミットにしておく
（dev は任意の ref からデプロイできるので、厳密な2段階デプロイも選べる）。並行チケットと Alembic head が衝突していないかも見る（§1）。

## 3. Lambda の実行環境で状態を持つ設計は、ハンドラーを2回以上呼ぶ境界テストを完了条件に入れる

`with TestClient(app)` は lifespan を1回しか回さないので、Mangum の lifespan の扱いの違いを検出できない（SS-183。正本は
ADR-005 SS-183 追補と folder-structure.md の `aws_lambda/asgi_handler.py`）。キャッシュ・レート制限・セッションを実行環境で保持する
設計では、`aws_lambda/tests/test_asgi_handler.py` のような境界テストを完了条件に入れる。クライアント IP を使う機能は、CloudFront 経由の
IP の出所を infra に確認する項目を入れる。

## 4. 長い ADR の中で、計画時に読むべき節（索引）

正本に書いてあるが追補の中に埋もれていて、プランで見落としやすいもの。

- AWS AppConfig のフラグを使う → ADR-008 の SS-98 追補（`enabled: false` の属性は配信されない・空ボディで前回値保持）と
  `integrations/aws/appconfig.py` の docstring（トークン 24h・`BadRequestException` で張り直し）、deployment.md §11 のトラブルシューティング（IAM は `appconfig:`）。
- CloudWatch のダッシュボード・Logs Insights のクエリ → ADR-013 決定2 の SS-179 追補と deployment.md §14（名前空間 `ApplicationSignals`・
  `Operation=<関数名>/FunctionHandler`・`kind='SERVER'` と `LOCAL_ROOT`・`floor` での 4xx/5xx 計数・log ウィジェットのスキャン課金）。
- ログの形式・例外ログ・ログの文脈 → ADR-013 決定3 の SS-180/SS-181 追補（Lambda の LogFormat は Text のまま・同期依存での ContextVar）。
- 認証ヘッダー・Function URL → ADR-005 決定4（OAC が `Authorization` を上書きするので `X-App-Authorization`）。
- Sign in with Apple → ADR-002 の SS-195/197/198 追補（nonce・氏名は初回だけ・code 交換は再試行しない・revoke は冪等）。
- 写真のアップロード枠に値を足す → ADR-009 決定34（attached の枠は写真削除後もアカウント削除まで残る）。
- テスト DB の初期化を変える → ADR-B-001（CI はテスト DB を alembic 後の DB と共有している）。
- 監視・IAM を template.yaml に足す → deployment.md §2・§3 Phase 0・§10、ADR-013 決定2 の SS-179 追補（infra への依頼事項になるもの）。

関連: [[sqlalchemy-and-db]] [[aws-and-external-calls]]
