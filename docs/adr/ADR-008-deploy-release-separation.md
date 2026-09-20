# ADR-008: デプロイとリリースを分離し、公開はフィーチャーフラグとストアの手動リリースで制御する

## 日付

2026-09-20（初版、SS-104）、2026-09-20 追補（SS-98: `/app-config` のレスポンススキーマと
フラグ取得基盤）

## ステータス

採用（SS-104 で決定）。実装は SS-94 / SS-95 / SS-96 / SS-97 / SS-98 / SS-99 / SS-100 / SS-101 /
SS-102 / SS-103 に分かれており、2026-09-20 時点では SS-94（AppConfig の器）・SS-95（境界への
読み取り権限追加）・SS-98（backend の取得基盤と `/app-config`）が完了し、残りは未着手である。
**本 ADR は実装に先行して方針を固定するものであり、「決まっていること」と「各実装チケットが
これから決めること」を節ごとに区別して書いている。**

## コンテキスト

### なぜ今これを決めるのか

[ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md) の SS-72 追補で
backend のデプロイが GitHub Actions から実行できるようになり、production デプロイ成功時に
`backend/vX.Y.Z` タグと GitHub Release が自動生成されるところまで到達した。その追補の末尾は
次の一文で締められている。

> デプロイとリリース（利用者への機能の公開）の分離（AppConfig によるフィーチャーフラグ、
> ストアの手動リリース）は、別途 ADR を起こす予定。

本 ADR がその「別途 ADR」である。ADR-005 は「backend をどう公開するか」に閉じているのに対し、
リリース戦略は backend・mobile・CI/CD をまたぐため、ルートの `docs/adr/` に新規で起こしている。

### 解こうとしている問題

**デプロイ（コードを本番環境に置くこと）とリリース（利用者に機能を見せること）が
現状では不可分である。** そのため次の不都合がある。

1. **機能が完成するまで main へマージできない、あるいはマージした瞬間に公開されてしまう。**
   長寿命のブランチが必要になり、マージ時の衝突とレビュー負荷が増える。
2. **backend と mobile の公開タイミングを揃えられない。** mobile はストア審査を挟むため
   backend より遅れる。backend を先に出すと mobile が追いつくまで未使用の API が公開され、
   mobile を先に出すと存在しない API を叩く。
3. **公開後に問題が見つかったときの引き返し方が「再デプロイ」しかない。**

### 現状のフィーチャーフラグとその限界（AppConfig を入れる直接の動機）

利用者から見える挙動を制御するフラグは `GOOGLE_MAPS_LOOP_ROUTE_ENABLED`
（周回ルートの kill switch、SS-33 / [ADR-007](./ADR-007-loop-route-generation.md)）の 1 つだけで、
`config.py` の `Settings` が読む Lambda 環境変数として実装されている
（`DB_DISABLE_PREPARED_STATEMENTS` も同じ形だが、これはドライバ側の回避策であって
機能のフラグではない）。運用手順は
[packages/backend/docs/deployment.md](../../packages/backend/docs/deployment.md)
「周回ルートの kill switch」にあるが、そこに書かれているとおり次の限界がある。

- 即時に切り替えるには `aws lambda update-function-configuration` で環境変数を
  **丸ごと置換**する必要がある（差分更新ではないため、現在値を控えてから渡す）
- その変更は **次の `sam deploy` で `template.yaml` の内容に巻き戻る**
- 恒久化するには `template.yaml` を編集して redeploy する ―― つまり
  **フラグを切り替えるのに再デプロイが要る**

最後の点が本質的な問題である。フラグの目的は「デプロイなしで公開状態を変えられること」なのに、
現行方式ではそれが成立していない。

### 既に「配布済みビルドとの互換」を守っている実例がある

`/explore/routes/walking` は `deprecated=True` のまま残されており、router の docstring に
「SS-33: `/explore/routes/loop` に置き換え。**配布済みビルドの互換のため維持する**
（意味・スキーマは変えない）」と書かれている。これは本 ADR の決定7（expand / contract）を
既に実践している例であり、本 ADR はこれを暗黙の慣行から明文化された規則に格上げする。

### 前提となる制約

- **mobile はユーザーの端末に残り続ける。** `runtimeVersion.policy: "appVersion"`
  （[ADR-006](./ADR-006-mobile-app-delivery-eas-hosted.md) の SS-89 追補）のため、
  OTA（EAS Update）で直せるのは同一 `expo.version` の端末だけで、古い version のバイナリは
  更新されないまま backend を叩き続ける。
- **本リポジトリは public である。** AWS のアカウント ID・リソース ID をリポジトリに書けない。
- **AppConfig の器は別リポジトリ（`sanposcape-infra` の Terraform）が作る。**
  SAM と Terraform の責務境界は ADR-005 / ADR-006 で既に確定しており、本 ADR はそこに例外を作らない。
- **prod はまだ存在しない。** `sanposcape-backend-prod` スタックは未デプロイ、
  `app-api.sanposcape.com` は名前解決せず、ストアへの公開も未実施である。
  したがって本 ADR の手順は**実運用による検証を経ていない**。

## 決定

### 1. デプロイとリリースを分離する

**デプロイ**（コードを本番環境に置くこと）と**リリース**（利用者に機能を見せること）を
別の操作として扱い、別の承認経路に載せる。

- 未完成・未公開の機能も、**フラグ OFF の状態で main にマージし、本番にデプロイしてよい。**
- 「本番に出ている」ことと「利用者に見えている」ことを別々に管理する。

軸を整理すると次の 3 つになる。以降の決定はこの表の行に対応する。

| 軸 | 手段 | 何を制御するか |
|---|---|---|
| **配信（ネイティブ）** | ストアの手動リリース / 段階的公開 | 誰の端末に新しいバイナリが載るか |
| **配信（JS）** | EAS Update（OTA） | 同一 `runtimeVersion` 内で誰に新しい JS が載るか |
| **公開** | AppConfig のフィーチャーフラグ | 誰に機能が見えるか |

