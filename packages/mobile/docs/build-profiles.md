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
| `development` | 日常の開発（dev client + Metro の Fast Refresh） | internal | `development` | apk | ビルド時は未指定。**実行時に Metro が読み込む `.env` の値**が効く（効くのは JS 側の `EXPO_PUBLIC_*` だけ。Maps SDK キーはビルド時に埋め込まれる。下記 `development` 節を参照） |
| `preview` | CI の Maestro E2E 専用 | internal | `preview` | apk | `http://10.0.2.2:8000`（ランナー上のローカル backend 直結） |
| `staging` | dev AWS 環境向けの **TestFlight / ストア配布**ビルド | **store** | `preview` | app-bundle | `https://app-api.dev.sanposcape.com` |
| `staging-apk` | `staging` と同じ中身の **Android APK**（サイドロード配布用） | internal | `preview`（継承） | apk | 同上 |
| `staging-ios` | `staging` と同じ中身の **iOS Ad Hoc ビルド**（UDID 登録済み端末への直接配布用） | internal | `preview`（継承） | ―（iOS 専用） | 同上 |
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

**dev の CloudFront は既に稼働している**（2026-09-11 時点で `GET /health` が 200 `{"status":"ok"}` を返す）。
`enable_distribution = true` は dev では apply 済みなので、**このプロファイルの疎通確認は今すぐ実施できる**。

- **iOS の `internal` は TestFlight ではない。** EAS の internal distribution は iOS では
  Ad Hoc / Enterprise プロビジョニングを意味し、UDID 登録済みの端末にしか入らない。
  TestFlight に載せるには App Store Connect へ submit できる `store` ビルドが要る。
- **`distribution` はプラットフォーム別に指定できない**（eas.json の共通プロパティ）。
  そのため「iOS は TestFlight / Android は APK 直配布」を 1 プロファイルでは満たせず、
  Android APK 用に `staging-apk` を、iOS の Ad Hoc 配布用に `staging-ios` を分けている。
- `AUTH_MODE` / `LOCATION_MODE` は `real`。`real` はどちらも未設定時のフォールバック値でもあるが、
  「このビルドは本物の Google サインインと本物の位置情報で動く」という意図を読み取れるように
  明示している。

プロファイル名を `staging` にしたのは、ADR-005 決定6 のとおり **SAM/Terraform の `Env=dev` は
アプリの `ENV=staging` に対応する**ため。`development` プロファイルは
「dev client を使う開発ビルド」の意味なので、AWS の環境名 `dev` をそのまま使うと衝突する。

> **結論（SS-79）: アプリ識別子は本番と開発で分ける。**
> 開発用（`development` / `preview`(E2E) / `staging` / `staging-apk` / `staging-ios`）は
> `com.sanposcape.app.dev`、本番（`production`）は `com.sanposcape.app`。scheme とアプリ名も
> 分ける（詳細は下記「アプリ識別子の定義」）。
>
> **理由（要約。詳細は `packages/mobile/adr/ADR-003` の SS-79 追補）**:
> 1. TestFlight / ストアのアプリレコードが構造的に分離され、dev backend を向いた `staging`
>    ビルドが本番ビルドと同じ TestFlight に並ぶ事態が起きなくなる。
> 2. 同一端末に本番と開発を共存させられる（同一識別子だと上書きインストールになる）。
> 3. **まだ誰にも配っていない今が分割の最安のタイミング**。配布後に分けると Apple の
>    アプリレコード・EAS 鍵・TestFlight ビルドのやり直しとテスターの再インストールが発生する。
> 4. 波及コストは調査の結果、当初の見積もりより小さいと判明した: infra 資産は 0 件、
>    Android は backend 無影響（`aud` は Web クライアント ID）、iOS は既存クライアントの
>    bundle ID を編集する経路が成立し backend（Secrets Manager / `sam deploy`）も無変更で済んだ。
>
> **iOS の OAuth クライアントは既存クライアントの bundle ID を `com.sanposcape.app.dev` に
> 編集する形で対応した**（クライアント ID は変わらなかったことをコンソールで確認済み）。
> そのため `iosUrlScheme` / EAS の `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` / Secrets Manager /
> `sam deploy` はすべて無変更。**本番用 iOS OAuth クライアントは未作成**で、`production` を
> 使い始める段で新規作成し `app.config.ts` の `PRODUCTION_VARIANT` に `iosUrlScheme` を
> 足す必要がある。

### `staging-apk`

