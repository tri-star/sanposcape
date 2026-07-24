# モバイルアプリ 起動手順ガイド（WSL2 + Windows エミュレータ）

エミュレータ上で development build を起動して開発するための、**手動実行**の手順をまとめる。
（将来は1コマンド化したいが、慣れるまでは本手順を手で実行する想定）

- 背景・設計の詳細は [ローカル環境構築手順](./local-env.md) と [ADR-003](../adr/ADR-003-development-build-and-dev-loop.md) を参照。
- この構成の要点:
  - **エミュレータ / adb は Windows 側**、**Expo CLI / Metro は WSL2 側**で動かす。
  - Expo は WSL 側に Android SDK が無いため、`adb` 操作（reverse・起動）は**自分たちで手動実行**する。
  - react-native-maps / react-native-svg を使うため **Expo Go は不可**（development build 必須）。

---

## 全体像（3つのフェーズ）

| フェーズ | いつ | 何をする |
|---|---|---|
| A. 初回セットアップ | 最初の1回 | APK をビルドしてエミュレータにインストール |
| B. 毎回の起動 | 開発を始めるたび | エミュレータ起動 → adb reverse → Metro → アプリを開く |
| C. 再ビルド | **ネイティブが変わったとき**だけ | APK を作り直して入れ直す |

日々の開発は **B だけ**。JS/スタイル/ロジックの変更は Fast Refresh で即反映され、再ビルド不要。

---

## B. 毎回の起動手順（いちばんよく使う）

> 前提: 初回セットアップ（A）が済んでいて、エミュレータに「sanposcape」アプリが入っている状態。

### 1. エミュレータを起動する

```bash
bash scripts/mobile-tools/start-emulator.sh
# 別のAVDを使う場合: bash scripts/mobile-tools/start-emulator.sh Pixel_4_API_27
# AVD一覧: bash scripts/mobile-tools/list-avds.sh
```

非同期で起動する。ホーム画面が出るまで待つ。

### 2. adb からエミュレータが見えるか確認する

```bash
adb devices                            # emulator-5554  device が出ればOK
adb shell getprop sys.boot_completed   # 1 が返れば起動完了
```

### 3. Metro へのポート転送（adb reverse）を張る

```bash
adb reverse tcp:8081 tcp:8081
adb reverse --list                     # 「... tcp:8081 tcp:8081」が出ればOK
```

これで「エミュレータの localhost:8081 → Windows localhost:8081 → WSL の Metro:8081」が繋がる。

> ⚠️ `adb reverse` は**エミュレータを再起動すると消える**。起動のたびにこの手順3をやり直すこと。

### 4. Metro を **localhost 配信**で起動する

```bash
pnpm --filter mobile exec expo start --dev-client --host localhost
```

- `--host localhost` が重要。これが無いと Metro が LAN IP（例: `192.168.0.92:8081`）を配信し、
  エミュレータから届かず**白画面 / `java.net.ConnectException` になる**。

### 5. アプリを開く（localhost:8081 を読ませる）

`Press a`（Androidで開く）は Expo が WSL の adb/SDK を見つけられず失敗するため、**adb で直接開く**:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "exp+sanposcape://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

> または、エミュレータ内の dev client のランチャー画面で「**Enter URL manually**」に
> `http://localhost:8081` を入力してもよい。

### 6. 成功の目印

- Metro のコンソールに **`Android Bundled 1234ms index.ts (N modules)`** が出る。
- エミュレータに **`Sanpo` / `いつもの道を、ちょっと楽しい寄り道に。`** のスプラッシュ画面が表示され、
  まもなく自動でサインイン画面へ遷移する。

### 6.5 開発確認用の画面カタログを開く（表示確認）

各主要画面はプロダクト導線を辿らないと単独で開けないため、development build 上で
`/dev-screens`（`ScreenCatalog`）を直接開くとスタブデータ付きで一覧から確認できる（SS-9）。
本番ビルドでは `__DEV__` ガードにより `/` へリダイレクトされ開けない。

```bash
adb shell am start -a android.intent.action.VIEW -d "sanposcape://dev-screens"
```

同様に `/design-system`（デザイントークン/UIプリミティブ一覧）も
`sanposcape://design-system` で開ける。

### 7. Fast Refresh を使う（動作確認）

- `packages/mobile/src/features/auth/components/SplashView.tsx`（スプラッシュの実文言を持つファイル。
  `app/index.tsx` はこれを呼ぶだけの薄いルート）を編集して保存 → エミュレータに**即時反映**される。
- 手動リロード: Metro のターミナルで `r`。開発メニュー: `adb shell input keyevent 82`。

