---
name: infra_tickets_target_repo
description: infraラベルのチケットの作業対象は sanposcape 本体ではなく別リポジトリ sanposcape-infra である
metadata:
  type: project
  scope: durable
---

Plane の Sanposcape プロジェクトには `infra` ラベルのチケットが多数あるが、
**その作業対象は sanposcape 本体リポジトリではなく、別リポジトリ
`tri-star/sanposcape-infra`（ローカル: `/home/ubuntu/projects/sanposcape-infra`）の Terraform 資材である。**

- sanposcape 本体には `.tf` ファイルが **0件**（2026-09-20 確認: `find . -name '*.tf'`）。
- sanposcape-infra の構成: `live/account` / `live/dns` / `live/org` / `live/platform` / `live/services`。
- 責務境界（SAM と Terraform の分担）は docs/adr/ADR-005 / ADR-006 が定めている。
- apply の引き金は `deployments/<env>/platform` へのマージ（sanposcape-infra 側 ADR-0002）。

## チケットごとの作業対象リポジトリ（2026-09-20 時点、フィーチャーフラグ配信基盤チェーン）

| SS# | 内容 | 作業対象 |
| --- | --- | --- |
| SS-94 | AppConfig の器（Application/Environment/Profile/Strategy） | **sanposcape-infra** `live/platform` |
| SS-95 | Lambda 実行ロール境界に AppConfig 読み取りを追加 | **sanposcape-infra** `live/account/lambda_boundary.tf` |
| SS-96 | フラグ切替用 GitHub OIDC ロール | **sanposcape-infra** `live/account/` |
| SS-98 | backend の AppConfig 読み取り + `/app-config` | sanposcape 本体 |
| SS-99 / SS-102 / SS-103 | GitHub Actions ワークフロー | sanposcape 本体 `.github/workflows/` |

**Why:** 2026-09-20 のトリアージで「SS-94 を通すと5件アンブロックされる」と判断して着手を依頼したが、
作業対象リポジトリを sanposcape 本体と暗黙に想定していた。実際には5件のうち2件（SS-95/SS-96）が
別リポジトリでの作業であり、着手担当セッションからの指摘で判明した。

**How to apply:** `infra` ラベルの付いたチケットをトリアージ・着手依頼する際は、
作業対象が sanposcape-infra である前提で進め、着手先セッション/エージェントにもリポジトリを明示すること。
sanposcape 本体だけを grep して「該当コードが無い＝未着手/対象外」と判断しないこと。
関連: [[sanposcape_project]] [[triage_read_tips]]

## SS-95 着手時の注意（2026-09-20、SS-94 担当セッションの調査結果）

- `live/account/lambda_boundary.tf` の Permission Boundary は**許可リスト方式**
  （`WriteOwnLogs` / `ReadOwnSecrets` / `ReadContractParameters` / `UseKmsKeys` / `PublishTraces` のみ）で、
  `appconfig` / `appconfigdata` の権限はどこにも無い。
  **境界は実効権限の上限**なので、SAM が実行ロールにポリシーを付けても境界に無い `appconfigdata:*` は暗黙拒否される。
  **SS-98（backend 実装）だけ先に進めても動かない**ので、SS-95 を先行させること。
- 同ファイルのコメントが「境界の付け替えは prod では SCP に阻まれるため後から広げるのは高くつく」と警告している。
- 足す ARN は `arn:aws:appconfig:*:<account>:application/*` のワイルドカードにする。
  アプリ ID は `live/platform` が採番するため、`live/account` から参照すると層の依存の向きが逆転する（infra 側 ADR-0001 2.6）。