`extends: "staging"` で `staging` の `env` / `channel` / `environment` を継承し、
`distribution` と Android の成果物だけを APK に差し替えたもの。**`env` を二重管理しない**ための
継承であり、ここに `env` を書き足してはならない（`staging` と値がずれた瞬間に
「どちらのビルドか分からない」状態になる）。

`autoIncrement` は `false` に落としてある。`staging`（`extends` 元）も SS-79 で
`autoIncrement` を外し `app.json` の静的なバージョン番号を使う運用になったため、この
`false` は「継承元の値に依存しない」ことを明示する記述であり、実際の挙動（バージョンを
進めない）は `staging` と同じになっている（下記「`autoIncrement` について」）。

### `staging-ios`

`extends: "staging"` で `env` / `channel` / `environment` を継承し、`distribution` だけを
`internal`（iOS では **Ad Hoc**）へ差し替えたもの。`staging-apk` の iOS 版にあたる。
`staging-apk` と同じ理由で、ここに `env` を書き足してはならない。

**TestFlight より速く実機へ届けたいときの経路**である。EAS に登録済み（`eas device:create`）の
UDID を持つ端末にだけインストールでき、**App Store Connect のアプリレコードも `eas submit` も
審査もビルド処理待ちも不要**。SS-81 の疎通実証はこのプロファイルで行った。

- 配布できるのは **UDID が Ad Hoc プロビジョニングプロファイルに含まれる端末のみ**。
  端末を増やすときは `eas device:create` で登録し、**プロファイルを再生成して再ビルドする**
  （既存ビルドには後から端末を足せない）。
- **関係者へ広く配るなら TestFlight（`staging`）を使う。** UDID 管理が要らず、
  外部テスターにも配れる（ただしプライバシーポリシー URL が必要。SS-79）。
- `autoIncrement` は `staging-apk` と同じ理由で `false`。
- iOS は既定で Apple Maps を使うため **Maps SDK キーの注入は不要**（ADR-007）。

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

> **`preview` の APK は x86_64 でしか動かない（SS-85）。** `mobile-e2e.yml` が
> `REACT_NATIVE_ARCHITECTURES=x86_64` を渡し、`app.config.ts` の
> `withAndroidGradleProperties` が `android/gradle.properties` の
> `reactNativeArchitectures` を上書きするため、**arm 系の実機にはインストールできない**。
> E2E のエミュレータが `arch: x86_64` 固定である以上ほかの ABI は無駄で、ビルド時間の半分と
> Gradle の Java heap OOM の一因になっていたため意図的に絞っている（ADR-004 の SS-85 追補）。
> **実機で確認したいときは `preview` を流用せず `staging-apk` を使うこと**（4 ABI のまま）。

> **`preview` 環境は `staging` と共有される。** EAS の環境は 3 つしかないため、E2E 用の
> `preview` プロファイルと配布用の `staging` プロファイルが同じ環境変数セットを読む。
> Google のクライアント ID は無害（E2E は `AUTH_MODE=dev` で、`configureGoogleSignIn()` は
> `src/services/auth/index.ts` で `mode === "real"` のときだけ呼ばれるため触られない）。
>
> **`GOOGLE_MAPS_ANDROID_SDK_KEY` は `preview` 環境に `secret` visibility でのみ登録する**
> （plaintext / sensitive での登録は禁止）。理由は下記「`GOOGLE_MAPS_ANDROID_SDK_KEY` の
> 供給元は経路ごとに1つにする（SS-79 で決着）」を参照。

### `development`

`developmentClient: true` の dev client を作る。JS は Metro から配信されるため、
`.env` の値がそのまま効く。**ネイティブ依存が変わったときだけ**作り直せばよい（ADR-003）。

> **実測（2026-09-16 確認）: EAS の `development` 環境にも Maps キーが登録されている。**
> `eas env:list development` の結果、`GOOGLE_MAPS_ANDROID_SDK_KEY`（secret）と
> `ANDROID_GOOGLE_MAPS_API_KEY`（sensitive）が登録されており、
> `eas build --profile development --platform android`（クラウド）で地図が表示される APK ができた。
> Maps SDK キーはネイティブ側にビルド時に埋め込まれるため、`.env` が効くのは JS 側の
> `EXPO_PUBLIC_*` だけで、Maps キーは実行時の `.env` では差し替わらない。
> この登録が下記 SS-79 の決定（`preview` 環境に secret）と別に意図して行われたものかは未確認で、
> ここでは事実の記録にとどめる。

