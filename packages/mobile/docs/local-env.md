# mobile ローカル環境構築手順

React Native (Expo) アプリのローカル開発手順をまとめる。
利用ライブラリは [ツール・ライブラリ](./toolsets-libraries.md)、構造は [フォルダ構造](./folder-structure.md) を参照。

## 前提

- Node.js 20+ / pnpm がインストール済みであること
- **開発ビルド（development build）が必要**（下記「重要」を参照）
- リポジトリルートで `pnpm install` 済みであること

## 重要: Expo Go ではなく development build を使う

本アプリは **react-native-maps**、**react-native-svg**（アイコン描画）、
**@react-native-community/slider**（往復時間スライダー）、**react-native-nitro-google-signin**
（Google サインイン）、**expo-secure-store**（refresh token の永続化）という
**ネイティブモジュール**を利用する。これらは **Expo Go では動作しない**ため、動作確認には Expo の
**development build**（dev client）が必要。

- Expo 公式でも、ネイティブモジュールを使うアプリは development build が推奨されている。
- 純粋なロジック（`src/lib` など）は development build なしで Vitest でテストできる。
- **SS-10（`EXPO_PUBLIC_AUTH_MODE` の real/dev/mock 切り替え）の適用後は、
  `react-native-nitro-google-signin` / `expo-secure-store` が新規追加されたネイティブ依存のため、
  development build の作り直しが必要**（Fast Refresh では反映されない）。

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
  - `maps-required`: `/explore/places` が候補を返す環境（backend の `MAPS_MODE=fake`、
    または実の `GOOGLE_MAPS_SERVER_API_KEY` 設定）が前提のフロー。無い環境では
    `--exclude-tags` で除外する。`MAPS_MODE=fake` は SS-44 で実装済みなので、
    **Google Maps のキーを持っていなくてもローカルで実行できる**。

```bash
# ローカル: preview APK を作成（EASクラウド枠を使わないローカルビルド）
pnpm --filter mobile exec eas build --local --profile preview --platform android --output e2e-build/app-preview.apk
adb install -r e2e-build/app-preview.apk

# 全フロー（CI と同じ範囲）。backend が MAPS_MODE=fake か実キーで応答できることが前提
maestro test packages/mobile/.maestro/

# 外部データに依存しないフローだけ（backend の候補を用意できない環境向け）
maestro test --exclude-tags=maps-required packages/mobile/.maestro/

# 外部データに依存するフローだけ（MVP 主要フロー + 散歩中のルート再計算フロー）
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
- CI（`.github/workflows/mobile-e2e.yml`）は EAS クラウドビルドを使わず、ランナーで自前ビルドし、`@expo/fingerprint` で APK をキャッシュ（ネイティブ未変更なら再ビルドしない）。実行は nightly / 手動 / ネイティブ変更時のみ。CI の backend は `MAPS_MODE=fake` で起動して候補を返すため、MVP フローを含む `.maestro/` 配下の全フローを常時実行する（SS-54）。
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
  2. アプリ制限（パッケージ名 `com.sanposcape.app` + 署名鍵ごとの SHA-1。認証と同じ4種。
     [Google サインイン](#google-サインイン) の表を参照）を設定する。
  3. **ローカル実行の場合**: `.env` に `GOOGLE_MAPS_ANDROID_SDK_KEY=<キー>` を設定する
     （`expo prebuild` / `expo start` / `expo config` は `.env` を読む。
     `scripts/initialize-dotenv.sh` 再実行で消えるのは他の変数と同じ注意点）。
     `.env` を経由できない/確認したい場合は、シェル変数で明示的に渡すこともできる:
     `GOOGLE_MAPS_ANDROID_SDK_KEY=xxx pnpm --filter mobile exec expo prebuild`。
  3-b. **EAS ビルド（development / preview / production）では `.env` は使われない**。
     `.env` は gitignore 済みでビルドコンテキストにアップロードされないため、
     `.env` に入れただけでは EAS 製の APK で地図が灰色のままになる。次のいずれかで注入する:
     - EAS の環境変数に登録する:
       `pnpm --filter mobile exec eas env:create --name GOOGLE_MAPS_ANDROID_SDK_KEY --value <キー>`
     - `eas build --local` の場合はシェル環境変数として渡す
     未注入でもビルド・起動は成功し**地図が灰色になるだけ**なので気付きにくい点に注意
     （`app.config.ts` はキーが無いとき `android.config` を付けない設計）。
     なお CI の E2E（`preview` プロファイル）ではキーを注入していないため地図は常に灰色であり、
     Maestro は地図描画を assert しない（ADR-004）。
  4. 反映確認: `pnpm --filter mobile exec expo config --type prebuild` の出力に
     `android.config.googleMaps.apiKey` が載っているか確認する（キー未設定時は `config` フィールド
     自体が付かず、地図はネットワーク的には動くが Android では灰色のまま描画されない）。
  5. **ネイティブ設定（`expo-location` の追加・Maps キーの注入）を反映するには development build
     の作り直しが必要**（Fast Refresh では反映されない。ADR-004 の E2E APK キャッシュも
     `@expo/fingerprint` の変化により1回はミスする）。

## 位置情報（expo-location）

- `EXPO_PUBLIC_LOCATION_MODE`（`real` | `mock`。既定 `real`）で現在地取得の実装を切り替える
  （`src/config/locationMode.ts`）。認証と異なり `dev` モードは無い（位置情報は
  Android エミュレータ / 実機の位置設定・`adb emu geo fix` で real のまま再現できるため）。
  - `real` = `expo-location`（実機/エミュレータの現在地。フォアグラウンド権限が必要）。
  - `mock` = 東京駅の固定座標（`src/services/location/location.mock.ts`。vitest や、位置情報が
    フレークになりやすい E2E（Maestro）で使う。`eas.json` の `preview` プロファイルは既定でこれ）。
- 権限文言は `app.json` の `expo-location` プラグイン（`locationWhenInUsePermission`）で設定済み。

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
   ネイティブサインインでも ID token の `aud` はこの Web クライアント ID になる。
2. **Android 用 OAuth クライアント**をパッケージ名 `com.sanposcape.app` で作成し、
   **署名鍵ごとの SHA-1 を登録**する（必要な鍵は4種）:

   | 用途 | SHA-1 の取得方法 |
   | --- | --- |
   | ローカル debug（`expo run:android`） | `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android` |
   | EAS development | `pnpm --filter mobile exec eas credentials`（Android → development） |
   | EAS preview（E2E APK） | 同上（preview プロファイル） |
   | EAS production | 同上（production。Play App Signing 利用時は Play Console 側の SHA-1 も登録） |

   - SHA-1 未登録は Android で `DEVELOPER_ERROR` という分かりにくいエラーになる（アプリ側では
     `AuthError("configuration")` に分類される）。
3. **iOS 用 OAuth クライアント**を bundle id `com.sanposcape.app` で作成し、
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` と `app.json` の `plugins` の
   `react-native-nitro-google-signin` オプション `iosUrlScheme`（逆ドメイン形式、
   `com.googleusercontent.apps.<IOS_CLIENT_ID>`）に設定する。
   - **現状 `app.json` にはプレースホルダー値**（`com.googleusercontent.apps.REPLACE_WITH_IOS_CLIENT_ID`）
     が入っている。config plugin が `iosUrlScheme`（または Firebase の `google-services.json` /
     `GoogleService-Info.plist`）を必須で要求するため、未設定のままだと `expo prebuild` /
     `eas build` が失敗する。iOS 用クライアントを作成した時点で実際の値に置き換えること。
