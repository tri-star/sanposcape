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

## 補足: 包んだ結果（入れ子 `!Sub` + 動的参照）は正しく解決される

上の「OK」の形は、内側の `!Sub` が `{{resolve:ssm:/sanposcape/dev/...}}` という**文字列**を返し、
外側の `!Sub` がそれを ARN の途中に埋め込む。つまり中間状態として
`arn:aws:appconfig:...:application/{{resolve:ssm:...}}/environment/...` という
「文字列の途中に動的参照がある」形ができる。**これが解決されるか**は別途検証が必要な論点だが、
SS-98 で AWS 公式ドキュメントにより裏取り済みなので再調査しないこと。

- `Fn::Sub` の Supported functions に **`Fn::Sub` 自身が含まれる**（変数マップの値として
  ネストしてよい）。CloudFormation は内側から外側へ再帰的に評価し、1 本のフラットな文字列にする。
- 動的参照の解決は、transform と組み込み関数の評価が終わった**後**の独立したステップ。
  公式の "Get values stored in other services using dynamic references" が、transform
  （`AWS::Serverless` を含む）使用時は動的参照をリテラル文字列のまま transform へ渡し、
  チェンジセット実行時に解決すると明記している。**解決対象は関数評価後の最終文字列**なので、
  入れ子経由でもフラットに書いても、最終文字列が同じなら挙動は同じ。
- 1 つの文字列に複数の動的参照を含めてよい。制限は「1 テンプレートあたり最大 60 個」の総数のみ。

検証手順（環境ごとの初回デプロイで 1 回）は
`packages/backend/docs/deployment.md` の §11 に書いた。**失敗モードは安全側**
（無効な ARN → `AccessDeniedException`）で、過剰権限の方向には倒れない。
