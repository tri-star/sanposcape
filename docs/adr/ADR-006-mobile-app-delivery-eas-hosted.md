# ADR-006: mobile アプリの配信は EAS（Expo ホスト）に委ね、mobile 用 SAM テンプレートを作らない

## 日付

2026-09-07（初版）、2026-09-13 追補（Android/iOSの配布経路確定、SS-79）

## ステータス

採用（SS-77 で決定）

SS-77「app: Web配信対象を確定し、SS-74向けのSAMデプロイを実装する」の調査結果として本 ADR を作成し、
SS-77 自体は「作らない」決定に到達した時点で Cancelled とした。実作業は SS-78 / SS-79 が引き継ぐ。

## コンテキスト

[ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md) で backend の公開方式
（Lambda Function URL + CloudFront、SAM で zip デプロイ）が固まり、次に「アプリそのものを
どうやってユーザーの端末へ届けるか」を決める必要が生じた。

このとき、以下の 2 つの前提が検討の出発点に置かれていた。**どちらも成り立たない。**

1. **SS-74（infra 側）の前提**: 「frontend = Next.js SSR を Lambda に載せる」。
   しかし本リポジトリに frontend パッケージは存在せず、Next.js の採用も決まっていない。
   構成は `packages/mobile`（React Native / Expo）と `packages/backend`（FastAPI）の 2 つだけである。
2. **SS-77 の当初の前提**: 「Expo で TestFlight 配信し、その後 EAS Update で差分を配信するには、
   JS バンドルやアセットを S3 などへアップロードしておく必要があるのではないか」。
   これは EAS Update の配信責務を自前インフラ側に置く想定だが、実際には Expo 側が持っている。

そのため本 ADR は「mobile の配信面として AWS 側に何を作るべきか」を確定させる。

### 現状（調査時点で既にリポジトリにあるもの）

EAS Update への接続は**既に設定済み**であり、新規に用意するものは無かった。

- `packages/mobile/package.json`: `expo-updates` を依存に含む
- `packages/mobile/app.json`: `updates.url = https://u.expo.dev/<projectId>`（EAS Update のエンドポイント）
- `packages/mobile/app.json`: `runtimeVersion.policy = "appVersion"`
  （ネイティブバイナリと JS バンドルの互換性境界を `version` で切る）
- `packages/mobile/eas.json`: development / preview / production の各プロファイルに `channel` を設定済み

## 決定

### 決定1: mobile 用の SAM テンプレートは作らない

`packages/mobile` に対応する SAM テンプレート（`template.yaml` / `samconfig.toml`）を作らない。
SAM で管理するのは backend のみとする。

### 決定2: JS バンドル・アセットの配信は EAS Update（Expo ホスト）に委ねる

OTA 更新の manifest とアセットの保管・配信は Expo のインフラが担う。
自前の S3 バケット・CloudFront ディストリビューション・Lambda を一切用意しない。

`expo-updates` は `updates.url` が指すサーバーから **manifest → アセット** の 2 フェーズで取得する。
このサーバーは「Expo Updates protocol」を実装していれば EAS 以外でもよいが、本プロジェクトでは
EAS Update をそのまま使う。

### 決定3: ストアへのバイナリ配信も AWS を経由しない

- iOS: EAS Build → `eas submit` → App Store Connect → TestFlight。バイナリは Apple 側にホストされる。
- Android: 同様に Play Console。~~ストア公開前の APK 直配布の手段は SS-79 で別途決める。~~
  **（SS-79 追補: 決定した）** ストア公開前は EAS internal distribution（`staging-apk`）で
  APK を直接配布する。詳細は下記「SS-79 追補: ストア公開前の配布経路を確定する」を参照。

### 決定4: 「mobile の Web 版を配信する」という選択肢は採らない

`app.json` の `web.output = "static"` により Expo Router の Web 書き出し自体は可能だが、
アプリ本体を Web で配信する要件は無い。Web 互換性（`react-native-maps` / ネイティブ Google Sign-in /
`expo-location` のバックグラウンド挙動など）の検証コストに見合わないため、選択肢から外す。

### 決定5: AWS 側に必要になる mobile 隣接の配信面は「静的サイト」であり、SAM の対象外とする

調査の結果、AWS 側に実需が生じるのは以下で、いずれも **Lambda / SSR を必要としない**。
これらは Terraform（`sanposcape-infra`）側の S3 + CloudFront で扱い、SAM とは二重管理しない。

1. **プライバシーポリシー URL / サポート URL**（優先度が高い）
   App Store Connect は 2018 年 10 月以降、App Store への公開だけでなく
   **TestFlight の外部テスト**にもプライバシーポリシー URL を必須としている。Google Play も同様。
   ストア公開より手前の段階で実需が発生する。