### `production`

本番のストア配信用。

ホスト名 `app-api.sanposcape.com` は **infra 側の ADR-0001 §2.11「ホスト名の割り当て」で確定済み**
（2026-09-11 に `sanposcape-infra` 側へ照会して確認）。ADR は
「`app-api.sanposcape.com` はモバイルアプリに焼き込まれ後から変更が効かないため、本 ADR で確定とする」
と明記しており、**mobile 側がビルドに埋め込むことを前提に固定された値**である。

組み立ては `live/services/backend-api` の `host_label`（既定 `app-api`）と、
`live/dns/envs/<env>.tfvars` の `zone_name`（prod = `sanposcape.com` / dev = `dev.sanposcape.com`）の連結。
`live/account` の `default_app_record_names` と `route53:ChangeResourceRecordSets` の
レコード名制限により、infra 側の変更なしにホスト名だけ変えることはできない。

> **`app-api` と `api` は別ホストである。** モバイル用が `app-api.<zone>`、外部向けが `api.<zone>` で、
> distribution / WAF / レート制限 / 認証方式を独立させるため意図的に分けられている。
> **mobile からは必ず `app-api` 側を向けること。**

> **ただし prod の実体はまだ存在しない。** `live/services/backend-api/envs/prod.tfvars` は
> `enable_distribution = false` のままで、`app-api.sanposcape.com` は現時点で名前解決しない
> （2026-09-11 時点で `curl` が `Could not resolve host`）。前提となる
> SAM スタック `sanposcape-backend-prod` のデプロイが未実施で、**予定日も未定**。
> prod ビルドの疎通確認は当面できないため、dev（`staging` プロファイル）での確認を先に進めること。

## `eas.json` に書かない値（EAS の環境変数で供給する）

以下は `eas.json` に書いていないため、**`development` / `preview` プロファイル以外で
ビルドする前に EAS 側へ登録が必要**になる。

| 変数 | 必要なプロファイル | 供給元 | 未設定時の症状 |
|---|---|---|---|
| `GOOGLE_MAPS_ANDROID_SDK_KEY` | Android のビルド全般（**E2E の `preview` を含む**） | **クラウドビルド = EAS 環境変数（`preview` / secret）/ `--local`・ローカル = GitHub Secrets・`.env`**（SS-79。経路ごとに供給元は1つ）。実測: `development` 環境にも登録されている（2026-09-16 確認。`development` 節を参照） | ADR-007 は「地図が灰色のまま」と書いているが、**実際には Maps SDK 初期化時に RuntimeException でアプリがクラッシュする**（`mobile-e2e.yml` の SS-44 追補。google_apis イメージへの切り替えで判明） |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `AUTH_MODE=real` のビルド（`staging` / `staging-apk` / `staging-ios` / `production`） | EAS 環境変数 | サインイン時に `AuthError("configuration")` |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS の `AUTH_MODE=real` のビルド（`staging` / `staging-ios` / `production`） | EAS 環境変数 | 同上 |

### `GOOGLE_MAPS_ANDROID_SDK_KEY` の供給元は経路ごとに1つにする（SS-79 で決着）

**結論（SS-79）**: `GOOGLE_MAPS_ANDROID_SDK_KEY` は **EAS の `preview` 環境に `secret` visibility
で登録する**（クラウドビルド専用の供給元）。**GitHub Secrets（`ci-e2e` environment）は
`--local` 経路（E2E）用として維持する**。以前この節は「EAS 環境変数には一切載せない」という
決定だったが、クラウドビルド（`mobile-release-build.yml`）にはシェル環境変数を渡す手段が
無く、他に供給経路が無いため載せる必要がある。`secret` visibility は `eas build --local` では
解決されない（Expo 公式のローカルビルド文書）ため、E2E に EAS 側の値が流れ込む経路自体が
構造的に消え、「同じキーの供給元が 2 つになると CI が説明のつかない壊れ方をする」という
下記の懸念は「経路ごとに供給元 1 つ」という形で解消される。

以下は決定に至るまでの経緯（歴史として残す）。当初の決定文だった
「EAS の環境変数管理には一切載せない」は上記のとおり置き換えたが、経緯自体は無効になっていない。