### 2. 未公開機能はフィーチャーフラグ（AWS AppConfig）で OFF のまま本番デプロイし、フラグ ON をリリースとする

フラグの基盤には **AWS AppConfig** を使う。器（Application / Environment /
Configuration Profile / Deployment Strategy）は Terraform（`sanposcape-infra` の `live/platform`）が
所有し、**フラグの値は本リポジトリが所有する**（Secrets Manager と同じ「器は infra、中身はアプリ」の分担）。

実装上の合意事項（SS-94 / SS-95 / SS-96 / SS-98 / SS-99 で infra 側と合意済み）:

- **backend は boto3 の `appconfigdata` を直接呼ぶ。Lambda Extension は使わない。**
  デプロイロールの変更が不要でテストも容易なため（infra 推奨）。
- 実行環境ごとにセッションを 1 回開き、次回トークンと `NextPollIntervalInSeconds` を保持して
  間隔内はキャッシュを返す。`GetLatestConfiguration` は変化が無いと空ボディを返すため、
  前回値を保持する。
- Configuration Profile は `feature-flags`、type は `AWS.AppConfig.FeatureFlags`、
  `location_uri` は `hosted`。
- **Deployment Strategy は独自に作る。** 組み込みの `AppConfig.AllAtOnce` はベイク時間が 10 分あり、
  その間は次のデプロイを開始できないため。dev はベイク 0 分、prod は `StopDeployment` で
  引き返せる時間を残すため数分を置く。
- ID は SSM 経由で受け渡す（public リポジトリに ID を置かないため。
  ADR-005 決定5 の `APP_SECRET_ARN` や SS-72 追補の `lambda_boundary_arn` と同じ理由）。
  契約は `/sanposcape/<env>/platform/appconfig/{application_id,environment_id,configuration_profile_id,deployment_strategy_id}`。
- Lambda 実行ロールの Permission Boundary（SS-95）は `appconfig:StartConfigurationSession` /
  `GetLatestConfiguration` をワイルドカード ARN で許可する。**境界では ID まで絞れない**
  （AppConfig の ID は `live/platform` で採番され、より先に apply される `live/account` からは
  参照できない）ため、**完全 ARN への絞り込みは SAM テンプレート側の実行ロールポリシーで行う。**
- ローカル / テスト環境ではスタブを用意する（既存の `AUTH_MODE` / `MAPS_MODE` と同じモード切替の流儀）。

### 3. mobile はストアの手動リリースと段階的公開で公開時期を制御する

- **App Store**: 「App Review 承認後に手動でリリース」を選び、承認と公開を切り離す。
- **Google Play**: 「公開の管理（Managed publishing）」を有効にし、段階的公開（staged rollout）で
  配信先の割合を制御する。

これは**バイナリの配信**の制御であり、決定2 の**機能の公開**の制御とは別軸である
（決定1 の表を参照）。両方を使うことで「新しいバイナリは一部の利用者にだけ配り、
機能自体はフラグで全員に対して OFF」といった状態を作れる。

なお mobile の機能も `/app-config`（決定2）越しのフラグでガードできる（SS-100）ため、
**「コードは配布済み・フラグ OFF」は mobile でも成立する。**

### 4. バージョンはアプリ別に採番し、タグは `<app>/vX.Y.Z` に統一する

モノレポだがアプリごとに独立したバージョンとリリースノートを持つ。
タグの接頭辞でアプリを区別する（`backend/v0.1.0`、`mobile/v0.1.0`、将来の LP も同じ形）。

- 採番とリリースノートは **git-cliff**（リポジトリ直下の `cliff.toml`）で生成する。
  設定はアプリに依存させず、アプリ別の差分は CLI 引数で渡す
  （`--include-path 'packages/<app>/**'` と `--tag-pattern '^<app>/v[0-9]+\.[0-9]+\.[0-9]+$'`）。
- バージョン規則・スキップ条件は ADR-005 の SS-72 追補および
  [deployment.md](../../packages/backend/docs/deployment.md) §4.1 に記載したものを
  そのまま他アプリへ適用する。
- **`CHANGELOG.md` はリポジトリにコミットせず、GitHub Release の本文だけにする。**
- mobile では、生成した CHANGELOG を**ストアの「新機能」欄の下書きとしても使う**（SS-102）。
- mobile でタグ・CHANGELOG のキーにするのは **`app.json` の表示用 `version` のみ**である。
  ビルド番号（iOS の `buildNumber` / Android の `versionCode`）は EAS サーバーが採番するため
  （ADR-006 の SS-89 追補）、キーにしない。

### 5. dev（development）へのデプロイではバージョンを振らない

タグと GitHub Release を作るのは production へのデプロイが成功したときだけとする
（ADR-005 の SS-72 追補で確定済み）。バージョンは「本番に出ているもの」を指す番号であり、
検証環境に出たものに番号を与えると、番号が何を指すのかが曖昧になるため。

dev に何が出ているかは GitHub Actions の実行履歴で確認する。

### 6. フラグのライフサイクルは「追加 → ON → 削除」の 3 段階とし、削除まで終えて初めて完了とする

| 段階 | 操作 | 完了の目安 |
|---|---|---|
| 追加 | フラグ定義を本リポジトリに追加し、既定値 OFF で本番へデプロイする | 本番にコードが載り、利用者には見えていない |
| ON | フラグ切り替えワークフローで ON にする（prod は承認あり） | **これがリリース** |
| 削除 | フラグの分岐とフラグ定義を消す PR を出す | フラグが 1 つ減っている |

- **削除まで含めて 1 つの機能追加とみなす。** 削除しないフラグが積み上がると、
  分岐の組み合わせが増えてコードが読めなくなり、テストで担保すべき状態数も増える。