2. **APK ダウンロード配布**（SS-79 の Android 側の選択肢の一つ）
   EAS の internal distribution や GitHub Releases のほうが軽い。S3 を選ぶ場合も素の
   S3 + CloudFront であり、SAM は関与しない。
3. **Universal Links / App Links**（`apple-app-site-association` / `assetlinks.json`）
   現状 scheme は `sanposcape://` のみで未使用。将来採用する場合も静的ファイル配信で済む。
   **（SS-79 追補）** scheme は開発用 `sanposcape-dev://` / 本番用 `sanposcape://` の2つに
   なった。将来 AASA / assetlinks を配信する場合も、両 appID を1ファイルに列挙できるため
   識別子分割は障害にならない（infra 照会 2026-09-13）。

## 検討した選択肢

### 選択肢1: EAS Update（Expo ホスト）をそのまま使い、mobile 用 SAM を作らない ← 採用

- **概要**: `updates.url` を `https://u.expo.dev/<projectId>` のままにし、`eas update` で配信する。
  AWS 側には何も作らない。
- **メリット**:
  - 追加の実装・運用コストがゼロ。既にリポジトリの設定が完了している。
  - manifest の署名・アセットの整合性・エッジ配信・ロールバックを Expo が担保する。
  - Free プランに「1K MAU / 100 GiB のエッジ帯域 / 20 GiB のストレージ」が含まれ、
    MVP 段階の想定利用者数では課金が発生しない。
  - `eas update` / channel / branch / `runtimeVersion` の運用が Expo のドキュメントどおりに通る。
- **デメリット**:
  - Expo（EAS）への依存が生じる。無料枠は 1K MAU で頭打ちで、超過時は有料プランが必要。
  - 配信状況の可観測性が Expo のダッシュボード側にあり、AWS 側のログ基盤と分断される。

### 選択肢2: 自前ホスト（S3 + CloudFront + Lambda で Expo Updates protocol を実装する）

- **概要**: `expo-updates` は EAS 以外のサーバーも使える。manifest エンドポイントを自前で実装し、
  アセットを S3 + CloudFront から配信する。SAM の対象になりうるのはこの案のみ。
- **メリット**:
  - 配信インフラを自アカウント内に閉じられ、ログ・課金・アクセス制御を AWS 側で統一できる。
  - MAU 課金から独立する。
- **デメリット**:
  - Expo Updates protocol v1 の実装が必要（manifest の署名付き multipart レスポンス、
    code signing、`expo-channel-name` 等のヘッダー解釈、アセットの配信）。
    参考実装（`expo/custom-expo-updates-server`）はあるが、本番運用の責務は自前になる。
  - 実装をしくじると「アプリが起動しない・更新が降ってこない」が本番でのみ発現する。
    OTA は不具合の影響がユーザー端末に直接届く経路であり、リスクの割に得るものが少ない。
  - MVP 段階でこのコストを払う動機（無料枠超過・ベンダー非依存の要求）がまだ発生していない。

### 選択肢3: OTA 更新を使わず、ストア審査のみで更新する

- **概要**: `expo-updates` を外し、更新は常にストア経由にする。
- **メリット**: 配信面の検討そのものが不要になる。
- **デメリット**:
  - 軽微な修正でもストア審査（iOS は数時間〜数日）を待つことになり、
    MVP 期の修正サイクルと合わない。
  - 既に導入済みの `expo-updates` を撤去する作業が発生し、得るものが無い。

## 決定理由

- **前提が事実に反していた。** 「EAS Update のために S3 が必要」という当初の想定を検証した結果、
  バンドルとアセットの保管・エッジ配信は Expo 側の責務であることが確認できた。
  必要ないものを作らないのが最もコストが低い。
- **ロックインが薄い。** 将来 EAS から離れる判断をしても、変更点は `app.json` の `updates.url` と
  配信パイプラインであり、アプリのコードには波及しない。今から選択肢2 を先取りする理由が無い。
- **OTA は失敗の影響がユーザー端末に直接届く経路である。** 自前実装の不具合は本番でのみ発現し、
  かつ「アプリが起動しない」形で出る。MVP 段階で自前運用する合理性が無い。
- **SAM の責務を backend に閉じたままにできる。** ADR-005 が定めた「SAM と Terraform の境界」に
  新しい例外を持ち込まずに済む。

## 影響

### ポジティブな影響

- mobile の配信面に関する新規のインフラコード・デプロイ手順・監視対象が発生しない。
- SS-74（infra: frontend の配信面）が前提としていた
  **「AuthType = NONE + 共有シークレットヘッダー」という設計課題が消える**。
  配信対象が静的サイトであれば S3 オリジン + OAC がそのまま使え、
  「Function URL の直叩きをどう塞ぐか」「シークレットの発行・ローテーションの責務」を
  設計する必要が無くなる。
- SAM のスタックが backend の 1 つに保たれ、ADR-005 の Terraform との契約が単純なままになる。

