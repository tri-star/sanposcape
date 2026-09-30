# ADR-007: Expo 設定は `app.json` + `app.config.ts` の併用とし、Maps SDK キーは環境変数から注入する

## 現在有効な決定（要約）

> 最終更新: 2026-10-01（SS-148）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
> 本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- 静的な設定は `app.json`、動的な部分だけを `app.config.ts` で拡張する。（本文: 決定）
- Maps SDK キーは `GOOGLE_MAPS_ANDROID_SDK_KEY` から `android.config.googleMaps.apiKey` へ注入する。`EXPO_PUBLIC_` は付けず、
  未設定なら `android.config` を付けない。iOS は Apple Maps でキー不要。`react-native-maps` の config plugin は併用しない。（本文: 決定）
- キーの供給元は経路ごとに1つにする。クラウドビルドは EAS の `preview` 環境に `secret`、`--local`（E2E）は GitHub Secrets（`ci-e2e`）。
  `plaintext` / `sensitive` に戻さない。（本文: 決定、SS-79 追補）
- キーが APK に無いと Maps SDK の初期化でクラッシュする（E2E に必須）。SHA-1 / package の不一致では地図が出ないだけ。
  （本文: 影響、SS-78 追補、SS-79 追補）
- `app.config.ts` は `mobile-e2e.yml` のネイティブ変更トリガと `oxfmt` の対象に含める。（本文: 決定）
- `predictiveBackGestureEnabled: false` は `useScreenBack` の前提。（本文: 決定、SS-34 追補）
- `APP_VARIANT=production` のときだけ本番の識別子・scheme・アプリ名・Google サインインの `iosUrlScheme` に上書きし、
  未知の値は `expo config` の評価時に throw する。（本文: SS-79 追補、2026-09-30 追補）
- `eas credentials` の既定クレデンシャルを識別子ごとに切り替えない。（本文: SS-79 追補）
- `app.config.ts` は `extra.appVariant` を常に公開し、開発ツールの表示可否は `isDevToolsEnabled()`
  （`__DEV__` / `extra.appVariant` / `Updates.channel`）だけで判定する。未知は非表示。（本文: SS-148 追補）
- 開発ツールのコードは本番バンドルから除外しない。（本文: SS-148 追補）
- `eas.json` の store 配布プロファイルは、許可リスト（`staging`）を除き `APP_VARIANT=production` と production チャネルの両方を持つことを
  契約テストで守る。`src/config/devTools.ts` は純粋な層から import しない（oxlint で禁止）。（本文: SS-148 追補）

### 未解決・持ち越し

- iOS で Google Maps を使う場合のキー注入。（本文: 移行・対応事項）
- OTA の update 時の環境変数の供給（SS-103）。（本文: SS-148 追補）

### 変更・撤回された決定

- 「EAS の環境変数管理には載せない」→「preview に secret」（SS-79）
- 「キー未注入は地図が灰色」→「クラッシュ」（SS-78）
- 「SHA-1 不一致でクラッシュ」→「表示されないだけ」（SS-79）

## 日付

2026-07-30（初版 / SS-15）、2026-08-05 追補（SS-34）、2026-09-11 追補（SS-78）、
2026-09-13 追補（SS-79）、2026-09-30 追補（本番用 iOS OAuth クライアント）、
2026-10-01 追補（SS-148。実行時のビルド variant 判定）

## ステータス

採用（SS-15）。[ADR-002](./ADR-002-mobile-tech-stack.md) の「移行・対応が必要な事項」にあった「Google Maps の API キー設定は M4 で `app.json` に結線する」という予定を**置き換える**。

**SS-34「画面の『戻る』導線」で追補**した（`android.predictiveBackGestureEnabled: false` が
`useScreenBack` の前提になっていることを「決定」に明記した）。追補部分には `（SS-34 追補）` を付けている。

