# ADR-007: Expo 設定は `app.json` + `app.config.ts` の併用とし、Maps SDK キーは環境変数から注入する

## 日付

2026-07-30（初版 / SS-15）、2026-08-05 追補（SS-34）、2026-09-11 追補（SS-78）

## ステータス

採用（SS-15）。[ADR-002](./ADR-002-mobile-tech-stack.md) の「移行・対応が必要な事項」にあった「Google Maps の API キー設定は M4 で `app.json` に結線する」という予定を**置き換える**。

**SS-34「画面の『戻る』導線」で追補**した（`android.predictiveBackGestureEnabled: false` が
`useScreenBack` の前提になっていることを「決定」に明記した）。追補部分には `（SS-34 追補）` を付けている。

**SS-78「mobile: EAS ビルドが既定で CloudFront の backend を向くようにする」で追補**した。
EAS 側の供給経路について「**EAS の環境変数管理には載せない**」を決定として明記し、あわせて
初版が前提としていた「**キーが無い環境でもビルドと E2E が通る**」「**未注入の症状は地図が灰色**」
という**事実誤りを訂正**した（実際は Maps SDK 初期化時にクラッシュする）。
追補部分には `（SS-78 追補）` を付けている。

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
- **（SS-78 追補）このキーは EAS の環境変数管理（`eas env:create`）には載せない。**
  供給元は **CI = GitHub Secrets（`ci-e2e` environment）/ ローカル = `.env` またはシェル環境変数**の
  2 経路に限定する。理由は下記「SS-78 追補: 供給元を 2 つにしない」。
  他の `EXPO_PUBLIC_*`（Google OAuth のクライアント ID 等）は EAS 環境変数を使ってよく、
  **このキーだけが例外**である。ビルドプロファイルごとの供給経路の一覧は
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

## SS-78 追補: 供給元を 2 つにしない

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

## 関連情報

- [ADR-001(横断): 地図・POI は Google Maps Platform](../../../docs/adr/ADR-001-map-poi-google-maps-platform.md)
- [ADR-002(mobile): 技術スタック](./ADR-002-mobile-tech-stack.md)
- [ADR-003: development build 前提と開発ループ](./ADR-003-development-build-and-dev-loop.md)
- [ADR-004: E2E ビルド・CI 戦略](./ADR-004-e2e-build-ci-strategy.md)
- [ADR-006: 位置情報サービスは real/mock の2モード](./ADR-006-location-service-real-mock.md)
- [ローカル環境構築手順](../docs/local-env.md)
- [ビルドプロファイルと環境変数](../docs/build-profiles.md)（SS-78 で新設。プロファイルごとの
  backend の向き先と、`eas.json` に書かない値の供給経路の一覧）