### ネガティブな影響・トレードオフ

- EAS Update の無料枠（1K MAU）を超えた時点で、有料プランへの移行か選択肢2 への移行かの
  判断が必要になる。判断を先送りしている点は自覚しておく。
- OTA 更新の配信ログ・失敗率が Expo のダッシュボード側にあり、
  backend の CloudWatch 側と分断される。障害調査時に見る場所が 2 つになる。

### 移行・対応が必要な事項

- [ ] `eas update` を使った OTA 配信の実運用手順（channel / branch の運用、`runtimeVersion` を
      上げるべき変更の見分け方、ロールバック手順）を文書化する。ストア配信を実際に始める
      SS-79 と同時期に必要になる。
- [ ] プライバシーポリシー / サポートページの静的サイトをどこに置くかを SS-74 側と確定する。
      TestFlight の外部テストを始める前に必要になる。
- [ ] EAS Update の MAU が無料枠に近づいた際の判断基準を決める（未着手。実利用者が付いてから）。

## SS-79 追補: ストア公開前の配布経路を確定する

決定3 に残っていた「Android のストア公開前の APK 直配布の手段は SS-79 で別途決める」に答える。

### 決定

- **Android のストア公開前の配布は EAS internal distribution（`staging-apk` プロファイル）
  とする**（S3 + CloudFront / GitHub Releases は不採用）。
  - **GitHub Releases 不採用の理由**: public リポジトリのため APK を誰でも入手でき、
    dev backend（Google 認証は本物）を向いたバイナリが出回る。第三者が dev の DB にデータを
    作り、dev Lambda の同時実行枠 5 を取り合う（infra Q4）。
  - **S3 + CloudFront 不採用の理由**: AWS 側に資産・IAM ロール・鍵が増える。`staging-apk` が
    既にあり、決定2（配信は EAS に委ねる）とも一貫する。工数に見合う便益が無い。
- **iOS は TestFlight の内部テスターのみ**で開始する。外部テストはプライバシーポリシー URL が
  必須で、その配信面（SS-74）がまだ存在しないため対象外。
- 「移行・対応が必要な事項」のうち**「プライバシーポリシー / サポートページの静的サイト」は
  依然として未消化**である。外部テストに進む段で infra へ依頼すること
  （提案ホスト名 `https://sanposcape.com/privacy` / `/support`。未確定）。
- 新設した `.github/workflows/mobile-release-build.yml`（`workflow_dispatch` 専用）が
  Android の EAS ビルド起動と iOS の EAS ビルド + `eas submit` を担う。

### 関連

[docs/adr/ADR-004: シークレット管理](./ADR-004-secrets-management-and-cicd-aws-credentials.md)
の SS-79 追補（`GOOGLE_MAPS_ANDROID_SDK_KEY` の保管先拡張・ASC API Key の扱い）も参照。

## SS-89 追補: ビルド番号の採番を EAS サーバー側（`appVersionSource: "remote"`）へ移す

SS-79 追補で決めた配布経路（`mobile-release-build.yml` からの `workflow_dispatch`）に残っていた
「配布ビルド前に `app.json` のビルド番号を上げる PR を出す」という手作業を廃止する。

### 決定

- **`packages/mobile/eas.json` の `cli.appVersionSource` を `"remote"` にし、`staging` /
  `production` に `autoIncrement: true` を置く。** iOS の `buildNumber` / Android の
  `versionCode` は EAS サーバーが保持し、ビルドのたびに自動で 1 つ進む。
  - **`local` を採らない理由**: `local` では EAS CLI が採番結果をローカルのファイルへ書き戻すが、
    CI のランナーはビルド後に破棄されるため書き戻しが失われ、次回も同じ番号でビルドされて
    App Store Connect に弾かれる。書き戻しを永続化するには CI に `contents: write` と push が
    必要で、`workflow_dispatch` 一本という単純さを崩す。**`remote` は番号の保持先がサーバー側に
    あるため、この問題が構造的に発生しない。**
  - **手動運用を採らない理由**: 上げ忘れ・並行 PR での番号衝突が起きやすく、上げ忘れると
    EAS の無料ビルド枠（iOS/Android 各 15 回/月）を 1 回消費してから `submit` で失敗する。
    枠を消費してから発覚するのが最も高い失敗の仕方である。
- **`app.json` から `ios.buildNumber` / `android.versionCode` を削除する。** remote では
  app config の値は無視され更新もされないと Expo が明記しており、無視される古い値（`1`）を
  残すと「app.json を見れば配布中の番号が分かる」という SS-79 時代の読み方が誤った答えを返す。
  `expo prebuild` / `expo run:*` は未指定時の既定値（`1`）で成立し、その成果物は配布しない。