**SS-78「mobile: EAS ビルドが既定で CloudFront の backend を向くようにする」で追補**した。
EAS 側の供給経路について「**EAS の環境変数管理には載せない**」を決定として明記し、あわせて
初版が前提としていた「**キーが無い環境でもビルドと E2E が通る**」「**未注入の症状は地図が灰色**」
という**事実誤りを訂正**した（実際は Maps SDK 初期化時にクラッシュする）。
追補部分には `（SS-78 追補）` を付けている。

**SS-79「ストア公開前の配布経路を整え、GitHub Actions から配布ビルドを実行できるようにする」で
追補**した。SS-78 の決定「**EAS の環境変数管理には載せない**」を**覆し**、「EAS の `preview`
環境に `secret` visibility で載せる（`--local` 経路の供給元は GitHub Secrets のまま維持する）」
に更新した。あわせて `app.config.ts` の責務に `APP_VARIANT` による本番 variant の識別子上書きが
加わったことを記録した。追補部分には `（SS-79 追補）` を付けている。

**SS-148「mobile: アカウントタブ」で追補**した。画面カタログを staging（TestFlight）でも開けるようにするため、
`app.config.ts` が `extra.appVariant` を公開し、実行時にビルドの種類を判別して開発ツールの表示可否を決める。
追補部分には `（SS-148 追補）` を付けている。

## コンテキスト

Android で `react-native-maps` の地図タイルを描画するには、Maps SDK for Android のキーが
ネイティブ設定 `android.config.googleMaps.apiKey` として必要になる。

- [横断 ADR-001](../../../docs/adr/ADR-001-map-poi-google-maps-platform.md) で、**mobile の SDK key と
  backend の Places/Routes 用 server key は別のキーにする**ことが決まっている。
- キーは**リポジトリにコミットできない**。一方 `app.json` は静的な JSON なので値を書くしかない。
- `/ios` と `/android` は gitignore しており、ネイティブプロジェクトは CNG（Continuous Native
  Generation）で生成する前提になっている（[ADR-003](./ADR-003-development-build-and-dev-loop.md)）。
- `react-native-maps` に同梱されている config plugin は、**キーのプロパティを指定しないと
  manifest からキー設定を削除する**実装になっているため、部分的な併用ができない。

## 決定

- **静的な設定は `app.json` に残し、動的（＝秘密情報を含む）部分だけを `app.config.ts` で拡張する。**
  `app.json` の全面廃止はしない。
- `app.config.ts` は `ConfigContext` を受け取り、環境変数 `GOOGLE_MAPS_ANDROID_SDK_KEY` を
  `android.config.googleMaps.apiKey` へ注入する。
- 環境変数名に **`EXPO_PUBLIC_` 接頭辞は付けない**。`app.config.ts` は Node 側（ビルド時）で
  評価されるため `EXPO_PUBLIC_` は不要であり、付けると JS バンドルにキーが inline されてしまう。
- **キーが未設定のときは `android.config` 自体を付けない**（空文字のキーを渡さない）。
  この場合アプリは起動・動作するが Android の地図は灰色のまま描画されない。
- iOS は `MapView` の `provider` を指定せず既定の Apple Maps を使うため、キーは不要とする。
- `react-native-maps` の config plugin は併用しない（上記のキー削除挙動があるため）。
- `.env` が有効なのは**ローカル実行時のみ**（`expo start` / `expo prebuild` / `expo config`）。
  **EAS Build では `.env` がビルドコンテキストに載らない**ため、EAS の環境変数
  （`eas env:create`）か `eas build --local` のシェル環境変数で注入する運用とする。
- ~~**（SS-78 追補）このキーは EAS の環境変数管理（`eas env:create`）には載せない。**~~
  **（SS-79 追補で更新）** EAS の `preview` 環境に **`secret` visibility** で載せる。
  ただし **`--local` の経路（E2E）の供給元は GitHub Secrets（`ci-e2e` environment）のまま
  維持する**。詳細は下記「SS-79 追補: EAS 環境変数へ載せる決定に更新する」。
  他の `EXPO_PUBLIC_*`（Google OAuth のクライアント ID 等）は EAS 環境変数（`plaintext`）を
  使ってよく、**このキーだけ `secret` visibility にする**という例外がある。
  ビルドプロファイルごとの供給経路の一覧は
  [ビルドプロファイルと環境変数](../docs/build-profiles.md) に集約した。
