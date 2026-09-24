---
name: feedback_cloudformation_fn_sub_nested_variables
description: Fn::Subの変数マップの値に${...}を書いても再評価されない罠。template.yamlのIAM Resource ARN組み立てレビュー時に必ず確認する
metadata:
  type: feedback
  scope: durable
---

`Fn::Sub`（`!Sub`）の第2引数（変数マップ）の値は、外側の文字列テンプレートへ**素の文字列
としてそのまま埋め込まれるだけ**で、その値の中に書いた `${...}` は再評価されない。

**Why:** SS-98（`template.yaml`、AppConfigのIAM Policy Resource ARN組み立て）で、
backend-plannerのプランが次の形を示していた:

```yaml
Resource: !Sub
  - 'arn:aws:appconfig:...:application/${AppId}/environment/${EnvId}/configuration/${ProfileId}'
  - AppId: '{{resolve:ssm:/sanposcape/${Env}/platform/appconfig/application_id}}'
    EnvId: '{{resolve:ssm:/sanposcape/${Env}/platform/appconfig/environment_id}}'
    ProfileId: '{{resolve:ssm:/sanposcape/${Env}/platform/appconfig/configuration_profile_id}}'
```

これは `${Env}` が解決されずリテラル文字列 `${Env}` としてARNに残るバグを含む。
`sam validate --lint` は構文チェックのみでこの意味論的バグを検出できない
（実際、修正前の版でもlintは通っていた）。デプロイすると `AccessDenied` になっていた
はず。実装時にこの罠が見つかり、`AppId`/`EnvId`/`ProfileId`の各マップ値を個別に
`!Sub '{{resolve:ssm:/sanposcape/${Env}/...}}'`で包む（ネストした`!Sub`が自分の
スコープで`${Env}`を解決してから外側の`${AppId}`等へ代入される形）ことで修正された。
現在の `packages/backend/template.yaml` の `Api.Properties.Policies` 内、
`appconfig:StartConfigurationSession`/`appconfig:GetLatestConfiguration`の
`Resource: !Sub` がこの修正後の正しい形の実例。

**How to apply:**
- `template.yaml`のPR差分に `Fn::Sub`（`!Sub`）の**第2引数（マッピング形式）**があり、
  かつそのマップの値の中に `${...}` が含まれている箇所を見つけたら、その値自体が
  ネストした `!Sub` で包まれているか必ず確認する。包まれていなければ、その変数は
  デプロイ時にリテラル文字列のまま残り、実リソースと一致しないARN/文字列になる
  （IAM Policyなら黙って`AccessDenied`、他の用途なら黙って参照エラーになりうる）。
- 単一引数の `!Sub '文字列全体${Var}...'`（`APP_SECRET_ARN`や`PermissionsBoundary`の形）は
  この罠を踏まない。罠が起きるのは**マップ値の中に`${...}`を書いたとき**に限られる。
- `sam validate --lint`はこの種の意味論的バグを検出しないため、テンプレートのレビューは
  lint通過を根拠にしない。可能なら実際にdevへデプロイして値を確認する。

関連: [[project_ss98_feature_flags_architecture]]
