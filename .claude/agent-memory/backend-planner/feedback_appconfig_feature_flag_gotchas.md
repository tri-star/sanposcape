---
name: feedback_appconfig_feature_flag_gotchas
description: AWS AppConfig のフィーチャーフラグをプランに書くとき必ず設計へ織り込む4つの仕様の罠（無効フラグの属性が配信されない / トークン1回限り24h / 空ボディ / IAM は appconfig 名前空間）
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-09-30
---

**AWS AppConfig（`AWS.AppConfig.FeatureFlags` + `appconfigdata` 直呼び）を含むプランを書くときは、
次の 4 点を必ず設計判断として明示的に扱う。**どれも公式ドキュメントに書かれているが、
素直に実装すると踏む種類のもので、テストでは再現しない（実 API でしか落ちない）。

1. **`enabled: false` のフラグの属性は `GetLatestConfiguration` の応答に含まれない。**
   フラグ以外の値（最低サポートバージョン等）を属性に相乗りさせる設計にすると、
   そのフラグを OFF にした瞬間に値ごと消える。相乗りさせるなら
   「このフラグは常に ON に保つ」ことと、消えたときのフォールバックが安全側かを設計に書く。
2. **`ConfigurationToken` は 1 回きり・有効期限は最大 24 時間。**応答の
   `NextPollConfigurationToken` で必ず置き換える。期限切れトークンで呼ぶと
   `BadRequestException` になる。Lambda のコンテナが 24 時間以上生きるケースがあるため、
   「`BadRequestException` → セッション張り直し」の経路が無いと**ある日突然フラグが更新されなくなる**。
3. **変化が無いときは `Configuration` が空ボディで返る**（`StreamingBody`。`.read()` は 1 回しか効かない）。
   「空 = 設定が無い」と解釈すると、変化なしのたびに既定値へ落ちる。前回値の保持が必須。
   なお**配信済み構成がまだ無いとき**の挙動（空ボディか `ResourceNotFoundException` か）は
   公式に明記が無いので、両方を「未配信 = 既定値」として扱う設計にする。
4. **IAM のアクション名前空間は `appconfig:`**（`appconfig:StartConfigurationSession` /
   `appconfig:GetLatestConfiguration`）。エンドポイントが `appconfigdata` なので
   `appconfigdata:` と書きたくなるが、それでは権限が一致しない。Permission Boundary 側が
   誤った綴りだと**実効権限の上限に阻まれ、アプリ側のポリシーを直しても必ず AccessDenied** になる。
   境界が別リポジトリ（infra）にある構成では、実装着手前に綴りを突き合わせる手順をプランに入れる。

**Why:** SS-98（AppConfig フィーチャーフラグ基盤）の設計時に公式ドキュメントで確認した。
1 と 4 はレビューでも気付きにくく、1 は「フラグを OFF にしたら強制アップデート判定も消えた」、
4 は「dev で一切読めない」という形で後から出る。

**How to apply:** AppConfig を含むバックエンドプランでは、取得層の擬似フローに
「空ボディ」「BadRequestException」「未配信」の 3 分岐を明記し、フェイルセーフの表
（事象 → 返す値 → ログレベル）を必ず作る。ログレベルの設計も込みで書くこと
（**未配信は通常経路なので ERROR にしない**。本物の障害が埋もれる）。

関連: [[feedback_cloudfront_oac_authorization_header]]（同じく「公式ドキュメントに書いてあるが
疎通確認では露見しない」類の罠）
