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

| プロファイル | 用途 | 配布 | Android 成果物 | backend の向き先 |
|---|---|---|---|---|
| `development` | 日常の開発（dev client + Metro の Fast Refresh） | internal | apk | ビルド時は未指定。**実行時に Metro が読み込む `.env` の値**が効く |
| `preview` | CI の Maestro E2E 専用 | internal | apk | `http://10.0.2.2:8000`（ランナー上のローカル backend 直結） |
| `staging` | dev AWS 環境（`ENV=staging`）に対する実機確認 | internal | apk | `https://app-api.dev.sanposcape.com` |
| `production` | ストア配信 | store | app-bundle | `https://app-api.sanposcape.com` |

### `development`

`developmentClient: true` の dev client を作る。JS は Metro から配信されるため、
`.env` の値がそのまま効く。**ネイティブ依存が変わったときだけ**作り直せばよい（ADR-003）。

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

### `staging`（dev AWS 環境の実機確認用）

CloudFront 経由の backend（`app-api.dev.sanposcape.com`）に対して、実機・エミュレータで
アプリを動かすためのプロファイル。ADR-005 決定6 のとおり **SAM/Terraform の `Env=dev` は
アプリの `ENV=staging` に対応する**ため、プロファイル名は `staging` に揃えている
（`development` プロファイルは「dev client を使う開発ビルド」の意味なので、
AWS の環境名 `dev` をそのまま使うと衝突する）。

`AUTH_MODE` / `LOCATION_MODE` は `real`。`real` はどちらも未設定時のフォールバック値でもあるが、
「このビルドは本物の Google サインインと本物の位置情報で動く」という意図を読み取れるように
明示している。

### `production`

ストア配信用。`autoIncrement: true` でビルド番号が自動採番される。

> **prod のホスト名は未検証。** `app-api.sanposcape.com` は、インフラ側が採用している
> 「`app-api.<zone>`」というホスト名規則（dev = `app-api.dev.sanposcape.com`、
> `packages/backend/docs/deployment.md` §6.2）から導いた値である。**prod 環境へ実際に
> デプロイする前に、インフラ側（`sanposcape-infra`）の実際のホスト名と突き合わせること。**

## `eas.json` に書かない値（EAS の環境変数で供給する）

以下は `eas.json` に書いていないため、**`development` / `preview` 以外のプロファイルで
ビルドする前に EAS 側へ登録が必要**になる。

| 変数 | 必要なプロファイル | 未設定時の症状 |
|---|---|---|
| `GOOGLE_MAPS_ANDROID_SDK_KEY` | Android の実機確認・配信ビルド全般 | 地図が灰色のまま描画されない（ADR-007） |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `AUTH_MODE=real` のビルド（`staging` / `production`） | サインイン時に `AuthError("configuration")` |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS の `AUTH_MODE=real` のビルド | 同上 |

登録方法は 2 通り。

```bash
# EAS のクラウドビルド / eas build --local のどちらからも読める形で登録する
pnpm --filter mobile exec eas env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <値>

# あるいは eas build --local のときだけシェル環境変数で渡す
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<値> pnpm --filter mobile exec eas build --local --profile staging ...
```

> **iOS の `AUTH_MODE=real` には `app.json` の修正も要る。**
> `plugins` の `react-native-nitro-google-signin` の `iosUrlScheme` が
> `com.googleusercontent.apps.REPLACE_WITH_IOS_CLIENT_ID` というプレースホルダのままである。
> iOS で実際に Google サインインを通す前に実値へ差し替えること（SS-79 の範囲）。

## 切り替え後の検証

CloudFront 経由に向けたビルドの疎通確認は、**`GET /health` では絶対に露見しない**。
`packages/backend/docs/deployment.md` §6.2 のとおり、
**認証必須エンドポイント 1 本と、ボディを伴う POST 1 本**を実際に踏むこと。

| 症状 | 疑うべき点 |
|---|---|
| 全 API が 401 | `X-App-Authorization` が送られていない / backend が SS-67 未満 |
| 書き込み系だけ 403 | `x-amz-content-sha256` の欠落または値の不一致 |
| サインインすらできない | `src/services/auth/authApi.ts` 側の hash 付与漏れ |

`https://` の backend では `app.config.ts` の `withCleartextTrafficForHttpBackend` は
何もしない（`EXPO_PUBLIC_BACKEND_API_URL` が `http://` で始まるときだけ
`usesCleartextTraffic` を付ける実装）。`staging` / `production` のビルドに
cleartext 許可が混入することはない。

## 関連

- [ADR-003: development build と開発ループ](../adr/ADR-003-development-build-and-dev-loop.md)
- [ADR-004: E2E ビルド・CI 戦略](../adr/ADR-004-e2e-build-ci-strategy.md)
- [ADR-007: Expo 設定と Maps キーの注入](../adr/ADR-007-expo-config-and-maps-key-injection.md)
- [ADR-005: backend のサーバーレスデプロイ](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md)（決定4 / 決定6）
- [ADR-006: mobile アプリの配信は EAS に委ねる](../../../docs/adr/ADR-006-mobile-app-delivery-eas-hosted.md)（`channel` が対応する EAS Update の配信面）
- [backend デプロイ手順](../../backend/docs/deployment.md) §6.2