- フラグの定義（名前・説明・既定値）は**本リポジトリ内のファイルで管理する**。
  ワークフローがその値から hosted configuration version を作成して `StartDeployment` する（SS-99）。
  Terraform は hosted configuration version を作らない（SS-94）。
- **フラグの切り替えは GitHub Actions の `workflow_dispatch` からのみ行い、
  AWS コンソールから直接操作しない。** Actions の実行履歴を
  「いつ・誰が・何をリリースしたか」の記録にするため（SS-99）。
- 切り替え用の認証には **sam-deploy とは別の OIDC ロール** `sanposcape-<env>-feature-flags`（SS-96）を使う。
  フラグの切り替えに CloudFormation や IAM の権限は不要であり、`iam:CreateRole` を持つ
  sam-deploy ロールの使用場面を最小に保つため。

### 7. API の変更は expand → contract の 2 段階で行う

**配布済みの mobile ビルドは更新されないまま backend を叩き続ける。**
したがって backend の API 変更は、常に「古いクライアントが動いたまま新しいクライアントも動く」
中間状態を経由させる。

| 段階 | やること |
|---|---|
| **expand** | 新しいフィールド / エンドポイントを**追加**する。古いものは残したまま、意味も変えない。新規フィールドは任意（optional）にする |
| （移行） | 新しいクライアントを配布し、古いクライアントが十分に減るのを待つ |
| **contract** | 古いフィールド / エンドポイントを削除する |

- 既存エンドポイントを置き換える場合は、まず FastAPI の `deprecated=True` を付けて残す
  （`/explore/routes/walking` が実例）。**意味とスキーマは変えない。**
  「残っているが挙動が変わっている」が最も危険な状態である。
- **contract に進んでよいかの判断材料は「最低サポートバージョン」とする。**
  `/app-config` が返す最低サポートバージョン（SS-98）を下回るアプリには
  アップデートを促す（SS-101）。そのバージョン以上のクライアントだけが残ったと言える状態になって
  初めて、古いフィールド / エンドポイントを削除する。
- DB スキーマの変更にも同じ原則を適用する。ADR-005 決定9 によりマイグレーションは手動であり、
  デプロイ完了からマイグレーション実行までの間は**新しいコードが古いスキーマで動く**。
  expand（列の追加・NULL 許容）と contract（列の削除・NOT NULL 化）を別のデプロイに分ける。

### 8. OTA（EAS Update）は「配信」の手段であって「リリース」の手段ではない

OTA で届ける利用者向けの変更は、次のいずれかに限る。

1. **既に公開済みの機能に対する不具合修正**
2. **フラグ OFF の状態で入る新機能**（ダークローンチ。公開は決定2 のフラグ ON で行う）

理由:

- `runtimeVersion.policy: "appVersion"` のため、OTA が届く範囲は**同一 `expo.version` の端末のみ**。
  `version` を上げた瞬間、既存端末はその後の新 version 向け `eas update` を受け取らなくなる
  （ADR-006 の SS-89 追補）。
- OTA は**ストア審査を経ず即時に全対象端末へ届く**ため、それ単体では段階的公開の制御が効かない。
  SS-103 が OTA 配信ワークフローに `workflow_dispatch` + production Environment の承認を
  課しているのも同じ理由である。

運用上の帰結:

- **channel の付け替えでリリースを制御しない。** channel は `eas.json` の既存の割り当て
  （`production` プロファイル → `production` channel）をそのまま使う。公開の制御はフラグで行う。
- **`version` を上げる PR と配布ビルドはセットで計画する。** `version` を上げると、その version の
  ネイティブバイナリを配布するまで OTA の配信先が存在しなくなる
  （[build-profiles.md](../../packages/mobile/docs/build-profiles.md)
  「表示用バージョン `version` の運用ルール」）。
- ネイティブモジュールや config plugin の変更を伴う場合は、`version` を上げて互換境界を切る。

### 9. フラグの取得に失敗した場合は全フラグ OFF で動く（フェイルセーフ）

**一度も値を取得できていない**とき（未配信＝そのプロファイルにまだ構成が配信されていない、
初回取得の失敗、取得した内容が JSON として壊れている）は、**既定値＝全フラグ OFF** で
動作する（SS-94 の申し送り、SS-98）。

「フラグが読めない」ときに未公開の機能が露出するより、公開済みの機能が見えなくなるほうが
損害が小さいという判断による。AppConfig の最初のデプロイ前はそもそも配信済みの構成が存在しないため、
この既定値が無いと backend が起動できない。

#### 9-1. 一度取得できた値（known-good）は、その後の取得失敗では捨てない（2026-09-21 追記, SS-98 / PR #88）

当初この決定は「未配信・取得失敗・空の応答のいずれの場合も全フラグ OFF」と書いていたが、
性質の異なる 3 つの事象を一括りにしていたため、実装（SS-98）との食い違いを生んだ。
次のように切り分ける。

| 事象 | 挙動 |
| --- | --- |
| 一度も取得できていない（未配信 / 初回失敗 / パース失敗） | **全フラグ OFF**（`config_source: "default"`） |
| 空の応答（`GetLatestConfiguration` の「変化なし」） | **直前に取得した値を維持** |
| 取得失敗（known-good を持っている状態での失敗） | **known-good を維持**し、バックオフ後に再取得 |

理由は 3 つある。

1. **空の応答は正常系であって失敗ではない。** `GetLatestConfiguration` は構成に変化が無いとき
   空ボディを返す仕様で、これを「全 OFF」に倒すとポーリングのたびに全フラグが消えて復活する
   壊れた挙動になる。当初の文面の「空の応答」は「未配信」を指す意図だったと読むべきで、
   記述が不正確だった。
2. **known-good を保持しても、この決定が守ろうとしているリスクは発生しない。** 守りたいのは
   「未公開の機能が露出する」ことだが、known-good 上で OFF のフラグは保持されても OFF のままで、
   保持によって OFF が ON に変わる経路は存在しない。露出リスクが実在するのは known-good が
   無い場合だけで、そこは上表のとおり全 OFF に倒している。
