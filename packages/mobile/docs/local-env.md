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

### 3. development build の作成（EAS）と起動

方針: **EAS で development build(APK) を1回作り、以降は Metro の Fast Refresh で Expo Go 同等**の体験を得る。
再ビルドが必要なのは**ネイティブが変わるとき**（native依存の追加/削除・`app.json`のネイティブ設定・plugin・SDK更新）だけ。JS/スタイル/ロジックの変更は Fast Refresh で即反映される。詳細は [ADR-003](../adr/ADR-003-development-build-and-dev-loop.md)。

```bash
# 初回だけ: EAS で Android の development build(APK) を作成
#   （eas アカウント連携が必要。実行はユーザーが行う）
pnpm --filter mobile exec eas build --profile development --platform android
#   → 生成された APK を Windows 側のエミュレータ / 実機にインストール

# 以降は毎回これだけ（dev build を端末で開いた状態で）
pnpm --filter mobile exec expo start --dev-client
```

- ローカルの Android は Windows 側で動作させる想定（WSL2 では一部ユーザーの協力が必要）。エミュレータ/adb server は Windows 側、Expo CLI/Metro は WSL2 側という役割分担にする。

#### WSL2 から Windows 版 adb を使う（初回のみ）

Expo CLI が `adb` コマンドを呼んだときも常にWindows版adbが使われるよう、ラッパースクリプトを `~/.local/bin` に配置する。

```bash
mkdir -p ~/.local/bin
cp scripts/mobile-tools/adb ~/.local/bin/adb
chmod +x ~/.local/bin/adb

echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"

# 確認
adb version
adb devices
```

- WSLにLinux版`adb`がすでに入っている場合でも、`~/.local/bin`が先にPATHへ来ていればこのラッパーが優先される。
- ラッパーの実体は `scripts/mobile-tools/adb`（Windows側の `$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe` を呼び出す）。SDKの場所が異なる場合はコピー後のファイルを直接編集する。

#### Windows側のAndroid Emulatorを起動する

Android Studio（Device Manager）から起動する他、WSL2からコマンドで起動・AVD一覧の確認ができる（[android-emulator skill](../../../.claude/skills/android-emulator/SKILL.md)からも呼び出し可能）。

```bash
bash scripts/mobile-tools/list-avds.sh              # 利用可能なAVD一覧
bash scripts/mobile-tools/start-emulator.sh         # デフォルトAVD(Pixel_4_API_33)を起動
bash scripts/mobile-tools/start-emulator.sh Pixel_8_API_35  # AVDを指定して起動
```

- デフォルトAVDを変更したい場合は `scripts/mobile-tools/start-emulator.sh` 冒頭の `DEFAULT_AVD` を編集する。

#### Metroへのポート転送

- WSL2 上の Metro に端末を到達させる:
  - `adb reverse tcp:8081 tcp:8081`（`adb reverse`の設定はエミュレータを再起動すると消えるため、エミュレータ起動後に毎回実行する）
  - うまくいかない場合: `expo start --dev-client --tunnel`

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
- E2E は **standalone な preview ビルド**（JS埋め込み・スタブenv焼き込み）を使う。日常開発の development build とは別物。詳細は [ADR-004](../adr/ADR-004-e2e-build-ci-strategy.md)。
- 実行には Android エミュレータ/実機 + preview APK が必要。

```bash
# ローカル: preview APK を作成（EASクラウド枠を使わないローカルビルド）
pnpm --filter mobile exec eas build --local --profile preview --platform android --output e2e-build/app-preview.apk
adb install -r e2e-build/app-preview.apk
maestro test packages/mobile/.maestro/
```

- CI（`.github/workflows/mobile-e2e.yml`）は EAS クラウドビルドを使わず、ランナーで自前ビルドし、`@expo/fingerprint` で APK をキャッシュ（ネイティブ未変更なら再ビルドしない）。実行は nightly / 手動 / ネイティブ変更時のみ。

## Google Maps（react-native-maps）

- Android で地図を表示するには Google Maps API キーが必要。
- キーは `app.json` の `expo.android.config.googleMaps.apiKey` /
  `expo.ios.config.googleMapsApiKey` に設定する（M4「探索・散歩開始」で結線）。
- キーはリポジトリにコミットしない（環境ごとに管理）。

## 状態管理・スタイルの方針

- サーバー状態: TanStack Query（`src/api/generated` の生成 hook を利用）
- クライアント状態: Zustand（`src/store`）
- スタイル: Unistyles（`src/theme`。エントリ `index.ts` で初期化）