- `app.config.ts` はネイティブ設定に影響するため、
  **`.github/workflows/mobile-e2e.yml` のネイティブ変更トリガ（`paths`）と `oxfmt` の対象に含める。**
- （SS-34 追補）`app.json` の `expo.android.predictiveBackGestureEnabled: false` は、画面の「戻る」導線
  （`src/hooks/useScreenBack.ts`）が Android の `hardwareBackPress` イベントを直接ハンドルする方式の
  前提になっている。`true` に変更する場合は predictive back（ジェスチャーで戻る）に切り替わり
  `hardwareBackPress` で `true` を返して既定動作を止める方式が効かなくなるため、
  [pages-components-guideline](../docs/pages-components-guideline.md) の「画面の『戻る』導線の規約」と
  `useScreenBack` 自体の見直しが必要。

## 検討した選択肢

### 選択肢1: `app.json` にキーを直書きする

ADR-002 時点の想定。設定が1ファイルで完結して分かりやすいが、**キーがリポジトリに入る**ため
却下（ADR-001 のキー分離方針とも整合しない）。

### 選択肢2: `app.json` + `app.config.ts` の併用（採用）

差分が最小で、既存の plugin 設定（`expo-location` / `react-native-nitro-google-signin` など）は
JSON のままレビューできる。動的な部分だけが TypeScript になる。

### 選択肢3: `app.json` を廃止して `app.config.ts` へ全面移行する

Expo の標準的な構成の一つで、すべての設定を1ファイルで型付きに扱える。ただし既存の
`app.json`（plugin 設定を含む）をすべて TypeScript へ書き換える差分が大きく、
SS-15 の目的（地図表示）に対して変更範囲が不釣り合いなため却下。

## 決定理由

- キーをコミットしないという制約から選択肢1 は成立しない。
- 選択肢3 は将来的にあり得るが、いま全面移行してもキー注入の課題は選択肢2 と同じ方法で解くことになる。
  差分の小ささとレビュー性を優先した。
- 「キー未設定なら `android.config` を付けない」は、キーが無い環境（CI の E2E、キー未取得の開発者）で
  **ビルドを壊さずに地図だけ灰色になる**という劣化の仕方を選ぶための決定。E2E が地図描画を
  assert しない方針（[ADR-004](./ADR-004-e2e-build-ci-strategy.md)）と対になっている。

## SS-78 追補: 供給元を 2 つにしない（**SS-79 追補で「載せない」から「経路ごとに1つ」に更新**）

`GOOGLE_MAPS_ANDROID_SDK_KEY` を EAS の環境変数管理へ載せない理由は、**CI が
「差分を見ても原因に辿り着けない壊れ方」をするため**である。次の 3 つが重なる。

1. **EAS 保管の非 secret 変数は `eas build --local` でも解決される。**
   Expo 公式のローカルビルド文書は「'Secret' visibility の EAS 環境変数はローカルでは非対応
   （ローカル環境に設定すること）」としており、裏返すと `plaintext` / `sensitive` は読まれる。
   E2E（`.github/workflows/mobile-e2e.yml`）はこのローカルビルドを使っている。
2. **シェル環境変数と EAS 保管値の優先順位は Expo 公式ドキュメントに記載が無い。**
   Overview / Usage / FAQ / local-builds のいずれにも明示が無く、未定義かつ未検証である。
3. **キーはパッケージ名 + 署名鍵ごとの SHA-1 で制限する**（下記「移行・対応が必要な事項」）。

配布用の署名鍵に絞ったキーを EAS の `preview` 環境へ登録すると、E2E の APK
（ランナー上で `eas build --local` が生成する署名鍵で署名される）に別のキーが適用されうる。
その場合 Maps SDK の初期化で落ちて **E2E が全面的に失敗する**が、`eas.json` にもワークフローにも
差分が無いため git から原因に辿り着けない。EAS 側の設定変更だけで CI が壊れる経路を作らない。

