---
name: feedback_cloudformation_sub_map_value_gotcha
description: CloudFormation Fn::Sub の変数マップの値に ${...} を書いても再評価されない。値自体を動的にしたい場合はその値をさらに !Sub で包む必要がある
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-09-30
---

**`Fn::Sub`（`!Sub`）の第2引数（変数マップ）に渡す値は、外側の文字列に素の文字列として
そのまま埋め込まれるだけで、値の中に書いた `${...}` は再評価されない。** 値自体を
`${StackParam}` のように動的にしたい場合は、その値をさらに `!Sub`（や `!Ref` / `!GetAtt` 等の
別の intrinsic function）で包む必要がある。

```yaml
# NG: AppId の値の中の ${Env} は解決されず、文字どおり "${Env}" という文字列が残る
Resource: !Sub
  - 'arn:aws:appconfig:...:application/${AppId}/...'
  - AppId: '{{resolve:ssm:/sanposcape/${Env}/platform/appconfig/application_id}}'

# OK: AppId の値自体を !Sub で包み、そのスコープで ${Env} を解決してから外側へ渡す
Resource: !Sub
  - 'arn:aws:appconfig:...:application/${AppId}/...'
  - AppId: !Sub '{{resolve:ssm:/sanposcape/${Env}/platform/appconfig/application_id}}'
```

一方、**`!Sub` の第1引数（外側の文字列）に直接 `${...}` を書く場合や、単一引数形式
（`!Sub '{{resolve:ssm:/path/${Env}/...}}'` のようにマップを使わない形）は問題なく解決される**
（`APP_SECRET_ARN` / `PermissionsBoundary` の既存コードがこの形で、罠を踏んでいない）。
罠が起きるのは「変数マップの**値**の中に `${...}` を書いたとき」に限られる。

**Why:** SS-98（AppConfig の IAM ポリシー ARN 組み立て）で、プランの pseudo-code が
この罠をそのまま含んでいた（変数マップの値に `${Env}` を裸で書いていた）。
`sam validate --lint` は構文チェックのみで、この意味論的なバグを検出できない
（修正前のバージョンでも lint は通っていた）。放置すると IAM ポリシーの `Resource` に
文字どおり `${Env}` が残った ARN が入り、実際のリソースと一致せず必ず `AccessDenied` になる。
AWS 公式ドキュメント（dynamic references）と CloudFormation の一般的な既知パターン
（`!ImportValue: !Sub '${Stack}-Output'` のように、動的にしたい値は intrinsic function で
包む）で裏取り済み。

**How to apply:** `template.yaml`（or 他の CloudFormation/SAM テンプレート）で
`Fn::Sub` の変数マップを使う際、値の中に `${...}` を書きたくなったら、必ずその値全体を
もう一段 `!Sub`（または該当する intrinsic function）で包むこと。`sam validate --lint` が
通ってもこの種のバグは検出されないため、実デプロイ後に CloudWatch Logs で
意図した値が解決されているかを確認する（例: `AccessDeniedException` が出ないこと）。