3. **逆に全 OFF へ倒すと実害がある。** AppConfig の一時的なスロットリングやネットワーク断で、
   **公開済み**の機能がバックオフ間隔のあいだ消える。(2) よりこちらに倒す利得が無い。

なお「ON にした機能を OFF に戻して緊急停止する」用途はこの決定の射程外である。決定8 および
追補 D8 のとおり、公開済み機能の緊急停止（安全側が ON）はフィーチャーフラグではなく
環境変数が担うため、「AppConfig が読めずに stale な ON を掴み続ける」ことは緊急停止の
妨げにならない。

## 検討した選択肢

### 選択肢1: AWS AppConfig ← 採用

- **概要**: AWS マネージドのフィーチャーフラグ基盤。器は Terraform、値はアプリ側リポジトリ。
- **メリット**:
  - 既に AWS 上にインフラがあり、OIDC・SSM 契約・Permission Boundary という
    既存の仕組み（ADR-004 / ADR-005）にそのまま載る。新しいアカウントも新しい秘密情報も増えない。
  - **再デプロイなしで値を切り替えられる**（現行の環境変数方式の最大の欠点が解消する）。
  - Deployment Strategy にベイク時間があり、`StopDeployment` で引き返せる。
  - 固定費が MVP のコスト感に収まる。
- **デメリット**:
  - AWS 固有であり、backend 以外（mobile / LP）は `/app-config` 越しにしか読めない。
  - 実装が増える（セッション管理・キャッシュ・フェイルセーフ・スタブ）。
  - 組み込みの Deployment Strategy が使えず、自作が必要（ベイク 10 分の制約）。

### 選択肢2: Lambda 環境変数を使い続ける（現状維持）

- **概要**: `config.py` の `Settings` に `*_ENABLED` を生やし、`template.yaml` で値を与える。
- **メリット**: 追加実装がゼロ。既に 1 つ（`GOOGLE_MAPS_LOOP_ROUTE_ENABLED`）動いている。
- **デメリット**:
  - **切り替えに再デプロイが要る**（または手動更新が次の `sam deploy` で巻き戻る）。
    デプロイとリリースの分離という目的そのものを達成できない。
  - 切り替えの履歴が残らない。
  - mobile / LP から読む経路が無い。

### 選択肢3: 外部 SaaS（LaunchDarkly など）

- **概要**: フィーチャーフラグ専業の SaaS を使う。
- **メリット**: UI・ターゲティング・監査ログが最初から揃っている。ダークローンチの表現力が高い。
- **デメリット**:
  - MVP 段階で月額の固定費が乗る。
  - 管理するアカウントと秘密情報が 1 つ増える（ADR-004 の「秘密の保管先は消費者で決める」方針に
    新しい経路を足すことになる）。
  - 現時点で必要なのは ON/OFF だけで、ターゲティングの表現力に対価を払う理由が無い。

### 選択肢4: DB のテーブルでフラグを持つ

- **概要**: PostgreSQL にフラグ用テーブルを作り、backend が読む。
- **メリット**: 追加のマネージドサービスが不要。値の変更が即時。
- **デメリット**:
  - **フラグの読み取りが DB の可用性に依存する。** DB 障害時に「フラグが読めないので全 OFF」に
    落ちると、障害の影響範囲が不必要に広がる。
  - Lambda ごとにキャッシュが分かれる問題（ADR-005 決定8 と同じ構図）が再演する。
  - 値の変更経路が「本番 DB への書き込み」になり、承認と履歴を残す仕組みを自前で作る必要がある。
  - mobile / LP から読むには結局 `/app-config` のようなエンドポイントが要る。

## 決定理由

**選択肢2（現状維持）を外した理由が、この ADR の出発点そのものである。**
「フラグを切り替えるのに再デプロイが要る」状態では、デプロイとリリースを分離できない。
`GOOGLE_MAPS_LOOP_ROUTE_ENABLED` の運用手順が
「即時に変えられるが次の `sam deploy` で巻き戻る / 恒久化するには redeploy」という
二者択一になっていることが、その証拠として既にドキュメントに残っている。

**選択肢1 を採ったのは、増える管理対象が最も少ないため。** AppConfig は
既存の OIDC・SSM 契約・Permission Boundary の枠組みにそのまま載り、
新しいアカウント・新しい秘密情報・新しい請求先が増えない。選択肢3 はこの 3 つが全て増える。

**選択肢4 を外した決め手は可用性の結合である。** フラグは「何かが壊れたときに機能を止める」
用途を含む（`GOOGLE_MAPS_LOOP_ROUTE_ENABLED` がまさにそれ）。その読み取り先を
アプリ本体と同じ DB に置くと、最も必要な場面で使えない可能性がある。

**決定8（OTA の位置づけ）は本 ADR で新たに導出したものである。** SS-72 の検討事項には
OTA の扱いが明示されていなかったが、SS-103 が本課題と `relates to` で紐付き、本文に
「`runtimeVersion`(policy: appVersion) と channel の運用を ADR-006 の未完了事項に沿って整理する」
とあるため、ここで決めるべき事項と判断した。「OTA は不具合修正のみ」とより狭く縛る案も
検討したが、SS-100 により mobile の機能もフラグでガードできる以上、ダークローンチを禁じる理由が無く、
決定1 と整合しないため採らなかった。

## 影響

### ポジティブな影響

- **未完成の機能を main にマージできる。** 長寿命ブランチとマージ時の衝突が減る。
- **backend と mobile の公開タイミングを揃えられる。** 両方を配布済みにしたうえで、
  フラグ ON という 1 つの操作で同時に公開できる。ストア審査の所要時間がリリース計画から外れる。
- **引き返す手段がデプロイ以外に増える。** 問題が起きたらフラグ OFF で戻せる
  （`StopDeployment` によるデプロイ自体の停止も含む）。
