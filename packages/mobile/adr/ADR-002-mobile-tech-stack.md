# ADR-002: モバイルの技術スタック（スタイル・状態管理・地図・APIクライアント）

## 日付

2026-07-19

## コンテキスト

[ADR-001](./ADR-001-folder-structure.md) でフォルダ構造を決めた際、スタイルライブラリは「未定」、状態管理も未確定だった。実装を始めるにあたり以下を確定する必要がある。

- スタイリング方針（`src/theme/` に何を入れるか）
- 状態管理（サーバー状態・クライアント状態）
- 地図の描画ライブラリ（本アプリの中核）
- backend API のクライアント生成方法

制約・要件:

- チームは React Native の経験が浅く、**長期保守**を重視する。
- backend は OpenAPI を出力する。型安全に連携したい。
- 地図・POI・ルーティングは Google Maps Platform を backend 経由で使う（[ADR-001](../../../docs/adr/ADR-001-map-poi-google-maps-platform.md)）。

## 決定

- **スタイル: react-native-unistyles（v3）**。デザイントークン/テーマを型安全に扱い、`src/theme/` に primitive/semantic を定義。エントリ `index.ts` で `StyleSheet.configure` を初期化。
- **状態管理**:
  - サーバー状態 = **TanStack Query**（Orval 生成物と組み合わせる）。`src/store` には複製しない。
  - クライアント状態（UI・一時状態）= **Zustand**（`src/store`）。
- **地図描画: react-native-maps**（Android=Google Maps / iOS=Apple Maps）。
- **API クライアント: Orval**。backend の `openapi.yaml` から TanStack Query 用フックと MSW モックを生成（`src/api/generated/`、httpClient=fetch、mutator=`src/api/client.ts`）。
- パッケージ管理は pnpm、`minimumReleaseAge=2880`（2日）でサプライチェーン対策。

## 検討した選択肢

### スタイル

#### 選択肢1: Unistyles（採用）

- **概要**: テーマ/デザイントークンを型安全に扱う高性能スタイルライブラリ。
- **メリット**: デザイントークン運用・テーマ切替に強く、純粋な RN スタイルに近い。長期保守向き。
- **デメリット**: v3 はネイティブ(Nitro)依存で **Expo Go 不可**（[ADR-003](./ADR-003-development-build-and-dev-loop.md) で対応）。babel プラグイン設定が必要。

#### 選択肢2: NativeWind（Tailwind）

- **概要**: Tailwind ライクな class 記法。
- **メリット**: Web の Tailwind と語感が揃う。学習が早い。
- **デメリット**: バージョン変遷の履歴があり、長期運用の安定性に懸念。

#### 選択肢3: StyleSheet + 独自トークン

- **概要**: ライブラリを足さず素の StyleSheet + トークン。
- **メリット**: 依存最小。
- **デメリット**: テーマ切替・共通化の仕組みを自前で作り込む必要があり、車輪の再発明になりやすい。

### 状態管理

#### 選択肢1: TanStack Query + Zustand（採用）

- **概要**: サーバー状態は Query、クライアント状態は Zustand。
- **メリット**: サーバー/クライアント状態の責務が明確。Orval と好相性。学習コスト低め。
- **デメリット**: ライブラリが2つになる（が役割が違うので許容）。

#### 選択肢2: TanStack Query + Jotai

- **メリット**: atom 単位の細粒度管理。
- **デメリット**: 本アプリのクライアント状態は多くなく、Zustand の方が単純で足りる。

#### 選択肢3: TanStack Query + Context のみ

- **メリット**: 追加ライブラリ最小。
- **デメリット**: 状態が増えると Context の肥大化・再レンダリング管理が煩雑。

### 地図

#### 選択肢1: react-native-maps（採用）

- **メリット**: 最も成熟。Expo config plugin 対応、エコシステム豊富で MVP 向き。ベンダーコスト最小。
- **デメリット**: ネイティブモジュールのため **Expo Go 不可**（[ADR-003](./ADR-003-development-build-and-dev-loop.md)）。

#### 選択肢2: Mapbox / 選択肢3: MapLibre(OSM)

- **メリット**: 高いカスタマイズ性 / 完全 OSS。
- **デメリット**: 有料枠や自前ホスティング・タイル配信の検討が増え、MVP には過剰。

## 決定理由

- **長期保守**とデザイントークン運用を重視し、テーマを型安全に扱える Unistyles を採用。地図が元々ネイティブ依存（react-native-maps）で **Expo Go を使えない**ため、Unistyles のネイティブ依存も追加の制約にならない（どのみち development build 前提）。
- 状態管理は、サーバー状態を Query に一元化し、少量のクライアント状態を Zustand で持つのが**責務が明確で学習コストも低い**。
- API は OpenAPI からの自動生成（Orval）で**型安全＆手書き削減**。MSW モックも同時生成でき、テスト容易性の要件に合致。

## 影響

### ポジティブな影響

- デザイントークン運用・テーマ切替が型安全に行える（[ADR-001](./ADR-001-folder-structure.md) の暫定だった `src/theme/` を確定）。
- サーバー/クライアント状態の分離がコード構造に表現される。
- backend の API 変更が OpenAPI→Orval 再生成で mobile に型として反映される。

### ネガティブな影響・トレードオフ

- Unistyles・react-native-maps が**ネイティブモジュール**のため Expo Go が使えず、development build が必要（[ADR-003](./ADR-003-development-build-and-dev-loop.md)）。
- Orval 生成物は再生成前提のため、backend の OpenAPI 更新時に再生成の運用が必要。

### 移行・対応が必要な事項

- `src/theme/tokens.ts` は暫定値。M2「デザイン取り込み」で Claude Design の値に差し替える。
- backend API を変更したら `openapi.yaml` 再出力 → `pnpm --filter mobile orval` を再実行する。
- Google Maps の API キー設定は M4 で `app.json` に結線する。

## 関連情報

- [ADR-001: フォルダ構造](./ADR-001-folder-structure.md)
- [ADR-003: development build 前提と開発ループ](./ADR-003-development-build-and-dev-loop.md)
- [ADR-004: E2E ビルド・CI 戦略](./ADR-004-e2e-build-ci-strategy.md)
- [ツール・ライブラリ](../docs/toolsets-libraries.md) / [フォルダ構造](../docs/folder-structure.md)
- [ADR-001(横断): 地図・POI に Google Maps Platform](../../../docs/adr/ADR-001-map-poi-google-maps-platform.md)
