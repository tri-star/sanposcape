# EAS ビルドプロファイルと環境変数

`packages/mobile/eas.json` の各ビルドプロファイルが「どの backend を向くか」「どの環境変数を
持つか」をまとめる。ローカル開発（Metro + `.env`）の手順は
[ローカル環境構築手順](./local-env.md)、development build の考え方は
[ADR-003](../adr/ADR-003-development-build-and-dev-loop.md) を参照。

## 大前提: EAS ビルドでは `.env` が読まれない

`packages/mobile/.env` は Metro をローカルで起動するときにしか効かない。
**EAS ビルドのビルドコンテキストに `.env` は載らない**ため、値の供給元は次の 2 つに限られる。

| 供給元 | 用途 | 例 |
|---|---|---|
| `eas.json` の `env` | git にコミットしてよい値 | backend の URL、動作モード |
| EAS の環境変数（`eas env:create`）/ `eas build --local` のシェル環境変数 | git に置かない値 | Maps SDK キー、Google OAuth クライアント ID |

この区別は Expo 公式の `eas.json` リファレンスが `env` について
「git リポジトリにコミットする値のみに使い、パスワードや秘密情報には使わないこと」と
定めているものに沿っている。Maps SDK キーの扱いは
[ADR-007](../adr/ADR-007-expo-config-and-maps-key-injection.md) を参照。

> **設定漏れはビルドでは落ちない。** `EXPO_PUBLIC_BACKEND_API_URL` が未設定でも
> `src/config/env.ts` の `getApiBaseUrl()` が `http://localhost:8000` にフォールバックするため、
> **ビルドは成功し、アプリを起動して初めて「通信が全く成立しない」形で発覚する**。
> プロファイルを追加するときは必ず `env` も一緒に定義すること（SS-78）。

## プロファイル一覧

| プロファイル | 用途 | `distribution` | `environment` | Android 成果物 | backend の向き先 |
|---|---|---|---|---|---|
| `development` | 日常の開発（dev client + Metro の Fast Refresh） | internal | `development` | apk | ビルド時は未指定。**実行時に Metro が読み込む `.env` の値**が効く |
| `preview` | CI の Maestro E2E 専用 | internal | `preview` | apk | `http://10.0.2.2:8000`（ランナー上のローカル backend 直結） |
| `staging` | dev AWS 環境向けの **TestFlight / ストア配布**ビルド | **store** | `preview` | app-bundle | `https://app-api.dev.sanposcape.com` |
| `staging-apk` | `staging` と同じ中身の **Android APK**（サイドロード配布用） | internal | `preview`（継承） | apk | 同上 |
| `production` | 本番のストア配信 | store | `production` | app-bundle | `https://app-api.sanposcape.com` |

### `environment` は必ず明示する

`environment` は **EAS サーバー側に登録した環境変数（`eas env:create`）のどのセットを読むか**を
決めるフィールドで、値は `development` / `preview` / `production` の 3 つだけ
（カスタム名は Enterprise / Production プランのみ）。

**省略すると EAS が自動で決める。** 公式の規則は次のとおり。

> `production` when `distribution` is set to `store`, `development` when `developmentClient` is
> `true`, `preview` for everything else

この自動判定が**罠になる**。`staging` は TestFlight に載せるため `distribution: "store"` が必須で、
`environment` を省くと**自動的に `production` 環境**の変数を読んでしまう。
つまり dev の GCP プロジェクトのクライアント ID を `preview` に登録しても読まれず、
本番用の値が dev 向けビルドに入る（またはどちらも無くてサインインが壊れる）。

そのため **全プロファイルで `environment` を明示している**。自動判定に頼らないこと。

### `staging`（dev AWS 環境向けの配布ビルド）

CloudFront 経由の backend（`app-api.dev.sanposcape.com`）を向き、**TestFlight で配れる形**
（`distribution: "store"`）で出力する。

- **iOS の `internal` は TestFlight ではない。** EAS の internal distribution は iOS では
  Ad Hoc / Enterprise プロビジョニングを意味し、UDID 登録済みの端末にしか入らない。
  TestFlight に載せるには App Store Connect へ submit できる `store` ビルドが要る。
- **`distribution` はプラットフォーム別に指定できない**（eas.json の共通プロパティ）。
  そのため「iOS は TestFlight / Android は APK 直配布」を 1 プロファイルでは満たせず、
  Android APK 用に `staging-apk` を分けている。