4. **App Store 審査**: iOS で Google ログインを提供する場合、Sign in with Apple の併設が要求される
   （MVP のリリース計画に織り込む）。

### リリース前チェックリスト（production ビルド）

`eas.json` の `production` プロファイルには `env` ブロックが無く、`EXPO_PUBLIC_AUTH_MODE` 等は
未設定時 `real` にフォールバックする（fail-safe だが、これは「production では EAS 側で環境変数を
注入する」運用が前提になっているということでもある）。**production ビルドを作る前に、EAS
ダッシュボード（またはビルドコマンドの `--env-file` 等）で以下が注入されることを必ず確認する**:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`（未設定だと `signInWithGoogle()` が
  `AuthError("configuration")` を返し、実質サインイン不能になる。起動時クラッシュはしないが
  ユーザー体験としては全滅する点に注意）
- `EXPO_PUBLIC_BACKEND_API_URL`（本番 backend の HTTPS URL。未注入だと `src/config/env.ts` の
  既定値 `http://localhost:8000`（平文HTTP）にフォールバックし、実質すべてのAPI呼び出しが失敗する）
- `GOOGLE_MAPS_ANDROID_SDK_KEY`（未注入だと Android で地図が灰色のまま描画されない。
  `EXPO_PUBLIC_` ではないため JS バンドルには焼き込まれず、`app.config.ts` がビルド時に
  `android.config.googleMaps.apiKey` へ注入する。詳細は
  [Google Maps（react-native-maps）](#google-mapsreact-native-maps)）
- `EXPO_PUBLIC_LOCATION_MODE` は **production では未設定のままでよい**（未設定＝`real`。
  誤って `mock` が入ると全ユーザーの現在地が東京駅固定になるため、production には設定しない）

クライアントID自体は秘密情報ではないため `eas.json` へ直書きする選択肢もあるが、本タスク時点では
値が未確定のため、上記チェックリストとしてここに明記する運用とした。値が確定した時点で
`eas.json` の `production.env` に追記することも検討する。

## 状態管理・スタイルの方針

- サーバー状態: TanStack Query（`src/api/generated` の生成 hook を利用）
- クライアント状態: Zustand（`src/store`）
- スタイル: RN の `StyleSheet` + テーマ Context（`src/theme`。`app/_layout.tsx` の `ThemeProvider` で配布）
