# モバイルアプリ 起動手順ガイド（WSL2 + Androidエミュレータ / iPhone実機）

AndroidエミュレータまたはiPhone実機でdevelopment buildを起動して開発するための、
**手動実行**の手順をまとめる。
（将来は1コマンド化したいが、慣れるまでは本手順を手で実行する想定）

- 背景・設計の詳細は [ローカル環境構築手順](./local-env.md) と [ADR-003](../adr/ADR-003-development-build-and-dev-loop.md) を参照。
- この構成の要点:
  - Androidでは、**エミュレータ / adb は Windows 側**、**Expo CLI / Metro は WSL2 側**で動かす。
  - Expo は WSL 側に Android SDK が無いため、`adb` 操作（reverse・起動）は**自分たちで手動実行**する。
  - iPhoneでは、iPhoneとPCを同じLANへ接続し、WSL2上のMetroを`--host lan`で公開する。
  - react-native-maps / react-native-svg / react-native-nitro-google-signin（Google サインイン）/
    expo-secure-store（refresh token の永続化）/ **expo-location（現在地取得）** を使うため
    **Expo Go は不可**（development build 必須）。
    **SS-10（認証まわりのネイティブ依存を追加）および SS-15（expo-location の追加・Maps キー注入）
    適用後は development build の作り直しが必要**
    （C. 再ビルドの手順を実施すること。Fast Refresh では反映されない）。

---

## Androidの全体像（3つのフェーズ）

| フェーズ | いつ | 何をする |
|---|---|---|
| A. 初回セットアップ | 最初の1回 | APK をビルドしてエミュレータにインストール |
| B. 毎回の起動 | 開発を始めるたび | エミュレータ起動 → adb reverse → Metro → アプリを開く |
| C. 再ビルド | **ネイティブが変わったとき**だけ | APK を作り直して入れ直す |

日々の開発は **B だけ**。JS/スタイル/ロジックの変更は Fast Refresh で即反映され、再ビルド不要。

---

## B. Android: 毎回の起動手順（いちばんよく使う）

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

- `--host localhost` が重要。これが無いと Metro が LAN IP（例: `<PC_LAN_IP>:8081`）を配信し、
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
  保存済みセッションを復元できた場合は散歩開始画面へ、復元できない場合はサインイン画面へ自動で遷移する。

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

## iPhone実機: 毎回の起動手順

> 前提: [iPhone実機 development build手順](./iphone-device-development.md)に従い、
> development buildのインストールとDeveloper Modeの有効化が済んでいること。

### 1. iPhoneとPCを同じLANへ接続する

iPhoneを、PCと同じLANに属するWi-Fiへ接続する。ゲストWi-Fiなど、端末間通信を遮断する
AP isolation / client isolationが有効なネットワークは使用しない。

### 2. Hyper-VファイアウォールでMetroを許可する（PCごとに初回のみ）

