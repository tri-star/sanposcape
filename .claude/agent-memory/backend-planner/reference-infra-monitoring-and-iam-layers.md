---
name: reference-infra-monitoring-and-iam-layers
description: sanposcape-infra 側の監視・通知の置き場（SNS の SSM 契約値、CloudFront のアラーム）と、IAM の 3 系統（sam-deploy / lambda-boundary / app-boundary の残り字数）。監視・新しい AWS リソースを template.yaml に足すプランで、どこに何を依頼するかを決めるときに読む
metadata:
  type: reference
  scope: durable
  verify_by: 2027-04-30
---

sanposcape-infra（ローカルの clone は `/home/tristar/projects/sanposcape-infra`）は、このリポジトリから見えない前提を持っている。2026-10-05（SS-179 のプラン作成時）に読んで確認した。

- **アラートの通知先**: `live/platform/alerting.tf` の SNS `sanposcape-<env>-alerts`（ap-southeast-1）と、同じ名前の us-east-1 版がある。ARN の契約値は SSM の `/sanposcape/<env>/platform/alerting/topic_arn`（us-east-1 版は `.../topic_arn_us_east_1`）。メールの購読は `alert_email_addresses` で設定し、確認リンクを踏むまで届かない（2026-10-05 時点で dev・prod とも確認済み）。トピックポリシーは `cloudwatch.amazonaws.com` の Publish を `aws:SourceAccount` で許可していて CMK 無しなので、同じアカウントのアラームからそのまま通知できる。
- **CloudFront のアラーム**（5xx 率・OriginLatency p90。us-east-1）は、`live/services/backend-api/monitoring.tf`（tf-app）にある。アラーム名は `sanposcape-<env>-backend-api-*`。
- **IAM の 3 系統**
  - sam-deploy: `live/account/sam_deploy.tf`。インラインポリシーで、リソースを名前で絞っている。CloudWatch はダッシュボード・アラームの操作だけを `sanposcape-<env>-backend-*` に絞って持つ（SS-179 の `ManageBackendMonitoring`、sanposcape-infra PR #53。`DescribeAlarms` だけ `Resource: "*"`）。保存済みクエリ（`logs:PutQueryDefinition`）・SLO などは持たない。新しい種類のリソースを足すときは、CFn の `describe-type` の `handlers.permissions` でアクションを過不足なく出してもらう。
  - lambda-boundary: 実行ロールの上限。
  - app-boundary: tf-app / services 層の上限。上限 6,144 字に対して**残り約 290 字**（2026-10 時点）で、ここを消費する案は嫌われる。tf-app はアラームの CRUD（`sanposcape-<env>-*`）を持つが、`PutDashboard` は持たない。
- sam-deploy には `DenyOutsideDeployRegion` があり、us-east-1 には作れない。
- 実データの調査結果（`aws/spans` のフィールド名、dev アカウントの X-Ray / Application Signals の設定）は、infra の Claude が作業メモとして残している。ただし一時ファイルで、消えうる。確定した値は ADR-013 の追補に書いてある。
- dev アカウントの CloudWatch ダッシュボードは他プロジェクトと共有で、無料枠 3 枚のうち 2 枚を使用中（2026-10-05）。

**How to apply:** template.yaml に新しい種類のリソース（ダッシュボード・アラームなど）を足すプランでは、sam-deploy への追加を「infra への依頼事項」として書く。CloudFront 系は infra 所有のままにする。関連: [[feedback-template-ssm-resolve-blocks-deploy]] / [[feedback-cloudwatch-observability-query-gotchas]]