1. **E2E は既にこのキーを受け取っており、しかも必須である。**
   `.github/workflows/mobile-e2e.yml` がビルドステップへ `secrets.GOOGLE_MAPS_ANDROID_SDK_KEY`
   を渡している。未注入だと Maps SDK 初期化時のクラッシュで walk-start 系の Maestro フローが
   軒並み失敗する（SS-44 追補）。「E2E は地図を assert しないから無くてよい」ではない。
2. **EAS 保管の非 secret 変数はローカルビルドでも読まれる。**
   Expo 公式のローカルビルド文書は「'Secret' visibility の EAS 環境変数はローカルでは非対応
   （ローカル環境に設定すること）」としており、裏返すと `plaintext` / `sensitive` は
   `eas build --local` でも解決される。E2E はこのローカルビルドを使っている。
3. **シェル環境変数と EAS 保管値の優先順位は公式ドキュメントに記載が無い。**
   Overview / Usage / FAQ / local-builds のいずれにも明示が無く、未定義かつ未検証である。

この 3 つが重なると、**`preview` 環境にキーを登録した瞬間、CI が渡している GitHub Secrets の値が
黙って置き換わりうる**。しかも `eas.json` にもワークフローにも差分が無いため、
git を見ても原因に辿り着けない。

> **訂正（SS-81 / SS-85, 2026-09-12）: 上の懸念のうち「署名鍵が違うので E2E が壊れる」部分は誤り。**
>
> 以前ここには、この危険が現実化する筋道として
> 「Maps SDK のキーは署名鍵ごとの SHA-1 で制限するのが正しい運用（ADR-001）なので、
> 配布用署名鍵の SHA-1 だけに絞ったキーが **E2E の APK（ランナー上で `eas build --local` が
> 生成する署名鍵で署名される）** に適用されると、Maps SDK の初期化で落ちて E2E が全面的に
> 失敗する」と書かれていた。**括弧内が事実と異なる。**
>
> `eas build --local` は**ランナー上で署名鍵を生成しない**。ビルドログに
> `✔ Using remote Android credentials (Expo server)` /
> `✔ Using Keystore from configuration: build-credential-ci (default)` と出るとおり、
> **Expo サーバーの既定クレデンシャルを取得して使う**（SS-81 でビルドログから確認）。
> つまり **E2E / `staging-apk` / クラウドビルドはすべて同一の署名鍵 `build-credential-ci`**
> （SHA-1 `D8:27:FB:D7:A5:83:77:AB:11:2E:96:07:80:45:DC:B1:9F:8A:2F:99`）で署名される。
>
> 署名鍵が同一である以上、**「配布用鍵の SHA-1 に絞ったキーが E2E の APK で弾かれる」
> シナリオは構造上起こり得ない。**
>
> **ただし EAS 上にはビルドクレデンシャルが 2 つある**（`eas credentials -p android` で確認）。
>
> | 構成名 | SHA-1 | 既定 |
> |---|---|---|
> | `build-credential-ci` | `D8:27:FB:D7:A5:83:77:AB:11:2E:96:07:80:45:DC:B1:9F:8A:2F:99` | **Default** |
> | `Build Credentials BwyovfzIez` | `2D:FB:85:AC:6E:CD:52:1C:4B:E4:72:16:77:F5:D0:CE:18:5C:77:E3` | — |
>
> **EAS 側で Default を切り替えると、上の「全ビルドが同一鍵」という前提が崩れる。**
> Google Maps と Google サインインに登録済みの SHA-1 は `D8:27:...:99` の側だけなので、
> 切り替えた瞬間に**地図タイルが表示されなくなり、サインインも失敗する**（**訂正
> [2026-09-13, SS-79]**: 以前ここには「地図の初期化クラッシュ」と書かれていたが誤り。
> Google Maps SDK の仕様上、SHA-1 / package の不一致は**認証エラーで地図タイルが
> 表示されないだけ**で、アプリは落ちない。実際にクラッシュするのは APK にキー自体が
> 未注入のとき。詳細は下記「アプリ識別子の定義」および `packages/mobile/adr/ADR-004` の
> SS-79 追補を参照）。しかもリポジトリには一切差分が出ないため、git からは原因に
> 辿り着けない。**既定構成は変更しないこと。**

