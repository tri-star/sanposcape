---
name: feedback-template-ssm-resolve-blocks-deploy
description: infra 未 apply の SSM パラメータを template.yaml で {{resolve:ssm:}} すると sam deploy 全体が失敗する。新しい AWS リソース連携はアプリ側を Unconfigured 実装で先行させ、template 変更は infra apply 後の別チケットに切る
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-09-30
---

backend が新しい AWS リソース（S3 バケットなど、infra リポジトリが作るもの）を使うプランでは、
**`template.yaml` への `{{resolve:ssm:...}}` 追加と実行ロールのポリシー追加を、アプリ本体の PR に入れない**。
infra が SSM パラメータを apply する前にデプロイされると `sam deploy` 自体が失敗し、無関係な修正も含めて
backend のデプロイが全部止まる。template は dev/prod 共通なので、main に入った時点で prod の初回デプロイにも前提が乗る。

**Why:** SS-88（ピン写真の S3）の計画時に確認。deployment.md Phase 0 が AppConfig の SSM で同じ構造を記録している。
境界（Permission Boundary、infra 側）が未更新でもポリシー付与自体は通るが、実行時に AccessDenied になる。

**How to apply:**
- アプリ側は `MAPS_MODE` / `FEATURE_FLAG_MODE` と同じ流儀で `XXX_MODE=real|fake` + 「設定が空なら Unconfigured（503 等の安全側）」を実装し、
  ローカル・CI は fake で回す。staging/production は結線前でも起動でき、該当 API だけ 503 になる。
- template.yaml の結線は「infra の dev apply を `aws ssm get-parameter` で確認してからマージ」する別チケットにし、
  prod の infra 順序（account → boundary → リソース）をそのチケットに書く。
- S3 の実行ロール付与は SSM の `bucket_arn` で prefix まで絞る（境界は `sanposcape-<env>-*` と広いため）。
  存在しないキーの HEAD を 404 にしたいなら `s3:ListBucket` も要る（無いと 403）。

関連: [[feedback_appconfig_feature_flag_gotchas]] / [[project-ss88-pin-naming-and-photo-limits]]