EAS 側へ寄せる判断をする場合は、**先にシェル環境変数と EAS 保管値のどちらが勝つかを実測する**こと。

## 影響

### ポジティブな影響

- Maps SDK キーがリポジトリにも JS バンドルにも入らない。
- backend の server key と mobile の SDK key が構成上も分離される（ADR-001 の実装）。
- ~~キーが無い環境でもビルドと E2E が通る。~~
  （**SS-78 追補: これは誤り。** ビルドは通るが **E2E は通らない**。SS-44 で
  google_apis イメージへ切り替えた際に、キー未注入だと **Maps SDK 初期化時の RuntimeException で
  アプリがクラッシュ**し、walk-start 系の Maestro フローが軒並み失敗することが判明している
  —— `mobile-e2e.yml` のビルドステップのコメント参照。現在は `ci-e2e` environment の
  secret から注入しており、**E2E にとってこのキーは必須**である）

### ネガティブな影響・トレードオフ

- 設定が `app.json` と `app.config.ts` の2箇所に分かれる。どちらを見ればよいか迷いうるため、
  `app.config.ts` の JSDoc と [local-env](../docs/local-env.md) に役割分担を書く。
- **キー未注入の失敗が「地図が灰色」という静かな症状**になるため気付きにくい。
  `expo config --type prebuild` での確認手順と、リリース前チェックリストで補う。
  （**SS-78 追補: 症状の見立てが誤っていた。** 静かに灰色になるのではなく
  **Maps SDK 初期化時の RuntimeException でアプリが落ちる**。気付きにくさは解消される一方、
  「キーが無くても他の機能は確認できる」という前提は成り立たない）
- ローカル（`.env`）と EAS（EAS 環境変数）で注入経路が異なる。手順書に明記して運用でカバーする。

### 移行・対応が必要な事項

- Maps キーの注入と `expo-location` の追加により `@expo/fingerprint` が変化するため、
  development build の作り直しと、E2E の APK キャッシュの1回ミスが発生する。
- Android のキーにはアプリ制限（パッケージ名 + 署名鍵ごとの SHA-1）を設定する。
  必要な鍵の種類は Google サインインと同じ4種（[local-env](../docs/local-env.md) の表を参照）。
- iOS で Google Maps を使いたくなった場合（`provider={PROVIDER_GOOGLE}`）は、
  iOS 用の Maps キーと `ios.config.googleMapsApiKey` の注入をこの `app.config.ts` に追加する。

## SS-79 追補: EAS 環境変数へ載せる決定に更新する

### 決定の更新

`GOOGLE_MAPS_ANDROID_SDK_KEY` を **EAS の `preview` 環境に `secret` visibility で載せる**。
`--local` の経路（`.github/workflows/mobile-e2e.yml`）の供給元は **GitHub Secrets
（`ci-e2e` environment）のまま維持する**。

> **実施（2026-09-14）**: `secret` visibility への変更を実施した（ユーザー作業）。
> 変更の前に、`sensitive` の状態でシェル環境変数と EAS 保管値の優先順位を実測し、
> **EAS の値が勝つ**ことを確認した（`eas env:exec` と、それ経由の `expo config --type prebuild`
> の両方で。eas-cli 21.0.2）。つまり `sensitive` のままでは、`--local` の E2E で GitHub Secrets の
> 値が EAS の値に黙って上書きされる経路が実在した。`eas build --local` そのものでの確認は、
> `secret` 化後の E2E のビルドログで行う。記録は [build-profiles.md](../docs/build-profiles.md) の実測欄を参照。

### 覆した理由（SS-78 追補が挙げた 3 つの根拠が、それぞれ解消/無効化された）

