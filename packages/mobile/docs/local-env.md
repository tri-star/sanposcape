# mobile ローカル環境構築手順

React Native (Expo) アプリのローカル開発手順をまとめる。
利用ライブラリは [ツール・ライブラリ](./toolsets-libraries.md)、構造は [フォルダ構造](./folder-structure.md) を参照。

## 前提

- Node.js 22.13 以上（**24 系の最新を推奨**）/ pnpm がインストール済みであること
  - Expo SDK 57 の最低 Node は 22.13.x。metro が要求する範囲は
    `^22.13.0 || ^24.3.0 || >= 26.0.0` なので、24 系を使う場合は **24.3 以上**にすること
    （24.0〜24.2 は範囲外）。CI も Node 24 で動かしている。
- **開発ビルド（development build）が必要**（下記「重要」を参照）
- リポジトリルートで `pnpm install` 済みであること

## 重要: Expo Go ではなく development build を使う

本アプリは **react-native-maps**、**react-native-svg**（アイコン描画）、
**@react-native-community/slider**（往復時間スライダー）、**react-native-nitro-google-signin**
（Google サインイン）、**expo-secure-store**（refresh token の永続化）、**expo-crypto**
（`x-amz-content-sha256` の計算。`src/api/contentHash.ts`）という
**ネイティブモジュール**を利用する。これらは **Expo Go では動作しない**ため、動作確認には Expo の
**development build**（dev client）が必要。

- Expo 公式でも、ネイティブモジュールを使うアプリは development build が推奨されている。
- 純粋なロジック（`src/lib` など）は development build なしで Vitest でテストできる。
- **SS-10（`EXPO_PUBLIC_AUTH_MODE` の real/dev/mock 切り替え）の適用後は、
  `react-native-nitro-google-signin` / `expo-secure-store` が新規追加されたネイティブ依存のため、
  development build の作り直しが必要**（Fast Refresh では反映されない）。
- **SS-70（CloudFront 経由の API 通信対応）の適用後も、`expo-crypto` が新規追加された
  ネイティブ依存のため development build の作り直しが必要**（Fast Refresh では反映されない）。

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

方針: **EASで端末向けdevelopment buildを1回作り、以降はMetroのFast RefreshでExpo Go同等**の体験を得る。
再ビルドが必要なのは**ネイティブが変わるとき**（native依存の追加/削除・`app.json`のネイティブ設定・plugin・SDK更新）だけ。JS/スタイル/ロジックの変更は Fast Refresh で即反映される。詳細は [ADR-003](../adr/ADR-003-development-build-and-dev-loop.md)。

> `development` 以外のプロファイル（E2E の `preview`、dev AWS 環境の `staging`、ストア配信の
> `production`）がどの backend を向くか、`eas.json` に書かない値をどう供給するかは
> [ビルドプロファイルと環境変数](./build-profiles.md) にまとめてある。
> **EAS ビルドでは下記の `.env` は読まれない**点に注意すること。

```bash
# 初回だけ: EAS で Android の development build(APK) を作成
#   （eas アカウント連携が必要。実行はユーザーが行う）
pnpm --filter mobile exec eas build --profile development --platform android
#   → 生成された APK を Windows 側のエミュレータ / 実機にインストール

# 以降は毎回これだけ（dev build を端末で開いた状態で）
pnpm --filter mobile exec expo start --dev-client
```

- ローカルの Android は Windows 側で動作させる想定（WSL2 では一部ユーザーの協力が必要）。エミュレータ/adb server は Windows 側、Expo CLI/Metro は WSL2 側という役割分担にする。
- iPhone実機ではEASのAd Hoc署名付きdevelopment buildをインストールし、WSL2上のMetroへ
  `expo start --dev-client --host lan`で接続する。iPhoneをPCと同じLANに属するWi-Fiへ接続し、
  Hyper-VファイアウォールでMetro用ポートを許可する。LAN経路を利用できない場合のみ
  Tunnelへフォールバックする。初回の端末登録、ビルド、インストール、ファイアウォール設定は
  [iPhone実機 development build手順](./iphone-device-development.md)を参照。

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
  - Android: `adb reverse tcp:8081 tcp:8081`（`adb reverse`の設定はエミュレータを再起動すると消えるため、エミュレータ起動後に毎回実行する）
  - iPhone: `expo start --dev-client --host lan`（iPhoneとPCを同じLANへ接続する）
  - LAN経路を利用できない場合のみ: `expo start --dev-client --tunnel`