---

## A. 初回セットアップ（最初の1回だけ）

### A-1. development build(APK) を作る

```bash
pnpm --filter mobile exec eas build --profile development --platform android
```

- 初回は `eas login` / `eas init`（プロジェクト連携）が必要。
- ビルドは EAS クラウドで実行され、完了すると APK のダウンロードURLが出る。

### A-2. APK をエミュレータにインストールする

> **`eas build:run` は使わない。** あれは Linux 版エミュレータを自前起動しようとして、
> 今回の「Windows 側エミュレータ + WSL の adb」構成では `spawn emulator ENOENT` で失敗する。
> 代わりに **APK を直接 `adb install`** する。

```bash
cd packages/mobile

# 直近ビルドの APK URL を取得（jq がある場合）
URL=$(eas build:list --platform android --limit 1 --json --non-interactive \
      | jq -r '.[0].artifacts.applicationArchiveUrl')
curl -L -o /tmp/sanposcape-dev.apk "$URL"

# エミュレータが起動している状態で
adb install -r /tmp/sanposcape-dev.apk    # Success と出ればOK
```

- `jq` が無い場合は、`eas build:list` が表示するビルド詳細URL（Expoダッシュボード）をブラウザで開き、
  APK をダウンロードして `adb install -r <path>` する。
- `adb install` が「file not found」等で失敗する場合は、Windows から見えるパスに置く:
  ```bash
  mkdir -p /mnt/c/temp && cp /tmp/sanposcape-dev.apk /mnt/c/temp/
  adb install -r /mnt/c/temp/sanposcape-dev.apk
  ```

インストール後は、以降 **B の手順**で起動する。

---

## C. 再ビルドが必要になるとき

以下を変更したときは APK を作り直して入れ直す（A-1 → A-2）。それ以外（JSのみ）は不要:

- ネイティブ依存（npm の native モジュール）の追加/削除
- `app.json` のネイティブ設定・config plugin の変更
- Expo SDK / ネイティブ関連バージョンの更新

---

## 困ったとき（トラブルシュート）

| 症状 | 原因 | 対処 |
|---|---|---|
| 白画面 / `java.net.ConnectException: failed to connect to /192.168.x.x:8081` | Metro が LAN IP を配信し、エミュレータから届かない | 手順3（`adb reverse`）＋手順4（`--host localhost`）＋手順5でやり直す |
| `AVD 'xxx' が見つかりません`（一覧には見える） | `emulator -list-avds` 出力の CR(`\r`) 問題 | `list-avds.sh` は修正済み。再取得して再実行 |
| `Failed to resolve the Android SDK path` が大量に出る | Expo が WSL に Android SDK を見つけられない | **無視してよい**。adb 操作は手動で行う前提（`Press a` は使わない） |
| `eas build:run` が `spawn emulator ENOENT` | Linux 版エミュレータを自前起動しようとする | 使わない。A-2 の `adb install` を使う |
| `adb devices` にエミュレータが出ない | 起動途中 / adb 未接続 | 起動完了を待つ（`sys.boot_completed` が 1）。それでも出なければエミュレータ再起動 |
| localhost 経路でどうしても繋がらない | ネットワーク構成の問題 | フォールバックで `expo start --dev-client --tunnel`（`@expo/ngrok` 導入を聞かれたら y）。tunnel なら `adb reverse` 不要 |
| バンドルは成功（`Android Bundled`）したのに白い | JS 実行時エラー | `adb shell input keyevent 82` で開発メニュー → または Metro ログの赤いエラーを確認 |

---

## backend と繋ぐ場合（現時点は任意）

- 現在の各画面は `src/features/*/data/` の静的スタブで表示するため backend を呼ばない。
  起動確認だけなら backend 不要。
- 今後 backend と通信する画面を触るときは、backend を起動しておく（[backend ローカル環境構築手順](../../backend/docs/local-env.md)）。
- エミュレータからホストの backend へは、ビルドの `EXPO_PUBLIC_BACKEND_API_URL` を通じて到達する（`10.0.2.2` はエミュレータからホストを指すアドレス）。詳細は結線時（M4 前後）に整理する。

---

## 関連ドキュメント

- [ローカル環境構築手順](./local-env.md)
- [ADR-003: development build 前提と開発ループ](../adr/ADR-003-development-build-and-dev-loop.md)
- [ADR-004: E2E ビルド・CI 戦略](../adr/ADR-004-e2e-build-ci-strategy.md)
- ツール: `scripts/mobile-tools/`（adb ラッパー / エミュレータ起動 / AVD一覧）