1. 根拠 3.「配布用鍵の SHA-1 に絞ったキーが E2E の APK で弾かれる」は **SS-81 で事実誤認と
   判明した**。`eas build --local` はランナーで鍵を生成せず、E2E / `staging-apk` / クラウド
   ビルドはすべて同一の既定クレデンシャルで署名される（SS-81 時点では `build-credential-ci`）。
   署名鍵が同一である以上このシナリオは起こり得ない。
   **（訂正・本追補時点）**: SS-79 のアプリ識別子分割により、E2E / `staging-apk` / クラウド
   ビルドは開発識別子 `com.sanposcape.app.dev` の新しい既定クレデンシャル（SHA-1
   `83:1C:84:C2:4D:1D:6E:99:13:B4:4A:CA:71:05:3B:B2:3D:00:B5:9E`）に切り替わっている。
   「全経路が同一鍵」という構造上の結論は変わらない。詳細は
   [build-profiles.md](../docs/build-profiles.md) の「アプリ識別子の定義」を参照。
2. 根拠 1.「EAS 保管の非 secret 変数はローカルビルドでも読まれる」は **SS-85 の
   run 34666684963 で確定**したが、`secret` visibility はローカルビルドで**解決されない**
   ことが公式に明記されている。したがって `secret` を選べば衝突経路そのものが消える。
3. 根拠 2.「シェル環境変数と EAS 保管値の優先順位が未定義」は、`secret` 化により
   **そもそも両方が同時に存在しない**状態になるため、優先順位に依存しなくなる。
   実測では優先順位は**「EAS が勝つ」**だった（2026-09-14。`packages/mobile/docs/build-profiles.md`
   の実測欄）。`sensitive` のままなら E2E の値が黙って置き換わる経路が実在したことになり、
   `secret` を選ぶ理由はむしろ強まった。

**クラウドビルド（`mobile-release-build.yml`）には他に供給手段が無い**（シェル環境変数を
渡せない）ため、載せない限り配布ビルドの地図がクラッシュする。

### やってはいけないこと

この変数の visibility を `plaintext` / `sensitive` に戻すこと。戻すと `--local` でも解決され、
GitHub Secrets と二重供給になって「差分を見ても原因に辿り着けない壊れ方」が復活する
（SS-78 追補が警告していた状態そのもの）。

### `eas credentials` の既定クレデンシャルを識別子ごとに切り替えないこと

本番識別子 `com.sanposcape.app` 側は `build-credential-ci`（SHA-1
`D8:27:FB:D7:A5:83:77:AB:11:2E:96:07:80:45:DC:B1:9F:8A:2F:99`）が既定、開発識別子
`com.sanposcape.app.dev` 側は SS-79 で生成した新しい鍵（SHA-1
`83:1C:84:C2:4D:1D:6E:99:13:B4:4A:CA:71:05:3B:B2:3D:00:B5:9E`）が既定になる。
識別子ごとの既定クレデンシャルと登録先の対応は
[build-profiles.md](../docs/build-profiles.md) の「アプリ識別子の定義」に集約した。

### `app.config.ts` の責務が増えたことを記録する

Maps キーの注入に加えて、`APP_VARIANT` による本番 variant の上書き（識別子・scheme・
アプリ名。**2026-09-30 追補: Google サインインの `iosUrlScheme` も**。詳細は
[ADR-002(横断) の本番用 iOS OAuth クライアント追補](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md)）
を担うようになった（`applyAppVariant` 関数）。未知の値（typo 等）は例外にする:
本番ビルドが黙って開発識別子になる事故は、EAS の枠を消費してから発覚すると被害が大きいため、
`expo config` の評価時点（ビルドを始める前）で止める。
（SS-148 追補: `extra.appVariant` の公開も担う。下記）

### 訂正: SHA-1 の不一致は地図が「クラッシュ」ではなく「表示されない」だけ