> **訂正（2026-09-13, SS-79）: 上の「同一の署名鍵」「登録済み SHA-1」はどちらも
> `com.sanposcape.app`（本番識別子）についての記述で、SS-81 時点のものである。**
> SS-79 でアプリ識別子を分割した結果、**E2E（`preview`）/ `staging-apk` / クラウドビルドは
> いずれも開発識別子 `com.sanposcape.app.dev` でビルドされる**ようになり、既定クレデンシャルも
> 新しく生成した鍵（SHA-1 `83:1C:84:C2:4D:1D:6E:99:13:B4:4A:CA:71:05:3B:B2:3D:00:B5:9E`）に
> 切り替わった。**「全経路が同一鍵を使う」という構造上の結論自体は変わっていない**
> （鍵の実値と、それが結びつく識別子が変わっただけ）。GCP 側の登録も本番の組
> （`com.sanposcape.app` + `D8:27:...:99`）から開発の組
> （`com.sanposcape.app.dev` + `83:1C:...:9E`）へ切り替えている。詳細・実測値は下記
> 「アプリ識別子の定義」の表を参照。

> **実測（SS-85, 2026-09-12 / run 34666684963）: 上の 2. は確定、3. は半分だけ埋まった。**
>
> `GOOGLE_MAPS_ANDROID_SDK_KEY` は 2026-09-08 に EAS の `preview` 環境へ登録済みで、
> この run は**それ以降はじめて完走した E2E** だった。ビルドログに次が出る。
>
> ```
> Environment variables with visibility "Plain text" and "Sensitive" loaded from the
> "preview" environment on EAS: EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
> EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, GOOGLE_MAPS_ANDROID_SDK_KEY.
> ```
>
> - **2.「EAS 保管の非 secret 変数はローカルビルドでも読まれる」は確定した**
>   （公式ドキュメントからの推測ではなくなった）。
> - **その状態で maps-required を含む 9 フローすべてが通った。** 未注入・誤キーなら
>   Maps SDK 初期化時の `RuntimeException` でクラッシュするので、APK に有効なキーが
>   入っていたことは確認できている。**懸念された「説明のつかない壊れ方」は起きなかった。**
> - **3. の優先順位そのものは依然として未確定。** 両方が同値（または同じ SHA-1 制限のキー）
>   なら結果は変わらないため、この成功は優先順位を決めない。片方だけ意図的に別の値にした
>   比較でしか決まらない。（→ **SS-79 で「EAS が勝つ」と実測した。** 下記「実測結果（8-2, SS-79）」）
>
> なお、この節はかつて見出しと実態が食い違っていた（「載せない」と書いてあるが既に載っている）。
> **SS-79 でこの食い違いを解消した**（上記「結論（SS-79）」を参照）。

**実測結果（8-2, SS-79）— シェル環境変数と EAS 保管値のどちらが勝つか**:

> **実測（2026-09-14, eas-cli 21.0.2、visibility は `sensitive` の状態で測定）: EAS の値が勝つ。**
>
> シェル環境変数に目印の値 `SENTINEL-SHELL` を入れ、EAS の `preview` 環境を読み込んで実行した。
>
> 1. `GOOGLE_MAPS_ANDROID_SDK_KEY=SENTINEL-SHELL eas env:exec preview 'node -e "console.log(process.env.GOOGLE_MAPS_ANDROID_SDK_KEY)"'`
>    → **EAS に保管された実キー**が表示された。
> 2. 同じ条件で `npx expo config --type prebuild --json` を実行し、`app.config.ts` が注入する
>    `android.config.googleMaps.apiKey` を確認 → **EAS に保管された実キー**だった。
>    （`eas env:exec` は自身のログを標準出力に出すので、`expo config` の出力はファイルに書き出してから
>    `jq` で読む。パイプで直接 `jq` に渡すと `parse error` になる）
>
> - **上の 3.（優先順位）は「EAS が勝つ」で確定した。** つまり `plaintext` / `sensitive` のままだと、
>   `--local` のビルドで CI が GitHub Secrets から渡した値が **EAS の値に黙って上書きされる**。
>   SS-85 の E2E が通っていたのは、両方に同じキーが入っていたからにすぎない。
> - この結果は `secret` にする判断（上記「結論（SS-79）」）の根拠を補強する。`secret` は
>   `--local` で解決されないので、E2E には EAS の値が流れ込まず、優先順位に依存しなくなる。
> - 測定は `eas env:exec` によるもので、`eas build --local` そのものでの測定ではない。
>   `eas build --local` での挙動は、`secret` 化後の E2E のビルドログで確認する（下記）。
> - CI（`mobile-release-build.yml` の `npx eas-cli`）は最新版を使うため、手元の版（21.0.2）と
>   異なる。eas-cli の版で優先順位が変わる可能性はゼロではない。