- **リリースの履歴が GitHub Actions に残る。** 「いつ何が公開されたか」を後から追える。
- 現行の `GOOGLE_MAPS_LOOP_ROUTE_ENABLED` も、この基盤へ移せば
  「巻き戻る一時変更か、再デプロイを伴う恒久変更か」の二者択一から解放される。

### ネガティブな影響・トレードオフ

- **コードにフラグの分岐が増える。** 決定6 の削除段階を実行しないと、分岐の組み合わせが
  増え続けてコードが読めなくなる。「削除まで含めて 1 つの機能追加」という規律に依存している。
- **テストすべき状態が増える。** フラグ ON / OFF の両方で壊れないことを担保する必要がある。
- **リリースの操作が 1 つ増える。** 「デプロイしたら公開」より手数が多い。
  小さな修正では割に合わない場合があり、すべての変更をフラグで包む必要はない
  （どの変更をフラグで包むかの線引きは運用手順側に置く）。
- **AppConfig の取得失敗が新しい失敗経路になる。** 決定9 のフェイルセーフで
  「全 OFF」に倒すが、これは「公開済みの機能が突然見えなくなる」ことを意味する。
- **フラグの数が増えるほど、AppConfig のデプロイのベイク時間が運用の律速になる。**
  同一 Environment では前のデプロイのベイク中に次を開始できない（SS-94）。
- **expand → contract は 2 回のデプロイを要する。** API の変更が常に 2 段階になり、
  古いフィールドを消すまでの間はスキーマに冗長さが残る。
- **本 ADR の手順は未検証である。** prod はまだ存在せず、ストアへの公開も未実施のため、
  ストア側の設定手順は公式ドキュメントに基づく記述に留まる。

### 移行・対応が必要な事項

- [x] SS-94: `live/platform` に AppConfig の器を作り、SSM に 4 つの ID を入れる（`sanposcape-infra` 側。**完了**）
- [x] SS-95: Lambda 実行ロールの境界に `appconfig:StartConfigurationSession` / `GetLatestConfiguration` を追加する（**完了**）
- [ ] SS-96: フラグ切り替え用の OIDC ロール `sanposcape-<env>-feature-flags` を作る
- [ ] SS-97: prod の `live/account` を apply し、`production` Environment に `AWS_SAM_DEPLOY_ROLE_ARN` を設定する
- [x] SS-98: backend に AppConfig 読み取り基盤と `/app-config` エンドポイントを追加する（**完了**）。
      **（SS-98 追補）** レスポンススキーマ・ダークローンチの要否・
      `GOOGLE_MAPS_LOOP_ROUTE_ENABLED` の移行要否は下記「SS-98 追補」で決定した。
- [ ] SS-99: フラグ切り替えワークフローを追加する
      （**フラグ定義ファイルのフォーマットと置き場所は SS-99 で決める。本 ADR では決めていない**。
      AppConfig に置く JSON の形自体は「SS-98 追補」§D7 で確定済みで、SS-99 はそこに書き込む
      ワークフローを作る）
- [ ] SS-100: mobile が `/app-config` のフラグで機能表示をガードする
- [ ] SS-101: 最低サポートバージョンを下回るアプリにアップデートを促す（決定7 の contract の前提）
- [ ] SS-102: mobile の `mobile/vX.Y.Z` タグ・Release・CHANGELOG を自動生成する
- [ ] SS-103: OTA の本番配信ワークフローを追加し、`EXPO_TOKEN` を Environment Secret へ移す
- [x] `GOOGLE_MAPS_LOOP_ROUTE_ENABLED` を AppConfig のフラグへ移行するかを判断する。
      **（SS-98 追補）環境変数のまま残すと結論した。** 理由は下記「SS-98 追補」§D8 を参照
- [ ] ストア側の設定（App Store の手動リリース / Google Play の公開の管理）を実際に行い、
      [release-runbook.md](../release-runbook.md) の未検証の記述を実測で確定させる
- [ ] 各実装チケットの完了時に、確定した構成を本 ADR へ追補する

## 追補: `/app-config` のレスポンススキーマとフラグ取得基盤（2026-09-20, SS-98）

決定2 が backend 側に投げていた「レスポンススキーマとダークローンチの要否は SS-98 で決める」
（コメント1 参照）への回答。実装は `packages/backend/src/sanposcape/app_config/`
（HTTP エンドポイント）、`core/feature_flags.py`（評価層）、
`integrations/aws/appconfig.py`（boto3 `appconfigdata` の取得層）に分かれている。

節番号は D1, D2, D3, D5, D7, D8, D9, D10 の順。**D4 と D6 は欠番**（この2つの番号に対応する
決定が本追補には無く、意図的に使用していない。今後この2つの番号を新設する決定が生じた場合は、
この欠番を埋める形で追補すること。既存の節番号は他の節・本リポジトリのコード（後述）から
参照されているため、詰めて振り直さない）。

### D1: `/app-config` のレスポンススキーマ

```http
GET /app-config            認証不要（/health と同じ扱い）。Cache-Control: no-store
```

```json
{
  "flags": {
    "app_config_probe": false
  },
  "minimum_supported_versions": {
    "ios": "0.1.0",
    "android": "0.1.0"
  },
  "config_source": "appconfig"
}
```

| フィールド | 型 | 意味 |
|---|---|---|
| `flags` | `dict[str, bool]` | **クライアント公開可**と登録簿（`core/feature_flags.py` の `FEATURE_FLAGS`）でマークされたフラグのみ。登録済みキーは AppConfig 側に値が無くても必ず `false` で出る（キー集合は backend のバージョンで決まる） |
| `minimum_supported_versions.ios` / `.android` | `string \| null` | `X.Y.Z` 形式。`null` は「**最低バージョンの指定なし = 強制アップデートしない**」（AppConfig を読めない場合も `null` になる。決定9 と同じ向きの fail-safe） |
| `config_source` | `"appconfig" \| "default" \| "stub"` | 診断用。値の出どころ。**クライアントはこの値で分岐してはいけない**（秘密情報は含まない） |