**訂正（2026-09-13, SS-79）**: 「SHA-1 未登録なら Maps SDK 初期化の RuntimeException で
クラッシュする」という記述が `packages/mobile/docs/build-profiles.md` に残っていたが誤り。
SS-44 で実際に観測されたクラッシュは**キーが APK に未注入**のときであり、キーは注入されて
いるが GCP のアプリ制限（package + SHA-1）と合わない場合は、Google Maps SDK の仕様上
**認証エラーで地図タイルが表示されないだけでアプリは落ちない**（本プロジェクトでは未観測）。
したがって **E2E は GCP 登録の漏れを検出できない**（`.maestro/` は地図タイルの描画を
assert しない。[ADR-004](./ADR-004-e2e-build-ci-strategy.md)）。同じ訂正を
`packages/mobile/docs/build-profiles.md` と [ADR-004](./ADR-004-e2e-build-ci-strategy.md) の
SS-79 追補にも反映した。

## SS-148 追補: 実行時のビルド variant 判定と開発ツールの表示可否（2026-10-01）

### コンテキスト

画面カタログ（`/dev-screens`）をアカウントタブから開けるようにし、TestFlight（staging）でも使いたい。
しかし `__DEV__` は Metro の開発バンドルでしか true にならず、配布ビルドでは開けない。
実行時にビルドの種類を判別する手段も無かった（`APP_VARIANT=production` は `eas.json` の `production` プロファイルの
`env` にだけあり、`app.config.ts` がビルド時に識別子を上書きするのに使うだけで、JS からは見えない）。

### 決定

1. `app.config.ts` は `extra.appVariant`（`"production"` | `"development"`）を常に書く。未知の `APP_VARIANT` は従来どおり throw する。
   `extra` は公開の設定で JS バンドルからも見えるので、秘密を置かない。
2. 開発ツールの表示可否は `src/config/devTools.ts` の `isDevToolsEnabled()` だけで判定する（純粋な判定は `src/config/appVariant.ts`）。
   判定順: `__DEV__` なら許可 → `extra.appVariant === "production"` なら不許可 → `Updates.channel === "production"` なら不許可
   → `extra.appVariant === "development"` なら許可 → それ以外（`extra` 欠落・未知）は不許可（fail-closed）。
3. `/dev-screens`・`/design-system` のガードと、アカウントタブの「画面カタログ」ボタンは、この判定にそろえる。
4. `Updates.channel` を2つ目のシグナルにする理由: `Constants.expoConfig` は OTA の update で起動したときは update の manifest 由来になる
   （embedded でも remote でも）。SDK 55 以降の `eas update` は EAS サーバーの環境変数だけを使い、`eas.json` のビルドプロファイルの
   `env` を読まない。つまり `production` チャネルへ `eas update` を出すと `APP_VARIANT` が無い状態で `app.config.ts` が評価され、
   本番端末の `extra.appVariant` が `"development"` に変わりうる。`Updates.channel` はビルド時にネイティブ設定へ書かれ OTA では
   変わらない（dev build では常に `null`）ので、どちらかが production を示したら閉じることで fail-open を防ぐ。
5. 開発ツールのコードは本番バンドルから除外しない。現状の `__DEV__` ガードでも、`app/dev-screens.tsx` の import は残り、
   Metro は tree shaking を有効にしていない（`metro.config.js` は既定）ので、実行時判定にしてもバンドルの中身は変わらない。
   画面カタログは秘密を持たない（スタブの代表値とルート一覧だけ）。`src/services/auth/index.ts` の
   「dev / mock の実装が本番バンドルに入ることは許容する」と同じ判断。
6. ビルドの種類での分岐は、開発ツールの表示可否以外に使わない（使い道を増やすと、本番と staging で挙動が違う機能が生まれる）。
7. `eas.json` との整合は契約テスト（`src/config/appVariant.test.ts`）で守る。各プロファイルは `extends` を解決した後の値で検査する。
   `distribution: "store"` か `environment: "production"` のプロファイルは、`APP_VARIANT=production` と `channel: "production"` の
   両方を必須とする。例外は許可リスト `NON_PRODUCTION_STORE_PROFILES`（現状 `staging` だけ）に載せたものに限り、
   そのプロファイルは production の値を1つも持ってはならない。新しい store プロファイルは、許可リストに足さない限り本番相当として検査される
   （本番相当のプロファイルが `APP_VARIANT` か channel を継承し損ねて本番で開発ツールが開く事故を、ビルド前に止めるため）。