**visibility の `secret` への変更（8-2, SS-79）— 2026-09-14 実施済み**:

> EAS の `preview` 環境の `GOOGLE_MAPS_ANDROID_SDK_KEY` を `sensitive` から **`secret`** に変更した
> （ユーザー作業。変更前に値を控えてある）。これで「供給元は経路ごとに1つ」という本節の結論が
> 設定に反映された:
>
> - クラウドビルド（`staging` / `staging-apk`）→ EAS の `secret`
> - `--local` のビルド（E2E の `preview`）→ GitHub Secrets（`ci-e2e` environment）
>
> **`secret` にした値は EAS の画面でも CLI でも読み出せない。** キーを差し替える場合は
> GCP で新しいキーを作り、EAS と GitHub Secrets の**両方**を更新すること（片方だけ更新すると、
> 経路によって別のキーでビルドされる）。
>
> **E2E での確認（2026-09-14 / run 34769324144、ブランチ `tri-star/SS-79`）: OK。**
> APK キャッシュはミスし、変更を含む APK をフルビルドした。ビルドログで次を確認した。
>
> ```
> Environment variables with visibility "Plain text" and "Sensitive" loaded from the
> "preview" environment on EAS: EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
> ✔ Using Keystore from configuration: build-credentials-ci2 (default)
> ```
>
> - **`GOOGLE_MAPS_ANDROID_SDK_KEY` が EAS から読み込まれていない。** `eas build --local` でも
>   `secret` は解決されないことを、`env:exec` の測定ではなく実際のビルドで確認できた。
> - 署名鍵は開発用識別子の既定 `build-credentials-ci2`（本番識別子の `build-credential-ci` ではない）。
> - **9/9 Flows Passed。** 地図画面のフローもクラッシュしていないので、GitHub Secrets（`ci-e2e`）から
>   キーが注入されている。ただし E2E は地図タイルを検証しないので、GCP のアプリ制限の登録は
>   配布ビルドの実機確認で見る（上記「アプリ識別子の定義」）。

### なぜ mobile 側にもクライアント ID が要るのか

backend が Google と直接やり取りする構成（confidential client）は、モバイルでは
[ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) 決定1 により採っていない。
**アプリがネイティブに Google ID token を取り、それを `POST /auth/session` へ渡して
自前トークンに交換する**流れなので、ID token を取る 1 回のためにアプリ側にもクライアント ID が要る。

`client_secret` は使わない（public client）ため、クライアント ID 自体は秘密情報ではない。

> **訂正（SS-81, 2026-09-12）: `aud` は必ずしも Web クライアント ID ではない。**
> 以前ここには「`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` が `aud` に使う値で、backend の
> `GOOGLE_ALLOWED_AUDIENCES` と同じ値を共有する」と書かれていたが、**iOS では `aud` が
> iOS クライアント ID になる**。`backend` の `.env.example` と `config.py` のコメントが正しい
> （`Android=Web ID / iOS=iOS ID`）。
>
> そのため backend 側の許可リストには **Web / iOS の両方のクライアント ID をカンマ区切りで**
> 設定する必要がある。片方しか無いと、そのプラットフォームだけが `InvalidAudienceError` で
> 401 になり、アプリ側には原因の分からない汎用メッセージしか出ない（SS-82 / SS-84）。
>
> AWS 環境では Secrets Manager のキー **`google_oauth_client_id`**（単数形だが複数値）が
> 環境変数 `GOOGLE_ALLOWED_AUDIENCES` へ写される（`core/runtime_config.py` の
> `SECRET_KEY_TO_ENV`）。この命名の紛らわしさは SS-84 で扱う。

### 登録手順

環境ごとに登録する。dev の GCP プロジェクトの値は **`preview`** 環境へ入れる
（`staging` / `staging-apk` / `staging-ios` がこの環境を読む）。

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

## 配布手順（SS-79 で確定）

- **Android**: `.github/workflows/mobile-release-build.yml` を `platform=android` でディスパッチ
  → ジョブサマリに出る `BUILD_ID` を控え、expo.dev のプロジェクト（メンバーのみ閲覧可）の
  ビルド一覧から該当ビルドを開いてインストールする。
- **iOS**: `platform=ios` でディスパッチ → ビルド後 `eas submit`（`submit_ios: true` が既定）で
  TestFlight の内部テスターへ配布される。