決定の要点:

- **`flags` は固定キーのオブジェクトではなく map にする。** フラグのライフサイクルは
  「追加 → ON → **削除**」（決定6）であり、フラグの増減が毎回 OpenAPI スキーマの
  破壊的変更になるのは expand → contract（決定7）と噛み合わない。map ならフラグを
  削除しても API スキーマは不変で、古いビルドは未知キーを読めなくなるだけで壊れない。
  代償として mobile 側は型安全を失う（SS-100 でキー定数を自前定義する）。
- **値は `bool` 単体**（`{"enabled": true}` のようにネストしない）。クライアントに属性を
  配る要件が現時点で無く、必要になれば別フィールド（例 `flag_attributes`）を追加する
  expand で足せる。
- **最低サポートバージョンはプラットフォーム別。** iOS / Android は審査とストアの段階的公開で
  普及速度が異なり、片方だけ古いビルドを切りたい場面が現実に起きる。`expo.version`
  （`app.json`）は共通の1つの値だが、キーは分けておく（後から `string` → `{ios, android}`
  に変えるのは破壊的変更になるため）。
- **`/app-config` は DB を触らない。** 認証も DB も要らない軽量経路にしておくと、
  DB 障害時にもフラグを配れる（選択肢4 を却下した理由と同じ発想）。

### D2: ダークローンチ（ユーザー条件付きフラグ）は不採用

**結論: 採用しない。**

1. **`/app-config` は未認証で叩ける必要がある。** mobile はサインイン前にフラグを読む
   （起動時ガード・強制アップデート判定）。ユーザー条件付きにすると「未認証時の値」と
   「認証後の値」が食い違い、mobile はサインインの前後で2回取得して差し替える実装になる。
   最初に入れる基盤の複雑さとして割に合わない。
2. **AppConfig にターゲティングの仕組みが無い。** `AWS.AppConfig.FeatureFlags` が配るのは
   キー → `enabled` + 属性だけで、ルール評価は自前実装になる。選択肢3（LaunchDarkly）を
   外した理由「現時点で必要なのは ON/OFF だけ」がそのまま当てはまる。
3. **検証の代替手段が既にある。** 「自分だけで試す」は dev 環境（`ENV=staging`）でフラグを
   ON にすれば足りる。
4. キャッシュが壊れる。ユーザー単位評価にすると `/app-config` はユーザーごとに違う応答に
   なり、D10 のキャッシュ方針が作り直しになる。

将来入れるときに変えるもの（今のうちに用意しておいた拡張点）:

| 変更対象 | 具体的な変更 |
|---|---|
| 評価 API | `FeatureFlags.is_enabled(key)` に**キーワード引数**で `context=...` を足す。既存呼び出しは無変更で済む（現状のシグネチャは `def is_enabled(self, key: str) -> bool` で、`*, context=...` を後から追加できる形にしてある） |
| フラグ JSON | `flags.<key>.attributes` に `allowed_user_keys` 等を定義し、`values.<key>` に値を入れる。**属性は `enabled: true` のときしか配信されない**ため「OFF だが特定ユーザーだけ ON」は表現できない（フラグの意味論が変わるため ADR 追補が別途必要） |
| `/app-config` | 任意認証（既存の `get_current_user_optional` を使う）にする。`Cache-Control` は `no-store` のまま |
| mobile | サインイン完了後に `/app-config` を再取得する（SS-100 に申し送り済み） |

### D3: 層の分離と初期化タイミング

**層の分離**: 「AppConfig からどう取るか」（`integrations/aws/appconfig.py`、取得層/transport）と
「どのキーが存在し、どれをクライアントに見せるか」（`core/feature_flags.py`、評価層）を分ける。
両者は変更理由が異なる（前者は AWS API の都合、後者はフラグの登録簿・公開ポリシーの都合）ため、
1つのモジュールにまとめると変更のたびに無関係な差分が混ざる。

**`FlagDocument` / `FlagDocumentSource`（Protocol）を `core` 側ではなく
`integrations/aws/appconfig.py` 側に置いた理由**: 実装時の設計判断では「core 側に置くと
循環 import になるため」としていたが、これは**技術的に不正確**だった。`FlagDocumentSource` は
`Protocol` であり構造的部分型が効くため、`AppConfigFlagSource` 等の実装クラスは明示的に
import/継承しなくても適合する。つまり型定義を `core/feature_flags.py` に移しても、依存の向きが
`integrations → core` に反転するだけで**循環にはならない**。

実際にこの配置を採った理由は、既存の前例（`core/runtime_config.py` が
`integrations/aws/secrets.py` の型を使う、という `core → integrations` の依存の向き）との
**一貫性を優先した**ためである。古典的なポート＆アダプタでは「ポート(Protocol)と DTO は
評価ロジックを持つ側（`core`）が所有し、アダプタ（具象実装）がそれに依存する」向き
（`integrations → core`）がより教科書的だが、本リポジトリでは逆方向（`core → integrations`）の
前例が既にあり、この1箇所だけ向きを変えると一貫性が崩れる。動くものを実装終盤に配置し直す
利得より、リポジトリ内で依存の向きを揃えておく利得を優先した。技術的な制約ではなく
一貫性のためのトレードオフである、という点を後続の設計判断のために明記しておく。

**初期化タイミング**: `main.py` の `_lifespan`（コールドスタート時に1回実行される）は
`FlagDocumentSource` / `FeatureFlags` の**インスタンスを作るだけ**で、AppConfig への実際の
取得（`get_document()` の呼び出し）は行わない。最初にフラグを参照したリクエスト（通常は
`/app-config`）が初めて取得する。これにより、`/app-config` 以外のエンドポイントの
コールドスタートに AppConfig 取得のレイテンシ（`APPCONFIG_CONNECT_TIMEOUT_SECONDS` +
`APPCONFIG_READ_TIMEOUT_SECONDS` が最悪ケース）を乗せずに済む。同じ形は
`google_maps_provider`（`HttpGoogleMapsProvider` も `_lifespan` でインスタンス化されるだけで、
実際の Places/Routes 呼び出しはリクエスト時）にも使われている既存パターンである。