### 4. 環境変数（`.env`）

**単純に `cp packages/mobile/.env.example packages/mobile/.env` してはいけない。**
`.env.example` の `EXPO_PUBLIC_BACKEND_API_URL` は `{%BACKEND_API_PORT%}` のようなプレースホルダを
含んでおり、`cp` だけでは置換されないまま空でない値として残るため、`getApiBaseUrl()` の既定値
フォールバックも効かず、`dev` モードのサインインを含む全API呼び出しが失敗する。

リポジトリルートで以下を実行し、プレースホルダを置換した `.env` を生成する
（README のクイックスタート手順1と同じ）:

```bash
bash scripts/initialize-dotenv.sh
```

- 同スクリプトは `packages/**/.env.example` を探索し、空きポートを自動検出してプレースホルダを
  置換した `.env` を各パッケージに生成する（`packages/mobile/.env` もこれで作られる）。
- 最低限 `EXPO_PUBLIC_AUTH_MODE=dev` で始めるのを推奨する（Google Cloud のクライアントID設定が
  終わるまでは `real` は使えないため）。`dev` は backend の `POST /auth/dev-session`（`AUTH_MODE=dev`
  で起動した backend が必要）を使い、Google には一切触れない。
- モード・各変数の意味は `.env.example` のコメント、または
  [ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) を参照。
- `EXPO_PUBLIC_AUTH_MODE` が未設定・不正値の場合は自動的に `real` にフォールバックする
  （`src/config/authMode.ts`。fail-safe）。

**注意**: `scripts/initialize-dotenv.sh` は `.env` を**無条件に上書き**し、実行のたびにポートを
再抽選する。`EXPO_PUBLIC_AUTH_MODE` や `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` などを `.env` に
手で追記・変更した場合、**同スクリプトを再実行すると手で追記した値は失われる**（プレースホルダが
入った状態に戻る）。再実行後は認証まわりの値を入れ直すこと。

## よく使うコマンド

```bash
pnpm --filter mobile typecheck      # tsc 型チェック
pnpm --filter mobile test           # Vitest（ユニット/ロジック）
pnpm --filter mobile lint           # oxlint
pnpm --filter mobile format         # oxfmt（書き込み）
pnpm --filter mobile format:check   # oxfmt（チェックのみ）
pnpm --filter mobile orval          # API クライアント再生成
```

### typedRoutes（`.expo/types/router.d.ts`）について

- `app.json` で `experiments.typedRoutes: true` を有効化しているため、`router.push("/walk-start")` 等のルート文字列は
  `.expo/types/router.d.ts`（gitignore対象・自動生成）を見て型検査される。