- **配布ビルド前に `app.json` の `ios.buildNumber` / `android.versionCode` を上げる PR を出すこと。**
  `autoIncrement` を外した（下記「`autoIncrement` について」）ため、これらの値は CI が自動では
  進めない。同じ `buildNumber` の IPA は App Store Connect が受け付けない。
- **配布リンク（internal distribution のページ）は認証不要なので、URL を知っていれば誰でも
  インストールできる。** このリポジトリは public リポジトリのため、`mobile-release-build.yml`
  の Job Summary / Actions ログには配布ページ・ビルドページの URL を一切出力しない
  （`BUILD_ID` のみ）。共有するときも Slack 等の限定チャンネルに留め、public な場所に
  貼らないこと。**`staging-apk`（Android internal distribution）と `staging-ios`（iOS Ad Hoc /
  TestFlight 手前のビルド）の両方に適用する。**
- `production` プロファイルには `autoIncrement: true` が残っている。`production` を使い始める際に
  同じ判断（下記）が必要になる（SS-80 Phase 4）。
- **`ascAppId` / `appleTeamId` は `eas.json` の `submit.staging.ios` にコミット済み**（dev 用
  App Store Connect アプリレコードの値。秘密情報ではない）。App Store Connect API Key は
  GitHub Secrets に置かず EAS 側に保管させている（`docs/adr/ADR-004` の SS-79 追補）。

### `autoIncrement` について

`eas.json` の `build.staging` から `"autoIncrement": true` を削除し、`app.json` に
`ios.buildNumber` / `android.versionCode` を明示する運用にした（SS-79）。バージョンの
引き上げは配布ビルド前の PR で行う。

- **理由**: `cli.appVersionSource: "local"` では EAS CLI がバージョンをローカルへ書き戻すが、
  CI のランナーはビルド後に破棄されるため書き戻しが失われ、次回も同じ `buildNumber` で
  ビルドされて App Store Connect に弾かれる。commit して戻すには CI に `contents: write` と
  push 処理が必要で、`workflow_dispatch` の単純さと引き換えにするには重い。加えて
  `app.config.ts`（動的コンフィグ）併用下での書き戻しは未検証で、非対話ビルドで失敗すると
  EAS の枠を 1 回消費してから発覚する。
- `staging-apk` / `staging-ios` の `"autoIncrement": false` は、`extends` 元から継承しないことを
  明示する記述なのでそのまま残してある。
- **`production` の `autoIncrement: true` は本課題のスコープ外で残っている。** `production` を
  使い始める際は同じ検討（`autoIncrement` を外して `app.json` に静的な値を持たせる）が必要
  （SS-80 Phase 4 が同じ方針を採る予定）。
- 初期値は `buildNumber: "1"` / `versionCode: 1` でよい（開発識別子は新しいアプリレコード /
  新しいパッケージになるため既存の番号と衝突しない）。**以後は値を後退させないこと。**

## 一時障害の再送（SS-79）

dev の実運用上の制約（infra 照会）:

- API Lambda の `ReservedConcurrentExecutions: 5`（6 本目から 429）
- CloudFront のオリジン待ち 30 秒（超過で 504）
- コールドスタート 1〜3 秒

に対して、`src/api/transientRetry.ts` が **GET / HEAD のみ**指数バックオフで再送する
（429 / 502 / 503 / 504 / 通信断が対象。500 とその他の 4xx は対象外）。`src/api/client.ts`
の `customFetch` に結線してあり、401 → refresh → 1 回だけ再送（`retryPolicy.ts`）とは
独立した軸として両方効く。

POST を対象に含めない理由（`/explore/*` 自身のレート制限を悪化させる・`useWalkSave` の
既存バックオフと重複する・`/auth/refresh` の再送がセッションを強制失効させる）は
`transientRetry.ts` の JSDoc に詳しく書いてある。`src/services/auth/authApi.ts` は
`customFetch` を通らない独立した出口であり、意図的にこの再送を入れていない。

## アプリ識別子の定義（SSoT）

本ドキュメントを識別子の SSoT とする（SS-79 で本番/開発に分割した）。

| 区分 | 対象プロファイル | 識別子（iOS / Android 共通） | scheme | アプリ名 |
|---|---|---|---|---|
| 開発用 | `development` / `preview`(E2E) / `staging` / `staging-apk` / `staging-ios` | `com.sanposcape.app.dev` | `sanposcape-dev` | `sanposcape (Dev)` |
| 本番 | `production` | `com.sanposcape.app` | `sanposcape` | `sanposcape` |