### D5: モード切替（`FEATURE_FLAG_MODE`）

`AUTH_MODE` / `MAPS_MODE` と同じ型（決定2 が予告していたとおり）。

```python
feature_flag_mode: Literal["real", "stub"] = "real"       # コード既定は fail-safe な real
feature_flag_stub_document: str = ""                       # stub 用の簡略 JSON 文字列
appconfig_application_id: str = ""
appconfig_environment_id: str = ""
appconfig_configuration_profile_id: str = ""
appconfig_poll_interval_seconds: int = 60
appconfig_error_backoff_seconds: int = 30
appconfig_connect_timeout_seconds: float = 1.0
appconfig_read_timeout_seconds: float = 2.0
```

- `ENV` が `local` / `test` 以外で `feature_flag_mode != "real"` だと起動失敗する
  （許可リスト方式。ADR-002 決定4 と同じ fail-safe 方針）。
- **`APPCONFIG_*` の ID が1本でも空なら `UnconfiguredFlagSource`（AWS を一切呼ばない）に
  フォールバックする。** これにより CI（`backend-ci.yml`）と既存開発者の `.env` は無変更で
  安全（`MAPS_MODE` 未設定時に `UnconfiguredGoogleMapsProvider` に落ちるのと同じ構造）。
- stub の入力は `GetLatestConfiguration` が返す簡略 JSON と同じ形（本番と同じパーサを通す）。
  型は `str`（`dict` にすると pydantic-settings の自動 JSON デコードが絡み、
  `GOOGLE_ALLOWED_AUDIENCES` で踏んだ「パース失敗で起動できない」罠を再演しうるため）。

### D7: AppConfig に置く設定 JSON（SS-99 がそのまま使える例）

**書き込む側**（hosted configuration version の中身。`AWS.AppConfig.FeatureFlags` の正規形）:

```json
{
  "version": "1",
  "flags": {
    "client_requirements": {
      "name": "client requirements",
      "description": "機能フラグではない予約キー。クライアントの最低サポートバージョンを属性で配る。必ず enabled=true にすること（false にすると属性が配信されず backend は null にフォールバックする）",
      "attributes": {
        "ios_minimum_version": {
          "description": "これ未満の iOS アプリにアップデートを促す（SS-101）",
          "constraints": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" }
        },
        "android_minimum_version": {
          "description": "これ未満の Android アプリにアップデートを促す（SS-101）",
          "constraints": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" }
        }
      }
    },
    "app_config_probe": {
      "name": "app config probe",
      "description": "基盤の疎通確認用。機能には紐づかない。最初の実フラグが入ったら削除する"
    }
  },
  "values": {
    "client_requirements": {
      "enabled": true,
      "ios_minimum_version": "0.1.0",
      "android_minimum_version": "0.1.0"
    },
    "app_config_probe": { "enabled": false }
  }
}
```

**読み取る側**（`GetLatestConfiguration` が返す簡略 JSON。backend / stub が扱う形）:

```json
{
  "client_requirements": {
    "enabled": true,
    "ios_minimum_version": "0.1.0",
    "android_minimum_version": "0.1.0"
  },
  "app_config_probe": { "enabled": false }
}
```

スキーマ上の制約（AWS 公式の型リファレンスより。SS-99 が守る必要がある）:

- フラグキー / 属性名は `^[a-z][a-zA-Z\d_-]{0,63}$`（先頭は小文字英字。snake_case で統一）。
- `version` は `"1"` 固定・必須。トップレベルは `version` / `flags` / `values` のみ
  （`additionalProperties: false`。独自のメタ情報を足せない。D9 の理由）。
- **`enabled: false` のフラグの属性は `GetLatestConfiguration` の応答に含まれない**
  （AWS の仕様）。`client_requirements` は**常に ON に保つ**必要がある。OFF にすると
  最低サポートバージョンが `null` に落ちる（= 強制アップデートしない側なので安全）。
- 最低サポートバージョンを配るためだけの別 Configuration Profile は作らない。
  infra（SS-94）が作った profile は `feature-flags` の1本だけのため、既存 profile に
  相乗りしている。
- フラグキーの命名規約: `_enabled` のような接尾辞を付けず、機能名の snake_case にする
  （`flags` という map の値が bool なので、接尾辞は冗長）。例: `walk_sharing`, `route_replay`。

`app_config_probe`（疎通確認用フラグ）について: SS-98 時点では実機能に紐づくフラグが
1つも無く、SS-99（切替ワークフロー）も SS-100（mobile の消費）も切り替える対象が無いと
検証できない。そのため、登録簿と AppConfig の JSON 例にこのフラグを1つ置いた
（client 公開・既定 OFF・挙動なし）。**最初の実フラグが入った時点で削除する**
（決定6 の「削除まで含めて1つ」に反する常駐フラグにしない。コード上のコメント
（`core/feature_flags.py`）にも同じ注記がある）。

### D8: `GOOGLE_MAPS_LOOP_ROUTE_ENABLED` は AppConfig へ移行しない

「移行・対応が必要な事項」の宿題への回答。**環境変数のまま残す。**

- AppConfig 基盤の既定値は**全フラグ OFF**（決定9）。`GOOGLE_MAPS_LOOP_ROUTE_ENABLED` の
  安全側は**ON**（既に公開済みの機能で、OFF にすると「同じ道で戻る」フォールバックに落ちる）。
  移行すると「AppConfig が読めない → 公開済み機能が静かに劣化する」という、今は存在しない
  障害経路が増える。
- kill switch は「何かが壊れたときに止める」ためのもので、AppConfig 自体が壊れていても
  効いてほしい。