8. `src/config/devTools.ts` は `expo-constants` / `expo-updates` を値 import するため、純粋であるべき層
   （`src/{lib,api,hooks,store,services,theme,types}/**`、`src/features/*/lib/**`）からの import を `.oxlintrc.json` の
   `no-restricted-imports` で禁止する。判定は `app/` のルートで呼び、結果を props で渡す。

`src/services/auth/index.ts` の `!__DEV__`（mock モードの起動時ガード）は変えない。テスト専用の認証バイパスを
非開発ビルドで禁止するためのガードで、staging でも禁止したままでなければならない。

### 検討した選択肢

- `__DEV__` のまま: staging で開けない
- `EXPO_PUBLIC_APP_VARIANT` を JS に inline する: `eas.json` に同じ意味の変数が2つになる。OTA では同じく update 評価時の値になる
- `extra` だけで判定する: OTA で fail-open する
- `Updates.channel` だけで判定する: `APP_VARIANT` と無関係にチャネル名だけで決まる。channel の無いビルドでは本番を識別できない
- `expo-application` の `applicationId`（`com.sanposcape.app`）で判定する: 最も直接的だが、ネイティブ依存の追加で
  development build の作り直しと `minimumReleaseAge` の待ちが発生する。2シグナルで fail-closed にできるので見送る
- 本番バンドルから除外する: 実験的な tree shaking かモジュール差し替えが要る。秘密を持たない画面に対して効果が見合わない

### 影響

- staging のテスターが画面カタログから、backend に書き込むエントリ（`walk-summary` の `POST /walks`）や
  `AppConfigDebugCard`（`config_source` の表示）に届く。dev 環境の自分のアカウントにしか作用しないので許容する。
  ルート ADR-008 D16 の「`config_source` で分岐しない」方針は変わらない。
- E2E（`preview`）から画面カタログを開けるようになる。
- OTA 運用（SS-103）への申し送り: `production` チャネルの `eas update` では、`extra` の値と `eas.json` の `env` にしかない
  `EXPO_PUBLIC_*` が update 評価時の環境で決まる。開発ツールの判定は channel で守られるが、update 時の環境変数の供給は SS-103 で決めること。
- `extra` の追加で fingerprint が変わり、E2E の APK キャッシュが1回ミスする。development build の作り直しは要らない
  （dev client は Metro が評価した manifest を読む）。
- production のビルドで「ボタンが出ない」「ディープリンクで開けない」ことは E2E では確かめられない（E2E は `preview` だけ）。
  Vitest の判定表・`eas.json` / `app.config.ts` との契約テスト（`src/config/appVariant.test.ts`）と、
  `expo config --type public` の手動確認で担保する。

## 関連情報

- [ADR-001(横断): 地図・POI は Google Maps Platform](../../../docs/adr/ADR-001-map-poi-google-maps-platform.md)
- [ADR-002(mobile): 技術スタック](./ADR-002-mobile-tech-stack.md)
- [ADR-003: development build 前提と開発ループ](./ADR-003-development-build-and-dev-loop.md)
- [ADR-004: E2E ビルド・CI 戦略](./ADR-004-e2e-build-ci-strategy.md)
- [ADR-006: 位置情報サービスは real/mock の2モード](./ADR-006-location-service-real-mock.md)
- [ADR-008(ルート): デプロイとリリースの分離](../../../docs/adr/ADR-008-deploy-release-separation.md)（D16。SS-148 追補で表示範囲を注記）
- [ローカル環境構築手順](../docs/local-env.md)
- [ビルドプロファイルと環境変数](../docs/build-profiles.md)（SS-78 で新設。プロファイルごとの
  backend の向き先と、`eas.json` に書かない値の供給経路の一覧）