WSL2のmirrored networkingでは、LANからWSLへの受信通信をHyper-Vファイアウォールが制御する。
[iPhone実機 development build手順の手順6](./iphone-device-development.md#6-hyper-vファイアウォールでmetroを許可する)
に従い、開発中にMetroが使うポートをローカルサブネットからだけ許可する。
すでにルールを作成済みの場合、この手順は不要。

### 3. MetroをLAN配信で起動する

リポジトリルートで次を実行する。

```bash
pnpm --filter mobile exec expo start --dev-client --host lan
```

Metroに表示されるURLが`http://<PC_LAN_IP>:8081`のようなLANアドレスになっていることを確認する。
8081が使用中の場合は、Expoの確認に`yes`と回答して次のポートを使用し、そのターミナルに表示された
QRコードを読み取る。PCの現在のLAN IPは`hostname -I`で確認できる。

> Androidの`--host localhost`は、`adb reverse`で端末側のlocalhostをMetroへ転送しているから利用できる。
> iPhoneにはこの転送がないため、`localhost`ではなく`lan`を指定する。

### 4. iPhoneでdevelopment buildを開く

1. iPhoneのカメラでMetroのQRコードを読み取る。
2. 表示されたdevelopment build用リンクを開く。
3. または、`sanposcape`のdevelopment buildを開き、Development Serversから起動中のサーバーを選ぶ。

### 5. 成功の目印

- Metroのコンソールに**`iOS Bundled 1234ms index.ts (N modules)`**のようなログが出る。
- iPhoneに**`Sanpo` / `いつもの道を、ちょっと楽しい寄り道に。`**のスプラッシュ画面が表示され、
  保存済みセッションを復元できた場合は散歩開始画面へ、復元できない場合はサインイン画面へ自動で遷移する。
- JS、TypeScript、スタイルの変更がFast Refreshで反映される。

### 6. LAN接続できない場合

次の順に確認する。

1. iPhoneとPCが同じLANに接続されているか。
2. Metroに表示されたLAN IPとポートのQRコードを読み取っているか。
3. 手順2のHyper-Vファイアウォールルールが作成され、有効になっているか。
4. Wi-FiのAP isolation / client isolationが有効になっていないか。

LAN経路を利用できない環境に限り、フォールバックとして
`pnpm --filter mobile exec expo start --dev-client --tunnel`を使用する。

---

## A. Android: 初回セットアップ（最初の1回だけ）

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

## C. Android: 再ビルドが必要になるとき

以下を変更したときは APK を作り直して入れ直す（A-1 → A-2）。それ以外（JSのみ）は不要:

- ネイティブ依存（npm の native モジュール）の追加/削除
- `app.json` / `app.config.ts` のネイティブ設定・config plugin の変更（Maps SDK キーの注入も含む）
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
| iPhoneでdevelopment serverが見つからない | LAN経路またはファイアウォールの問題 | iPhone手順6を確認し、解消できない場合だけ`--tunnel`を使う |
| エミュレータで、権限を許可し Extended controls の "Set Location" もしたのに、数十秒待って現在地の取得に失敗する | `getCurrentPositionAsync` の精度指定が `Balanced` だと `PRIORITY_BALANCED_POWER_ACCURACY` になり、fused provider が GPS を起動せずネットワーク測位に頼る。エミュレータの "Set Location" は **GPS プロバイダ**に fix を注入するため拾われず、内部タイムアウトまで待って `ERR_CURRENT_LOCATION_IS_UNAVAILABLE` になる | `Accuracy.High` 以上を使う（`src/services/location/location.real.ts` で対応済み）。あわせて権限ダイアログで**「正確な位置情報」**が選ばれているか確認する（「おおよその位置情報」だと `GRANULARITY_PERMISSION_LEVEL` により coarse に制限され同様に失敗する）。位置を与え直すには `adb emu geo fix <経度> <緯度>` も使える |
| AVD で位置情報が全く動かない | AOSP イメージには Google Play services が無く `FusedLocationProviderClient` を使えない | `adb shell pm list packages \| grep com.google.android.gms` で確認する。何も出ない場合は Google APIs / Google Play 入りのシステムイメージで AVD を作り直す（`adb shell getprop ro.product.name` が `sdk_gphone...` なら Google イメージ） |

---

## backend と繋ぐ場合

- **`app/_layout.tsx` が起動時に `initAuth()` を呼び、`dev` モードのサインインは backend の
  `POST /auth/dev-session`（`AUTH_MODE=dev` で起動した backend）を叩く**。そのため
  「起動確認だけなら backend 不要」だったのは M3(SS-10) より前の話で、現在は認証を通す・
  サインインを試す場合は backend の起動が必要（[backend ローカル環境構築手順](../../backend/docs/local-env.md)）。
  画面カタログ等の一部は静的スタブのままなので、backend を起動せずに画面表示だけを確認することは
  引き続き可能。
- **SS-15 以降、散歩開始画面（`/walk-start`）は backend の `POST /explore/places` に依存する**ため、
  静的スタブでの確認はできない。backend 未起動、または backend の `GOOGLE_MAPS_SERVER_API_KEY`
  未設定（＝常に 503）の場合は、エラー文言 + 再試行ボタンの表示になる（アプリ側のバグではない）。
- **SS-19 以降、散歩サマリ画面（`/walk-summary`）の保存確定は backend の `POST /walks` に依存する**。
  サマリ自体の表示はローカルのドラフト（`useFinishedWalkStore`）だけで完結するため backend 未起動でも
  開けるが、保存は失敗し `WalkSaveStatus` に再試行導線が出る。
- **SS-20 以降、記録タブの「最近の散歩」・`/walk-history`（一覧）・`/walk-history/[walkId]`（詳細）は
  backend の `GET /walks` / `GET /walks/{walk_id}` に依存する**ため、静的スタブでの確認はできない。
  backend 未起動、または未認証（401）の場合はエラー文言 + 再試行導線（一覧・詳細とも）になる。
- 同じ画面は現在地の取得も行う。エミュレータで位置が取れない場合は
  `adb shell` 経由の `adb emu geo fix <経度> <緯度>` で位置を与えるか、`.env` の
  `EXPO_PUBLIC_LOCATION_MODE=mock`（東京駅固定）で起動する。
- エミュレータからホストの backend へは、ビルドの `EXPO_PUBLIC_BACKEND_API_URL` を通じて到達する（`10.0.2.2` はエミュレータからホストを指すアドレス）。

---

## 関連ドキュメント

- [ローカル環境構築手順](./local-env.md)
- [iPhone実機 development build手順](./iphone-device-development.md)
- [ADR-003: development build 前提と開発ループ](../adr/ADR-003-development-build-and-dev-loop.md)
- [ADR-004: E2E ビルド・CI 戦略](../adr/ADR-004-e2e-build-ci-strategy.md)
- ツール: `scripts/mobile-tools/`（adb ラッパー / エミュレータ起動 / AVD一覧）