- backend 内部のフラグでクライアントには公開しない（`/app-config` に出す理由が無い）。

一般規則として書き下す:

| 種類 | 安全な既定 | 置き場所 |
|---|---|---|
| 未公開機能の公開制御（リリース） | OFF | **AppConfig** |
| 公開済み機能の緊急停止（kill switch） | ON | **環境変数（`Settings`）** |

### D9: フラグ定義の所有（コードの登録簿 / AppConfig の値）

| 決めること | 所有者 | 変更手段 |
|---|---|---|
| フラグキーの正典・説明・**クライアント公開の可否** | **backend のコード**（`core/feature_flags.py` の `FEATURE_FLAGS`） | PR（レビューを通る） |
| フラグの値（ON / OFF）・最低サポートバージョン | **AppConfig**（hosted configuration version） | GitHub Actions（SS-99） |

- **公開可否をコード側に置くのが要点。** AppConfig の値を切り替える操作で
  「backend 内部専用のつもりだったフラグがクライアントに露出する」事故を構造的に防ぐ
  （D7 のとおり AppConfig の JSON には独自メタ情報を足せない、という制約とも整合する）。
- `/app-config` は登録簿にある client フラグを必ず全部返す（AppConfig 側に無ければ
  `false`）。AppConfig 側にある未知キーは無視する（ログは DEBUG）。応答のキー集合が
  「デプロイされている backend のバージョン」で決まり、mobile から見て予測可能になる。
- フラグ定義ファイル（SS-99 が使う `flags.json` の置き場所とフォーマット）は SS-99 の
  担当（決定6 がそう割り当てている）。SS-99 でファイルを作るときは、登録簿（Python）と
  ファイル（JSON）のキー集合が一致することを pytest で検査することを推奨する。

### D10: キャッシュ方針

- レスポンスヘッダは **`Cache-Control: no-store`**。
- CloudFront のキャッシュポリシー（Terraform 所有）に挙動を依存させたくない。リリース当日に
  「フラグを ON にしたのに反映されない」の原因が CloudFront かポーリング間隔（既定60秒）か
  コンテナ再利用かで切り分け不能になるのを避けるため。`/app-config` は DB も外部 API も
  叩かない軽量経路で、キャッシュしないコストは小さい。
- 反映の遅延要因は **AppConfig のベイク時間 + ポーリング間隔（既定60秒）+ 実行環境ごとの
  ばらつき**に閉じる。後日トラフィックが増えたら `max-age` を入れる余地は残る
  （expand で足せる）。
- **`Cache-Control: no-store` は OpenAPI（`openapi.yaml`）には出力されない。** FastAPI の
  router が `Response.headers` 経由で実行時に付与するヘッダーであり、`response_model` の
  スキーマにもレスポンス定義にも現れない。mobile（Orval で `openapi.yaml` を消費する側）から
  はこの契約が見えないため、キャッシュしない前提で実装する必要がある場合は本 ADR
  （またはコードコメント）を参照させること。
- **`config_source` は「最後に値を取得できた出所」を示す。** 決定9-1 のとおり取得失敗時は
  known-good を維持するため、直近の取得が失敗していても、その値が AppConfig 由来なら
  `"appconfig"` を返す（`"default"` に変わるのは一度も取得できていない場合だけ）。
  クライアントは `config_source` で挙動を分岐させないこと（診断用）。

## 関連情報

- [ADR-004: シークレットの保管先は「消費者」で決め、CI から AWS への認証は OIDC を使う](./ADR-004-secrets-management-and-cicd-aws-credentials.md)
  —— GitHub Environment と AWS アカウントの 1:1 対応、OIDC ロールの trust の絞り方。
  決定6 のフラグ切り替えロールも同じ枠組みに載る
- [ADR-005: backend は Lambda Function URL(AWS_IAM) + CloudFront で公開し、SAM で zip デプロイする](./ADR-005-backend-serverless-deployment-lambda-function-url.md)
  —— 本 ADR の出発点。SS-72 追補がこの ADR を予約した。決定4・決定5 の内容はそこで確定済み
- [ADR-006: mobile アプリの配信は EAS（Expo ホスト）に委ね、mobile 用 SAM テンプレートを作らない](./ADR-006-mobile-app-delivery-eas-hosted.md)
  —— 決定3・決定8 の前提（配布経路、`runtimeVersion` と `version` の関係）
- [ADR-007: 周回ルート（往路と異なる道で戻る）の生成方式](./ADR-007-loop-route-generation.md)
  —— 現行の唯一のフラグ `GOOGLE_MAPS_LOOP_ROUTE_ENABLED` の由来
- [docs/release-runbook.md](../release-runbook.md) —— 本 ADR に基づく実際のリリース手順
- [packages/backend/docs/deployment.md](../../packages/backend/docs/deployment.md)
  —— backend のデプロイ手順、タグと GitHub Release、現行の kill switch の運用
- [packages/mobile/docs/build-profiles.md](../../packages/mobile/docs/build-profiles.md)
  —— ビルドプロファイル、ビルド番号の採番、表示用 `version` の運用ルール
- Plane: SS-104（本 ADR）、SS-72（起点）、SS-94 / SS-95 / SS-96 / SS-97（infra）、
  SS-98 / SS-99（backend・CI）、SS-100 / SS-101（mobile のフラグ受け皿・強制アップデート）、
  SS-102 / SS-103（mobile のリリース自動化・OTA）
- [AWS AppConfig feature flags (AWS 公式ドキュメント)](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-configuration-and-profile-feature-flags.html)
- [AWS AppConfig deployment strategies (AWS 公式ドキュメント)](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-deployment-strategy.html)
  —— 定義済み Deployment Strategy のベイク時間
- [Deployment patterns (Expo 公式ドキュメント)](https://docs.expo.dev/eas-update/deployment-patterns/)
  —— channel / branch と runtimeVersion の関係
