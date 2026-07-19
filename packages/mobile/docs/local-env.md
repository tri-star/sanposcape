# mobile ローカル環境構築手順

React Native (Expo) アプリのローカル開発手順をまとめる。
利用ライブラリは [ツール・ライブラリ](./toolsets-libraries.md)、構造は [フォルダ構造](./folder-structure.md) を参照。

## 前提

- Node.js 20+ / pnpm がインストール済みであること
- **開発ビルド（development build）が必要**（下記「重要」を参照）
- リポジトリルートで `pnpm install` 済みであること

## 重要: Expo Go ではなく development build を使う

本アプリは **Unistyles v3** と **react-native-maps** という **ネイティブモジュール**を利用する。
これらは **Expo Go では動作しない**ため、動作確認には Expo の **development build**（dev client）が必要。

- Expo 公式でも、ネイティブモジュールを使うアプリは development build が推奨されている。
- 純粋なロジック（`src/lib` など）は development build なしで Vitest でテストできる。

## セットアップ

### 1. 依存インストール（リポジトリルート）

```bash
pnpm install
```

- ルートの `.npmrc` で `node-linker=hoisted` を設定している（Metro が pnpm の symlink 構造を解決できないため。Expo 公式ガイド準拠）。

### 2. API クライアントの生成（Orval）

backend の `packages/backend/openapi.yaml` から API クライアントと MSW モックを生成する。

```bash
pnpm --filter mobile orval
```

- 生成物は `src/api/generated/`（gitignore 済み）。
- **backend の API を変更したら、backend で `openapi.yaml` を再出力 → 本コマンドを再実行**する。

### 3. 開発ビルドの作成と起動

```bash
# ネイティブプロジェクトを生成（初回・ネイティブ依存追加時）
pnpm --filter mobile prebuild

# 開発サーバー起動
pnpm --filter mobile start
```

- 端末（実機/エミュレータ）に development build を入れて起動する。
- ローカルの Android は Windows 側で動作させる想定（WSL2 では一部ユーザーの協力が必要）。

## よく使うコマンド

```bash
pnpm --filter mobile typecheck      # tsc 型チェック
pnpm --filter mobile test           # Vitest（ユニット/ロジック）
pnpm --filter mobile lint           # oxlint
pnpm --filter mobile format         # oxfmt（書き込み）
pnpm --filter mobile format:check   # oxfmt（チェックのみ）
pnpm --filter mobile orval          # API クライアント再生成
```

## E2E（Maestro）

- フローは `.maestro/` に置く（例: `.maestro/smoke.yaml`）。
- 実行には Android エミュレータ/実機 + development build が必要。

```bash
maestro test packages/mobile/.maestro/
```

## Google Maps（react-native-maps）

- Android で地図を表示するには Google Maps API キーが必要。
- キーは `app.json` の `expo.android.config.googleMaps.apiKey` /
  `expo.ios.config.googleMapsApiKey` に設定する（M4「探索・散歩開始」で結線）。
- キーはリポジトリにコミットしない（環境ごとに管理）。

## 状態管理・スタイルの方針

- サーバー状態: TanStack Query（`src/api/generated` の生成 hook を利用）
- クライアント状態: Zustand（`src/store`）
- スタイル: Unistyles（`src/theme`。エントリ `index.ts` で初期化）