- `AUTH_MODE` / `LOCATION_MODE` は `real`。`real` はどちらも未設定時のフォールバック値でもあるが、
  「このビルドは本物の Google サインインと本物の位置情報で動く」という意図を読み取れるように
  明示している。

プロファイル名を `staging` にしたのは、ADR-005 決定6 のとおり **SAM/Terraform の `Env=dev` は
アプリの `ENV=staging` に対応する**ため。`development` プロファイルは
「dev client を使う開発ビルド」の意味なので、AWS の環境名 `dev` をそのまま使うと衝突する。

> **未決: `staging` と `production` は同じ bundle ID を共有している。**
> どちらも `com.sanposcape.app` なので **App Store Connect 上は同一のアプリレコード**になり、
> dev backend を向いた `staging` ビルドが本番ビルドと同じ TestFlight に並ぶ。
> 分けたい場合は bundle ID を分ける（例: `com.sanposcape.app.staging`）ことになるが、
> iOS の OAuth クライアントは bundle ID ごとの登録が必要なため、Google 側の登録・
> Maps キーの制限・アイコン/表示名まで波及する。SS-79 で判断すること。

### `staging-apk`

`extends: "staging"` で `staging` の `env` / `channel` / `environment` を継承し、
`distribution` と Android の成果物だけを APK に差し替えたもの。**`env` を二重管理しない**ための
継承であり、ここに `env` を書き足してはならない（`staging` と値がずれた瞬間に
「どちらのビルドか分からない」状態になる）。

`autoIncrement` は `false` に落としてある。サイドロード用のビルドでバージョンを進める必要がなく、
進めると `staging` / `production` と採番が絡むため。

### `preview`（E2E 専用。CloudFront へ向けないこと）

`.github/workflows/mobile-e2e.yml` が `eas build --local --profile preview` で使う。
`EXPO_PUBLIC_AUTH_MODE=dev` / `EXPO_PUBLIC_LOCATION_MODE=mock` で外部依存を断ち、
backend はランナー上のローカル起動 + `adb reverse` で `10.0.2.2:8000` に届く前提になっている。

**ここを CloudFront に向けてはならない。** E2E が外部環境への依存と課金対象になり、
ワークフローの前提（ローカル backend 起動 + `adb reverse`）が崩れる。

このプロファイルは `developmentClient` を使わない release 相当のビルドなので、
`http://` の backend に届かせるために `app.config.ts` の
`withCleartextTrafficForHttpBackend` が `usesCleartextTraffic` を有効化する
（ADR-004 の SS-44 追補）。

> **`preview` 環境は `staging` と共有される。** EAS の環境は 3 つしかないため、E2E 用の
> `preview` プロファイルと配布用の `staging` プロファイルが同じ環境変数セットを読む。
> Google のクライアント ID は E2E が `AUTH_MODE=dev` で使わないので無害だが、
> `GOOGLE_MAPS_ANDROID_SDK_KEY` を `preview` に登録すると E2E ビルドにも渡る点は
> 意識しておくこと（ADR-004 の E2E は地図描画を assert しないため機能上の問題は無い）。

### `development`

`developmentClient: true` の dev client を作る。JS は Metro から配信されるため、
`.env` の値がそのまま効く。**ネイティブ依存が変わったときだけ**作り直せばよい（ADR-003）。

### `production`

本番のストア配信用。

> **prod のホスト名は未検証。** `app-api.sanposcape.com` は、インフラ側が採用している
> 「`app-api.<zone>`」というホスト名規則（dev = `app-api.dev.sanposcape.com`、
> `packages/backend/docs/deployment.md` §6.2）から導いた値である。**prod 環境へ実際に
> デプロイする前に、インフラ側（`sanposcape-infra`）の実際のホスト名と突き合わせること。**

## `eas.json` に書かない値（EAS の環境変数で供給する）

以下は `eas.json` に書いていないため、**`development` / `preview` プロファイル以外で
ビルドする前に EAS 側へ登録が必要**になる。

| 変数 | 必要なプロファイル | 未設定時の症状 |
|---|---|---|
| `GOOGLE_MAPS_ANDROID_SDK_KEY` | Android の実機確認・配信ビルド全般 | 地図が灰色のまま描画されない（ADR-007） |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `AUTH_MODE=real` のビルド（`staging` / `staging-apk` / `production`） | サインイン時に `AuthError("configuration")` |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS の `AUTH_MODE=real` のビルド | 同上 |

### なぜ mobile 側にもクライアント ID が要るのか