- この型は通常 `expo start`（B. 毎回の起動手順）を一度実行すると自動生成される。
- **`expo start` を起動せずに `typecheck` だけ実行したい場合**（新しいルートを追加した直後、CIなど）は、
  以下のコマンドで生成できる（[Expo公式ドキュメント](https://docs.expo.dev/router/reference/typed-routes/#ci)）:
  ```bash
  pnpm --filter mobile exec expo customize tsconfig.json
  ```
  CI（`mobile-ci.yml`）でも `typecheck` の前にこのコマンドを実行している。

## E2E（Maestro）

- フローは `.maestro/` に置く（例: `.maestro/smoke.yaml`）。Maestro は既定でワークスペース直下の
  yaml だけを自動実行するため、`.maestro/subflows/` は `runFlow` からのみ呼ばれる共通手順の置き場
  になっている（単体では実行されない）。
- E2E は **standalone な preview ビルド**（JS埋め込み・スタブenv焼き込み）を使う。日常開発の development build とは別物。詳細は [ADR-004](../adr/ADR-004-e2e-build-ci-strategy.md)。
- 実行には Android エミュレータ/実機 + preview APK が必要。
- フローには tag を付けて実行対象を絞り込める（`--include-tags` / `--exclude-tags`）。
  **CI は絞り込まず全フローを実行する**（SS-54）ため、タグはローカルでの部分実行用:
  - `smoke`: 外部データ（`/explore/*`）に依存しない到達性フロー。
  - `mvp`: MVP 主要フロー（`mvp-walk-flow.yaml`）。
  - `pin`: ピン登録関連フロー（`pin-register.yaml`（SS-88）/ `pin-register-anywhere.yaml`
    （散歩中以外・任意地点での登録と位置調整。SS-124））。
  - `maps-required`: `/explore/places` が候補を返す環境（backend の `MAPS_MODE=fake`、
    または実の `GOOGLE_MAPS_SERVER_API_KEY` 設定）が前提のフロー。無い環境では
    `--exclude-tags` で除外する。`MAPS_MODE=fake` は SS-44 で実装済みなので、
    **Google Maps のキーを持っていなくてもローカルで実行できる**。
    ただし fake provider は全候補で周回が合格するため、**同じ道フォールバック表示（凡例「行き・帰り（同じ道）」）は E2E では通らない**。
    手動で確認するときは backend を `GOOGLE_MAPS_LOOP_ROUTE_ENABLED=false` で作り直す（[backend の周回ルートの節](../../backend/docs/local-env.md#周回ルートexploreroutesloopss-33adr-007-参照)）。

```bash
# ローカル: preview APK を作成（EASクラウド枠を使わないローカルビルド）
pnpm --filter mobile exec eas build --local --profile preview --platform android --output e2e-build/app-preview.apk
adb install -r e2e-build/app-preview.apk

# 全フロー（CI と同じ範囲）。backend が MAPS_MODE=fake か実キーで応答できることが前提
maestro test packages/mobile/.maestro/

# smoke タグのフローだけ（外部データに依存せず、backend の候補を用意できない環境向け）
maestro test --include-tags=smoke packages/mobile/.maestro/

# 外部データに依存するフローだけ（MVP 主要フロー + ゲスト保存 → サインイン CTA フロー）
maestro test --include-tags=maps-required packages/mobile/.maestro/

# 個別フローを名指しで実行（デバッグ時）
maestro test packages/mobile/.maestro/mvp-walk-flow.yaml
```

- MVP フロー（`maps-required`）を動かすには、backend を `AUTH_MODE=dev` に加えて
  `MAPS_MODE=fake` で起動する必要がある（実の `GOOGLE_MAPS_SERVER_API_KEY` を `.env` に
  設定してもよい）。

  ```bash
  cd packages/backend
  ENV=local AUTH_MODE=dev MAPS_MODE=fake docker compose up -d
  ```

  `docker compose restart` では反映されない（`compose.yaml` の `${...}` はコンテナ生成時に
  展開されるため）。必ず `up -d` でコンテナを作り直すこと。
- CI（`.github/workflows/mobile-e2e.yml`）は EAS クラウドビルドを使わず、ランナーで自前ビルドする。
  起動条件は次の3系統:
  - **nightly**: 毎日 03:00 JST 相当のスケジュール実行。
  - **手動実行**: GitHub Actions の `workflow_dispatch`。
  - **対象パス変更時**: `main` への push のうち、ネイティブに影響し得る設定・依存ファイル、
    Maestro フロー、または E2E workflow 自身が変更された場合。通常の PR 作成時には起動せず、
    対象変更が `main` に push（マージ）された後に起動する。
- CI が起動した後はタグで絞り込まず、MVP フローを含む `.maestro/` 配下の全フローを実行する
  （SS-54）。`smoke` / `maps-required` タグはローカルでの部分実行用であり、CI の起動条件ではない。
  CI の backend は `MAPS_MODE=fake` で起動するため、外部データに依存せず全フローを実行できる。
- `@expo/fingerprint` は CI の起動条件ではなく、起動後に APK を再ビルドするかの判定に使う。
  ネイティブ影響入力が変わらなければ、キャッシュ済み APK を再利用する。
- CI 設定と本項の整合は、次のコマンドで起動条件、実行範囲、タグ定義を確認する:

  ```bash
  # nightly・手動実行・mainへの対象パス変更を確認
  sed -n '18,34p' .github/workflows/mobile-e2e.yml

  # CIがタグで絞り込まず全フローを実行することを確認
  rg -n 'maestro test packages/mobile/\.maestro/' .github/workflows/mobile-e2e.yml

  # ローカルで選択できるフローのタグを確認
  rg -n '^tags:|^  - (smoke|mvp|maps-required)$' packages/mobile/.maestro/*.yaml
  ```
- 失敗時は `~/.maestro/tests/<最新のディレクトリ>/` に実行ログ・スクリーンショット・階層ダンプ（`.json`）が残る。CI では失敗時に `maestro-debug-output` artifact としてアップロードされる。

## Google Maps（react-native-maps）

- Android で地図を表示するには Google Maps API キーが必要（iOS は既定の Apple Maps を使うためキー不要）。
- キーはリポジトリにコミットしないため `app.json` に直書きせず、`app.config.ts` が
  環境変数 `GOOGLE_MAPS_ANDROID_SDK_KEY`（`EXPO_PUBLIC_` ではない＝JSバンドルに焼き込まない）を読んで
  `android.config.googleMaps.apiKey` に注入する。
- **Maps SDK for Android のキー（mobile）と `/explore/*` 用の server key（backend の
  `GOOGLE_MAPS_SERVER_API_KEY`）は必ず別のキーにする**（ADR-001）。
- 手順:
  1. Google Cloud Console で **Maps SDK for Android** を有効化し、Android 用の API キーを作成する。
  2. アプリ制限（識別子ごとの package 名 + 署名鍵ごとの SHA-1。認証と同じ4種で
     識別子は本番/開発で異なる。[Google サインイン](#google-サインイン) の表を参照）を設定する。
  3. **ローカル実行の場合**: `.env` に `GOOGLE_MAPS_ANDROID_SDK_KEY=<キー>` を設定する
     （`expo prebuild` / `expo start` / `expo config` は `.env` を読む。
     `scripts/initialize-dotenv.sh` 再実行で消えるのは他の変数と同じ注意点）。
     `.env` を経由できない/確認したい場合は、シェル変数で明示的に渡すこともできる:
     `GOOGLE_MAPS_ANDROID_SDK_KEY=xxx pnpm --filter mobile exec expo prebuild`。
  3-b. **EAS ビルド（development / preview / production）では `.env` は使われない**。
     `.env` は gitignore 済みでビルドコンテキストにアップロードされないため、
     `.env` に入れただけでは EAS 製の APK にキーが注入されない。次のいずれかで注入する:
     - EAS の環境変数に登録する（environment / visibility / scope を必ず指定する。
       省略すると意図しない environment に登録されたり、`secret` にならず二重供給に
       なったりする）:
       ```bash
       pnpm --filter mobile exec eas env:create \
         --environment preview \
         --name GOOGLE_MAPS_ANDROID_SDK_KEY \
         --value <キー> \
         --visibility secret \
         --scope project
       ```
       （`preview` 環境は `staging` / `staging-apk` / `staging-ios` とも共有される。
       このキーだけは `secret` 一択で `plaintext` / `sensitive` にはしないこと。理由は
       [build-profiles.md](./build-profiles.md) の「`GOOGLE_MAPS_ANDROID_SDK_KEY` の
       供給元は経路ごとに1つにする」を参照）
     - `eas build --local` の場合はシェル環境変数として渡す（`ci-e2e` の GitHub Secrets 経由。
       `secret` visibility は `--local` では解決されないため、この経路の供給元は GitHub Secrets
       のまま維持される）
     **未注入だとビルド・起動には成功するが、起動直後に Maps SDK の初期化で
     `RuntimeException` が発生してアプリがクラッシュする**（SS-44 で観測。「地図が灰色になる
     だけ」ではない）。`app.config.ts` はキーが無いとき `android.config` 自体を付けない設計。
     なお **CI の E2E（`preview` プロファイル）にはこのキーを注入している**
     （`.github/workflows/mobile-e2e.yml` が `ci-e2e` environment の GitHub Secrets から渡す）。
     未注入にすると `maps-required` タグの Maestro フローが軒並みクラッシュで失敗するため、
     E2E にとってこのキーは必須である（地図タイルの描画自体は assert しない。ADR-004）。
  4. 反映確認: `pnpm --filter mobile exec expo config --type prebuild` の出力に
     `android.config.googleMaps.apiKey` が載っているか確認する（キー未設定時は `config`
     フィールド自体が付かない。この状態のビルドを実機・エミュレータで起動すると
     Maps SDK 初期化時にクラッシュする）。
  5. **ネイティブ設定（`expo-location` の追加・Maps キーの注入）を反映するには development build
     の作り直しが必要**（Fast Refresh では反映されない。ADR-004 の 2026-08-14 追補以降、
     E2E の APK キャッシュキーは `packages/mobile` のソース全体ハッシュ（`.maestro/` / `docs/` /
     `adr/` を除く）になっているため、ネイティブ設定に限らずソースの変更があれば再ビルドされる）。

## 位置情報（expo-location）

- `EXPO_PUBLIC_LOCATION_MODE`（`real` | `mock`。既定 `real`）で現在地取得の実装を切り替える
  （`src/config/locationMode.ts`）。認証と異なり `dev` モードは無い（位置情報は
  Android エミュレータ / 実機の位置設定・`adb emu geo fix` で real のまま再現できるため）。
  - `real` = `expo-location`（実機/エミュレータの現在地。フォアグラウンド権限が必要）。
  - `mock` = 東京駅の固定座標（`src/services/location/location.mock.ts`。vitest や、位置情報が
    フレークになりやすい E2E（Maestro）で使う。`eas.json` の `preview` プロファイルは既定でこれ）。
- 権限文言は `app.json` の `expo-location` プラグイン（`locationWhenInUsePermission`）で設定済み。

## 写真（expo-image-picker / expo-image-manipulator / expo-file-system）

- `EXPO_PUBLIC_PHOTO_MODE`（`real` | `mock`。既定 `real`）で写真の取得・加工の実装を切り替える
  （`src/config/photoMode.ts`）。位置情報と同じく `dev` モードは無い（詳細は
  [ADR-010](../adr/ADR-010-photo-service-and-direct-s3-upload.md)）。
  - `real` = `expo-image-picker`（カメラ/写真ライブラリ）+ `expo-image-manipulator`（縮小・再圧縮）。
  - `mock` = 固定のダミー写真（`src/services/photo/photo.mock.ts`。vitest や、システムのカメラ/
    写真ピッカーを安定操作できない E2E（Maestro）で使う。`eas.json` の `preview` プロファイルは
    既定でこれ。ダミーは実ファイルではないためアップロードは失敗する＝写真付き E2E は別チケット）。
- 権限文言は `app.json` の `expo-image-picker` プラグイン（`photosPermission` /
  `cameraPermission`）で設定済み。
- ピンの写真アップロード（presigned POST）を backend 経由で確認するには、backend を
  `STORAGE_MODE=fake` で起動する（`packages/backend/.env.example` が既定でこの値）。

## `/explore/places` がローカルで常に失敗する場合

- backend の `GOOGLE_MAPS_SERVER_API_KEY` が未設定だと、`/explore/places` は
  `UnconfiguredGoogleMapsProvider` により **常に 503** を返す（mobile 実装のバグではない）。
  mobile 側は `provider_unavailable` として文言 + 再試行ボタンを表示する。
- backend 側で `GOOGLE_MAPS_SERVER_API_KEY` を設定してから確認すること。
- E2E（Maestro）の `maps-required` タグが前提とする候補は、実キーが無くても
  `MAPS_MODE=fake`（SS-44 で実装済みの `FakeGoogleMapsProvider`）で**決定的に再現できる**。
  backend を `ENV=local AUTH_MODE=dev MAPS_MODE=fake docker compose up -d` で起動すること
  （[E2E（Maestro）](#e2emaestro) の `maps-required` 節も参照）。

## Google サインイン

`real` モード（実 Google サインイン）を使うには、Google Cloud Console 側の設定が必要。
詳細な決定事項は [ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) を参照。
未設定でも `dev` / `mock` モードでの開発は可能。

1. **Web アプリケーション用 OAuth クライアント**を作成し、client ID を
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` に設定する（backend 側の許容 audience にも同じ値を設定する）。
   **ID token の `aud` はプラットフォームで異なる**: Android は Web クライアント ID、iOS は
   iOS クライアント ID になる（`react-native-nitro-google-signin` がプラットフォーム別の
   クライアント ID で Google と対話するため）。backend の `GOOGLE_ALLOWED_AUDIENCES` には
   **両方**をカンマ区切りで設定する必要がある（[ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md)
   決定4-1）。
2. **Android 用 OAuth クライアントは「package 名 1 つ + SHA-1 1 つ」の組ごとに 1 つ作る**必要が
   あり、既存クライアントに組を追加することはできない（Google の仕様）。**アプリ識別子を
   本番/開発で分割した（SS-79）ため、package 名は対象の識別子で読み替えること**（識別子の
   定義は [build-profiles.md](./build-profiles.md) の「アプリ識別子の定義」を参照）:

   | 用途 | 対象の識別子 | SHA-1 の取得方法 |
   | --- | --- | --- |
   | ローカル debug（`expo run:android`） | `com.sanposcape.app.dev` | `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android` |
   | EAS development | `com.sanposcape.app.dev` | `pnpm --filter mobile exec eas credentials`（Android → development） |
   | EAS preview（E2E APK） | `com.sanposcape.app.dev` | 同上（preview プロファイル） |
   | EAS production | `com.sanposcape.app` | `APP_VARIANT=production pnpm --filter mobile exec eas credentials`（production。Play App Signing 利用時は Play Console 側の SHA-1 も登録） |

   - 開発用識別子（`com.sanposcape.app.dev`）の SHA-1 は EAS で生成済み:
     `83:1C:84:C2:4D:1D:6E:99:13:B4:4A:CA:71:05:3B:B2:3D:00:B5:9E`（2026-09-13）。
   - 本番識別子（`com.sanposcape.app`）の EAS 既定クレデンシャルの SHA-1 は
     `D8:27:FB:D7:A5:83:77:AB:11:2E:96:07:80:45:DC:B1:9F:8A:2F:99`（`build-credential-ci`）。
   - SHA-1 未登録は Android で `DEVELOPER_ERROR` という分かりにくいエラーになる（アプリ側では
     `AuthError("configuration")` に分類される）。
   - **開発用 GCP プロジェクトに登録済みなのは EAS の開発用鍵 `83:1C:...:9E` のみ**
     （2026-09-13 時点）。**上表の「ローカル debug」行の SHA-1（`~/.android/debug.keystore`）は
     未登録である。** そのため `expo run:android` でのローカル debug ビルドは、Google Maps
     のアプリ制限にも Android OAuth クライアントにも合致せず、**地図タイルが表示されず
     Google サインインもできない**（`DEVELOPER_ERROR`）。ローカル debug ビルドでこれらを
     使いたい場合は、上記手順でローカル debug 鍵の SHA-1 を取得し、Google Cloud Console で
     Maps キーのアプリ制限と Android OAuth クライアントの両方に `com.sanposcape.app.dev` +
     その SHA-1 の組を追加登録すること。
3. **iOS 用 OAuth クライアントは bundle ID ごとに作る。** 開発識別子
   （`com.sanposcape.app.dev`）は既存クライアント（ID
   `647949159303-53e8cedj7ochfqqhhccc9b9l77jvt7gq`）の bundle ID を GCP コンソールで編集する形で
   割り当て済みで、**編集後もクライアント ID は変わらなかった**（2026-09-13 確認）。
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` と `app.json` の `plugins` の
   `react-native-nitro-google-signin` オプション `iosUrlScheme`（逆ドメイン形式、
   `com.googleusercontent.apps.<IOS_CLIENT_ID>`）は変更不要だった。
   - **本番識別子（`com.sanposcape.app`）用の iOS クライアントは未作成**。`production` を
     使い始める段で新規作成し、`app.config.ts` の `PRODUCTION_VARIANT` に `iosUrlScheme` を
     足す必要がある（build-profiles.md に未完了事項として記載）。
4. **App Store 審査**: iOS で Google ログインを提供する場合、Sign in with Apple の併設が要求される
   （MVP のリリース計画に織り込む）。

### リリース前チェックリスト（production ビルド）

`eas.json` の `production` プロファイルには `env` ブロックがあり、`APP_VARIANT: "production"`
（`app.config.ts` に本番の識別子・scheme・アプリ名で上書きさせる）/
`EXPO_PUBLIC_BACKEND_API_URL`（本番 backend の HTTPS URL）/ `EXPO_PUBLIC_AUTH_MODE: "real"` /
`EXPO_PUBLIC_LOCATION_MODE: "real"` を定義済みである（SS-79）。**production ビルドを作る前に、
EAS ダッシュボード（`production` 環境）で以下が別途注入されることを必ず確認する**
（`eas.json` にコミットしていないもの）:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`（未設定だと
  `signInWithGoogle()` が `AuthError("configuration")` を返し、実質サインイン不能になる。
  起動時クラッシュはしないがユーザー体験としては全滅する点に注意。**本番用 iOS OAuth クライアントは
  2026-09-13 時点で未作成**。`production` を使い始める段で新規作成が必要。詳細は
  [ADR-002 の SS-79 追補](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md)）
- `GOOGLE_MAPS_ANDROID_SDK_KEY`（未注入だと Android で Maps SDK 初期化時に
  `RuntimeException` が発生してアプリがクラッシュする。「地図が灰色になるだけ」ではない。
  `EXPO_PUBLIC_` ではないため JS バンドルには焼き込まれず、`app.config.ts` がビルド時に
  `android.config.googleMaps.apiKey` へ注入する。詳細は
  [Google Maps（react-native-maps）](#google-mapsreact-native-maps)）。**本番識別子用の
  Maps キーのアプリ制限・GCP プロジェクトの用意も 2026-09-13 時点で未完了**（開発用 GCP
  プロジェクトには本番識別子の登録が無い。[build-profiles.md](./build-profiles.md) の
  「アプリ識別子の定義」参照）

`EXPO_PUBLIC_LOCATION_MODE` は `eas.json` で既に `"real"` を明示している（未設定＝`real` への
フォールバックに頼らない。誤って `mock` が入ると全ユーザーの現在地が東京駅固定になるため）。

クライアントID自体は秘密情報ではないが、値が本番用に未確定な部分（iOS クライアント ID）が
残っているため、`eas.json` の `production.env` には追記せず EAS の環境変数側で管理する。
値が確定した時点で追記を検討する。

## 状態管理・スタイルの方針

- サーバー状態: TanStack Query（`src/api/generated` の生成 hook を利用）
- クライアント状態: Zustand（`src/store`）
- スタイル: RN の `StyleSheet` + テーマ Context（`src/theme`。`app/_layout.tsx` の `ThemeProvider` で配布）
