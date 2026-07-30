# ADR-007: Expo 設定は `app.json` + `app.config.ts` の併用とし、Maps SDK キーは環境変数から注入する

## 日付

2026-07-30

## ステータス

採用（SS-15）。[ADR-002](./ADR-002-mobile-tech-stack.md) の「移行・対応が必要な事項」にあった「Google Maps の API キー設定は M4 で `app.json` に結線する」という予定を**置き換える**。

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
- `app.config.ts` はネイティブ設定に影響するため、
  **`.github/workflows/mobile-e2e.yml` のネイティブ変更トリガ（`paths`）と `oxfmt` の対象に含める。**

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

## 影響

### ポジティブな影響

- Maps SDK キーがリポジトリにも JS バンドルにも入らない。
- backend の server key と mobile の SDK key が構成上も分離される（ADR-001 の実装）。
- キーが無い環境でもビルドと E2E が通る。

### ネガティブな影響・トレードオフ

- 設定が `app.json` と `app.config.ts` の2箇所に分かれる。どちらを見ればよいか迷いうるため、
  `app.config.ts` の JSDoc と [local-env](../docs/local-env.md) に役割分担を書く。
- **キー未注入の失敗が「地図が灰色」という静かな症状**になるため気付きにくい。
  `expo config --type prebuild` での確認手順と、リリース前チェックリストで補う。
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