backend が Google と直接やり取りする構成（confidential client）は、モバイルでは
[ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) 決定1 により採っていない。
**アプリがネイティブに Google ID token を取り、それを `POST /auth/session` へ渡して
自前トークンに交換する**流れなので、ID token を取る 1 回のためにアプリ側にもクライアント ID が要る。

`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` は **ID token の `aud` に使う値**であり、
backend の `GOOGLE_ALLOWED_AUDIENCES` と**同じ値を共有する**（mobile 専用の別クレデンシャルではない）。
`client_secret` は使わない（public client）ため、クライアント ID 自体は秘密情報ではない。

### 登録手順

環境ごとに登録する。dev の GCP プロジェクトの値は **`preview`** 環境へ入れる
（`staging` / `staging-apk` がこの環境を読む）。

```bash
pnpm --filter mobile exec eas env:create \
  --environment preview \
  --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID \
  --value <dev GCP プロジェクトの Web クライアント ID> \
  --visibility plaintext \
  --scope project
```

- `--visibility` は **`plaintext`** でよい（クライアント ID は秘密情報ではない）。
  `secret` にすると EAS CLI からも読めなくなり、値の確認ができなくなる。
- 本番の GCP プロジェクトの値は同じ手順で `--environment production` に登録する。
- 登録済みの値は `eas env:list --environment preview` で確認できる。

## ストア配布に必要な残作業（SS-79）

- **`app.json` の `iosUrlScheme` がプレースホルダのまま**
  （`com.googleusercontent.apps.REPLACE_WITH_IOS_CLIENT_ID`）。実体は iOS クライアント ID の
  逆順表記で、ビルドした IPA の `Info.plist` に必ず入る公開値のため git にコミットしてよい。
- **Android の OAuth クライアントは署名鍵ごとに SHA-1 の登録が必要**（ADR-002）。
  Google Maps の SHA-1 登録と同じ作業が Google サインインにも要る。
- **`submit` プロファイルは空定義**（`{}`）。`eas submit --profile staging` は対話で聞かれる。
  App Store Connect のアプリレコード ID 等を固定するのは SS-79 の範囲。
- **`autoIncrement` の挙動は未検証。** `cli.appVersionSource` が `local` のため、
  EAS CLI はバージョンをローカルに書き戻す（公式: "you need to commit your changes on every
  build if you want the version change to persist"）。`app.json` には現時点で
  `ios.buildNumber` / `android.versionCode` が無く、初回のビルドで追加される想定。
  本リポジトリは `app.config.ts`（動的コンフィグ）を併用しているため、
  最初の `staging` ビルドで書き戻しが期待どおり動くかを確認すること。

## 切り替え後の検証

CloudFront 経由に向けたビルドの疎通確認は、**`GET /health` では絶対に露見しない**。
`packages/backend/docs/deployment.md` §6.2 のとおり、
**認証必須エンドポイント 1 本と、ボディを伴う POST 1 本**を実際に踏むこと。

| 症状 | 疑うべき点 |
|---|---|
| 全 API が 401 | `X-App-Authorization` が送られていない / backend が SS-67 未満 |
| 書き込み系だけ 403 | `x-amz-content-sha256` の欠落または値の不一致 |
| サインインすらできない | `src/services/auth/authApi.ts` 側の hash 付与漏れ、またはクライアント ID の未登録 |

`https://` の backend では `app.config.ts` の `withCleartextTrafficForHttpBackend` は
何もしない（`EXPO_PUBLIC_BACKEND_API_URL` が `http://` で始まるときだけ
`usesCleartextTraffic` を付ける実装）。`staging` / `production` のビルドに
cleartext 許可が混入することはない。

## 関連

- [ADR-002: 認証は Google 直結 + モバイル public client](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md)（決定1）
- [ADR-003: development build と開発ループ](../adr/ADR-003-development-build-and-dev-loop.md)
- [ADR-004: E2E ビルド・CI 戦略](../adr/ADR-004-e2e-build-ci-strategy.md)
- [ADR-007: Expo 設定と Maps キーの注入](../adr/ADR-007-expo-config-and-maps-key-injection.md)
- [ADR-005: backend のサーバーレスデプロイ](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md)（決定4 / 決定6）
- [ADR-006: mobile アプリの配信は EAS に委ねる](../../../docs/adr/ADR-006-mobile-app-delivery-eas-hosted.md)（`channel` が対応する EAS Update の配信面）
- [backend デプロイ手順](../../backend/docs/deployment.md) §6.2
