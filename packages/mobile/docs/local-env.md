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
- ネイティブ依存の追加・削除、config plugin、Android Maps SDK key の注入など native 設定を変更した場合は、
  development build の作り直しが必要（Fast Refresh では反映されない）。

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

位置情報は `src/services/location` が `EXPO_PUBLIC_LOCATION_MODE`（`real` / `dev` / `mock`）で切り替える。
`real` は foreground permission と実機位置情報を使い、`dev` / `mock` は東京駅周辺の固定座標を返す。
preview E2E build は `dev` を焼き込むため、Maestro 実行で端末の位置情報権限や実位置には依存しない。

Android の地図表示には `ANDROID_GOOGLE_MAPS_API_KEY` が必要で、`app.config.ts` が native build 時にだけ
Google Maps SDK へ注入する。`EXPO_PUBLIC_` を付けず、Android application restriction を設定し、
リポジトリへコミットしない。iOS の既定 provider は Apple Maps のため、この key は不要である。

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
- `ANDROID_GOOGLE_MAPS_API_KEY` を development / preview / production build 時に注入する。
  `app.config.ts` がこの値を `android.config.googleMaps.apiKey` にだけ渡すため、
  `EXPO_PUBLIC_*` にしてはならない。キーは Android application restriction（package name と
  signing certificate）を設定し、リポジトリにコミットしない。
- iOS は Apple Map を既定 provider とするため、この SDK key は不要。
- キーの追加・更新、`expo-location` の追加、`app.json` の plugin変更は native 変更である。
  Fast Refresh では反映されないため、development build を再作成して端末へ再インストールする。

## 現在地と散歩開始画面

- `EXPO_PUBLIC_LOCATION_MODE=real` は foreground permission を要求して現在地を取得する。
  拒否・取得失敗時はスポット検索を実行せず、画面内の再試行で復帰できる。
- `dev` / `mock` は東京駅周辺の固定座標を返す。開発時や Maestro preview build では
  `dev` を使う。実機位置情報の許可・拒否表示は development build で個別に確認する。

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

クライアントID自体は秘密情報ではないため `eas.json` へ直書きする選択肢もあるが、本タスク時点では
値が未確定のため、上記チェックリストとしてここに明記する運用とした。値が確定した時点で
`eas.json` の `production.env` に追記することも検討する。

## 状態管理・スタイルの方針

- サーバー状態: TanStack Query（`src/api/generated` の生成 hook を利用）
- クライアント状態: Zustand（`src/store`）
- スタイル: RN の `StyleSheet` + テーマ Context（`src/theme`。`app/_layout.tsx` の `ThemeProvider` で配布）