- **値の出どころ**: 開発用 = `app.json` の実値、本番 = `app.config.ts` の `PRODUCTION_VARIANT`
  定数（`APP_VARIANT=production` のときだけ適用）。app.json に開発用の実値を置いているのは、
  `scripts/mobile-tools/lib/common.sh` が app.json を grep して `APP_ID` / `APP_SCHEME` を
  決めるため。この向きなら `app.config.ts` の分岐を書き忘れても開発用に落ちるだけで済む。
- **識別子ごとに別セットになるもの**: EAS の Android キーストア / iOS プロビジョニング
  プロファイル、Google Maps キーのアプリ制限（package + SHA-1 の組）、Google サインインの
  Android OAuth クライアント（package + SHA-1 の組ごとに 1 つ）、iOS OAuth クライアント
  （bundle ID ごと）、App Store Connect のアプリレコード。
- **本番識別子に対して `eas credentials` / `eas submit` を手元で実行するときは、
  シェルでも `APP_VARIANT=production` を付けること。** 付けないと dev 識別子のクレデンシャルを
  操作してしまう。
- **識別子を変えるときに洗い出す grep**:
  ```bash
  git grep -nE 'com\.sanposcape\.app|sanposcape(-dev)?://' -- ':!*.lock'
  ```
  残ってよいのは `app.config.ts` の `PRODUCTION_VARIANT`、`eas.json` 周辺の説明、ADR の
  過去の記録、本番側の値を説明する docs の表だけ。
- **署名鍵の実測値**（EAS で生成済み。7-F, 2026-09-13）:

  | 識別子 | 構成名 | SHA-1 | 既定 |
  |---|---|---|---|
  | `com.sanposcape.app`（本番） | `build-credential-ci` | `D8:27:FB:D7:A5:83:77:AB:11:2E:96:07:80:45:DC:B1:9F:8A:2F:99` | Default |
  | `com.sanposcape.app.dev`（開発） | `build-credentials-ci2`（EAS が生成した新規 Keystore） | `83:1C:84:C2:4D:1D:6E:99:13:B4:4A:CA:71:05:3B:B2:3D:00:B5:9E` | Default |

  **既定ビルドクレデンシャルを識別子ごとに切り替えないこと。** 本番識別子側の
  `build-credential-ci` を切り替えると、Google Maps / Google サインインの登録と SHA-1 が
  合わなくなる。

- **GCP（開発用プロジェクト `647949159303`）の登録は、本番の組から開発の組へ「上書き」した**
  （プランは「残して追加」だったが、ユーザー判断で上書き。本番は別 GCP プロジェクトで
  登録し直す想定）。Maps キーのアプリ制限と Android OAuth クライアントは
  `com.sanposcape.app` + `D8:27:...:99` ではなく `com.sanposcape.app.dev` + `83:1C:...:9E` の
  組だけが登録されている（**開発用 GCP プロジェクトに本番識別子の登録は無い**）。
  影響: 端末に残る `com.sanposcape.app` の Android ビルド（development build / SS-81 の
  `staging-apk`）は地図が表示されずサインインもできなくなるため、開発用識別子のビルドで
  入れ直すこと。

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

**証明書のピン留めは行っていない**（SS-79 で確認）。pinning ライブラリの依存はなく、
`app.config.ts` は `usesCleartextTraffic` の切り替えのみで `network_security_config` の
`pin-set` は注入せず、`src/api/client.ts` と `src/services/auth/authApi.ts` は素の `fetch`
を使っている。ACM の自動更新で証明書が差し替わるため（infra Q6）、**今後も入れないこと**。

## 関連

- [ADR-002: 認証は Google 直結 + モバイル public client](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md)（決定1）
- [ADR-003: development build と開発ループ](../adr/ADR-003-development-build-and-dev-loop.md)
- [ADR-004: E2E ビルド・CI 戦略](../adr/ADR-004-e2e-build-ci-strategy.md)
- [ADR-007: Expo 設定と Maps キーの注入](../adr/ADR-007-expo-config-and-maps-key-injection.md)
- [ADR-005: backend のサーバーレスデプロイ](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md)（決定4 / 決定6）
- [ADR-006: mobile アプリの配信は EAS に委ねる](../../../docs/adr/ADR-006-mobile-app-delivery-eas-hosted.md)（`channel` が対応する EAS Update の配信面）
- [backend デプロイ手順](../../backend/docs/deployment.md) §6.2