- **`expo.version` はリポジトリ側で手動管理を継続する。** `runtimeVersion.policy: "appVersion"`
  により `version` は OTA の互換境界そのもの（上げた瞬間、既存端末はその後の新 version 向け
  `eas update` を受け取らなくなる）であり、自動で動かしてよい値ではない。上げるタイミングの
  ルールは `packages/mobile/docs/build-profiles.md` に記載する。
- **`staging-apk` / `staging-ios` の `autoIncrement: false` は削除して `staging` の `true` を
  継承させる。** 内部配布ビルドでも番号を進める。中身の違う成果物が同じ番号を名乗る曖昧さを
  消すためで、番号自体は有限資源ではない（消費が痛いのは EAS のビルド枠であって整数ではない）。
- **SS-80 Phase 4（`local` 管理方針の踏襲）は取り下げる。** SS-102 の「バージョンは app.json と
  整合」という前提は、**表示用の `version` のみを指す**ものとして読み替える。

### 未検証・未確認として残すもの

- **`eas build --local`（`mobile-e2e.yml` の `preview` プロファイル）と `remote` の組み合わせは
  Expo 公式ドキュメントに明記がない。** `appVersionSource` はプロファイル単位に上書きできない
  ため E2E も remote から番号を読む。`preview` に `autoIncrement` を置かないことで「読み取り
  だけ」に留めてある。`build:version:get --profile preview` が値を返すことは実測したが、
  `eas build --local` がビルド実行時に同じ経路を使うかは未実測なので、切り替え PR のマージ前に
  `mobile-e2e` を手動ディスパッチして実証する（`--local` なので EAS の枠を消費しない）。

### 実測で確定したこと（2026-09-20）

- **リモートバージョンはアプリ識別子ごとに保持される。** `staging` 系
  （`com.sanposcape.app.dev`）を `1` に初期化したあとも `production`（`com.sanposcape.app`）は
  `No remote versions are configured` のままだった。CLI の出力自体も
  `with bundle identifier "..."` / `with application ID "..."` と識別子を名指しする。
  同じ識別子を共有する `staging` / `staging-apk` / `staging-ios` / `preview` / `development` は
  同じ値を読むため、**初期化は `staging` に対して 1 回行えば足りる**。
  - この確認が取れたので、`production` は「触れない」のではなく
    **本番ビルドを始める段で `--profile production` に対して初期化すればよい**。
- **`eas build:version:get` は Expo 公式ドキュメントに載っていないが CLI には実在する**
  （`eas-cli 24.7.0`）。現在値を知るだけなら app config を書き換える `sync` ではなく `get` を使う。
- **`eas build:version:set` は非対話モードを持たない。** 値はプロンプトで聞かれ、パイプ入力は
  `Input is required, but stdin is not readable` で失敗する。CI へ組み込める形ではない
  （もっとも、初期化は移行時の 1 回だけなので組み込む必要もない）。

### 関連

運用手順・切り戻し手順の詳細は
[packages/mobile/docs/build-profiles.md](../../packages/mobile/docs/build-profiles.md) の
「ビルド番号の採番」「表示用バージョン `version` の運用ルール」を参照。

## 関連情報

- [ADR-005: backend は Lambda Function URL(AWS_IAM) + CloudFront で公開し、SAM で zip デプロイする](./ADR-005-backend-serverless-deployment-lambda-function-url.md)
  —— SAM と Terraform の責務境界。本 ADR はこの境界に mobile の例外を作らないことを決めている。
- [ADR-004: シークレット管理と CI/CD の AWS 認証情報](./ADR-004-secrets-management-and-cicd-aws-credentials.md)
  —— `EXPO_TOKEN` の扱い。
- [packages/mobile/adr/ADR-003: development build と開発ループ](../../packages/mobile/adr/ADR-003-development-build-and-dev-loop.md)
- [packages/mobile/adr/ADR-004: E2E ビルド・CI 戦略](../../packages/mobile/adr/ADR-004-e2e-build-ci-strategy.md)
  —— `eas build --local` で EAS のクラウド枠を消費しない既存方針。iOS ビルドにはそのまま適用できない
  （SS-79 の検討事項）。
- Plane: SS-77（本 ADR の起点。Cancelled）、SS-74（infra 側の配信面）、
  SS-78（EAS ビルドを CloudFront の backend に向ける）、SS-79（ストア公開前の配布経路）
- Expo ドキュメント: [expo-updates](https://docs.expo.dev/versions/latest/sdk/updates/)、
  [EAS Update の仕組み](https://docs.expo.dev/eas-update/how-it-works/)、
  [デプロイパターン](https://docs.expo.dev/eas-update/deployment-patterns/)、
  [料金](https://expo.dev/pricing)
- 参考実装（採用しなかった選択肢2 のもの）: [expo/custom-expo-updates-server](https://github.com/expo/custom-expo-updates-server)
