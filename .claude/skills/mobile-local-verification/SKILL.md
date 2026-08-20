---
name: mobile-local-verification
description: "mobile(React Native / Expo)の実装をAndroidエミュレータ上で実際に動かして確認するスキル。「エミュレータで動作確認して」「実機で確認して」「散歩を開始して歩いてみて」「削除導線を確認して」のようなリクエストで使用する。エミュレータ起動・adb reverse・backend起動・Metro起動・アプリ起動までを1コマンドで整え、スクリーンショットとタップ操作で画面を検証し、GPS軌跡を流し込んで散歩の記録まで再現する。"
user-invokable: true
allowed-tools: Bash, Read, AskUserQuestion
---

# mobile ローカル動作確認スキル

Android エミュレータ上で development build を動かし、実装した画面・導線を実際に操作して確認する。

前提となる構成（**エミュレータ/adb は Windows 側、Metro は WSL2 側**）と手動手順は
[app-startup-guide.md](../../../packages/mobile/docs/app-startup-guide.md) にある。
このスキルは、その手順のうち決定論的な部分をスクリプト化し、
過去に時間を溶かした落とし穴を最初から回避することを目的とする。

## 実行環境の必須事項（最初に読む）

Claude Code から実行する場合、次のコマンドは**サンドボックス外**（`dangerouslyDisableSandbox: true`）で
実行する必要がある。理由が異なる2種類がある。

| 対象 | サンドボックス内で起きること | 理由 |
|---|---|---|
| `dev-up.sh` / `list-avds.sh` / `start-emulator.sh` / `simulate-walk.py` | `%LOCALAPPDATA%` が空文字になり `adb.exe が見つかりません` | `cmd.exe` 経由の Windows 環境変数解決ができない |
| Metro (`expo start`) | `Waiting on http://localhost:8081` と出るのに `curl` も通らず、エミュレータから接続できない | サンドボックス内で listen したソケットは外（Windows→エミュレータ）から到達できない |

一方、**`adb` は `adb ...` の形で直接実行すればサンドボックス内で動く**
（ユーザーの `sandbox.excludedCommands` に `adb *` があるため）。
`bash ~/.local/bin/adb ...` のように別コマンドで包むと除外設定に一致せず失敗するので、
必ず `adb` をコマンドの先頭に置くこと。`ui.sh` は内部で `adb` を直接呼ぶが、
`ui.sh` 自体が先頭に来るため除外設定には乗らない点に注意（`ui.sh` はサンドボックス内でも
`adb` サブプロセスが失敗するため、サンドボックス外で実行するのが確実）。

## スクリプト一覧

すべて `scripts/mobile-tools/` 配下。

| スクリプト | 役割 |
|---|---|
| `dev-doctor.sh` | 読み取り専用の診断。何も起動しない。「なぜ動かないのか」を最初に切り分ける |
| `dev-up.sh` | エミュレータ〜アプリ起動までを1コマンドで整える（冪等） |
| `ui.sh` | スクリーンショット・タップ・現在地セットなどの操作 |
| `check-explore-origin.sh` | その現在地でスポット検索が成功するかを backend 側だけで先に確認する |
| `simulate-walk.py` | GPS軌跡を流し込んで歩行を再現する |

## 手順

### ステップ0: Google Maps API キーの確認（ユーザー作業）

**キーの発行・API有効化・課金設定はユーザーにしかできない。何かを起動する前にここで確認する。**

```bash
bash scripts/mobile-tools/dev-doctor.sh
```

2つのキーは性質が違うので、扱いを分ける。

| キー | 性質 | 未設定のときの扱い |
|---|---|---|
| `GOOGLE_MAPS_SERVER_API_KEY`（`packages/backend/.env`） | api コンテナが**起動時に読む実行時設定**。未設定だと `/explore/places` がログを一切残さず 503 を返す | **ハードストップ。ユーザーに設定を依頼する**（`dev-up.sh` も停止する） |
| `GOOGLE_MAPS_ANDROID_SDK_KEY`（`packages/mobile/.env`） | `app.config.ts` 経由で **APK に焼き込むネイティブ設定**。インストール済みの development build が既に持っていればローカルが空でも地図は出る | 警告のみ。**APK を作り直すときだけ**ユーザーに依頼する |

ユーザーに依頼するときは次を伝える。

- Google Cloud で **Places API (New)** と **Routes API** を有効化し、APIキーを発行する
- `packages/backend/.env` の `GOOGLE_MAPS_SERVER_API_KEY` に設定する
- 設定後は **api コンテナの作り直しが必要**
  （コンテナは作成時の環境変数を保持するので `.env` の書き換えだけでは反映されない）

  ```bash
  docker compose --project-directory packages/backend -f packages/backend/compose.yaml up -d --force-recreate api
  ```

キー無しでも確認できる範囲:

| やりたいこと | 方法 |
|---|---|
| backend に依存しない画面の表示のみ | `SKIP_BACKEND=1 bash scripts/mobile-tools/dev-up.sh` |
| 合成データで散歩導線まで通す | `packages/backend/.env` に `MAPS_MODE=fake` を設定して api コンテナを作り直す |

### ステップ1: 環境を立ち上げる

```bash
bash scripts/mobile-tools/dev-up.sh
```

冪等なので、途中で失敗しても何度でも実行してよい。次を順に整える。

1. エミュレータ起動 + ブート完了待ち（AVD 未指定なら実在する先頭の AVD を自動選択）
2. `adb reverse` を **Metro(8081) と backend の両方**に張る
3. backend の `docker compose up -d` + `alembic upgrade head`
4. Metro を `--host localhost` で起動し、`/status` への到達を確認
5. development build を**必ず再起動**して Metro に接続し、バンドル完了を待つ

所要時間の目安は、すべて起動済みなら15秒程度、エミュレータのコールドブートを含むと5〜10分。
失敗したら `dev-doctor.sh` で切り分ける。

> `adb reverse` は**エミュレータを再起動すると消える**。挙動が急におかしくなったら
> まず `dev-up.sh` を再実行する。

> **同じ AVD を二重起動しない。** adb server が固まり、`adb devices` すら返らなくなる。
> `dev-up.sh` は既にエミュレータが居れば絶対に起動しないが、手で
> `start-emulator.sh` を叩くときは注意する。固まった場合の復旧は落とし穴の表を参照。

### ステップ2: 散歩の記録を作る（履歴・削除まわりの確認に必要）

履歴・統計・削除の確認には保存済みの散歩が要る。実際に歩いて作るのが最も実態に近い。

**先に現在地を検証する。** 駅やランドマークの真上を現在地にすると `POST /explore/places` が
503 になり、原因はサーバーログに残らない（後述の落とし穴を参照）。

```bash
bash scripts/mobile-tools/check-explore-origin.sh            # 検証済みの既定地点
bash scripts/mobile-tools/check-explore-origin.sh <緯度> <経度>
```

現在地をセットして散歩を開始し、GPS軌跡を流し込む。

```bash
bash scripts/mobile-tools/ui.sh geo 35.7050 139.7500
# 画面を操作してスポットを選び「散歩を始める」まで進める（ステップ3参照）
python3 scripts/mobile-tools/simulate-walk.py \
  --from 35.7050,139.7500 --to 35.7057,139.7493
```

目的地の正確な座標は `check-explore-origin.sh` の出力か、スポット選択後の画面から得る。

> 現在地を変えても、アプリが既に取得済みの位置はすぐには変わらない。
> 検索の原点を変えたいときは `ui.sh restart` でアプリを開き直すのが確実。

### ステップ3: 画面を操作して検証する

```bash
bash scripts/mobile-tools/ui.sh screenshot        # 出力パスを表示するので Read で開く
bash scripts/mobile-tools/ui.sh tap <X> <Y>
bash scripts/mobile-tools/ui.sh swipe <X1> <Y1> <X2> <Y2>
bash scripts/mobile-tools/ui.sh back              # ハードウェアバック
bash scripts/mobile-tools/ui.sh open dev-screens  # 画面カタログへ直接飛ぶ
bash scripts/mobile-tools/ui.sh logs              # Metro のログ
```

操作の要点:

- **座標はスクリーンショットの表示サイズではなく実機の物理ピクセルで渡す。**
  Read で画像を開くと縮小率が併記されるので（例: 923px 表示 / 1440px 実機 → 1.56倍）、
  読み取った座標にその倍率を掛ける。
- **Expo dev client の丸い歯車ボタンが画面右上に常駐し、ヘッダー右上のボタンと重なる。**
  そのまま叩くと開発メニューが開いてしまう。歯車の円より上を狙うか、
  重なっていないか毎回スクリーンショットで確かめる。
- API が絡む操作のあとは、画面だけでなく **backend のアクセスログで実際のリクエストを確認する**。
  期待どおりのメソッド・ステータス・再取得が起きているかは画面からは分からない。

  ```bash
  docker compose --project-directory packages/backend -f packages/backend/compose.yaml \
    logs api --tail 40 | grep -v 'GET /health'
  ```

### ステップ4: 片付け

確認が終わったら、起動したままにするかユーザーに確認する。停止する場合:

```bash
docker compose --project-directory packages/backend -f packages/backend/compose.yaml down
pkill -f "expo start --dev-client"   # Metro は setsid で切り離されているので明示的に止める
```

> `dev-up.sh` は Metro を `setsid` で完全に切り離して起動する。こうしないと
> 呼び出し元がパイプの EOF を待ち続けてスクリプトが返らない。
> その代わり、スクリプト終了後も Metro は生き続ける。

## 過去に踏んだ落とし穴

いずれも実際に時間を溶かしたもの。同じ症状が出たらここを見る。

| 症状 | 原因 | 対処 |
|---|---|---|
| `POST /explore/places` が 503。**backend のログに警告が一切出ない** | Places が現在地そのもの（例: 東京駅）を候補に含め、出発地=目的地のため Routes が `routes: []` を返す。`client.py:160` がログ無しで例外を投げ、候補1件の失敗で検索全体が中断する | 駅の真上を避けた地点を現在地にする。事前に `check-explore-origin.sh` で確認する |
| 現在地を変えたのに検索結果が変わらない | アプリが取得済みの位置を使い続けている | `ui.sh restart` でアプリを開き直す |
| Metro が `Waiting on ...` と出ているのに白画面 / `java.net.ConnectException` | サンドボックス内で起動した Metro は外から到達できない。または `--host localhost` を付け忘れて LAN IP を配信している | サンドボックス外で `--host localhost` を付けて起動し直す（`dev-up.sh` が両方満たす） |
| `adb.exe が見つかりません: ./Android/Sdk/...` | サンドボックス内で `cmd.exe` を呼び `%LOCALAPPDATA%` が空文字になった | サンドボックス外で実行する。`adb` は直接呼べば除外設定に乗る |
| `adb shell pm list packages` が `unknown list type '\wsl.localhost...'` で失敗 | `scripts/mobile-tools/adb` ラッパーが「実在パスに一致する引数」を Windows パスへ変換する。リポジトリルートでは `packages` が `packages/` に一致する | `adb shell "pm list packages"` のように1引数へまとめる（`ui.sh` は対応済み） |
| `start-emulator.sh` が引数なしで AVD 見つからずエラー | スクリプトの `DEFAULT_AVD` が実在しない AVD を指している | AVD 名を明示する。`dev-up.sh` は実在する先頭の AVD を自動選択する |
| `adb devices` が返ってこない / 待機ループが無言で止まり続ける | Windows 側の adb server が固まっている（同じ AVD の二重起動が引き金になりやすい） | `cd /mnt/c && cmd.exe /d /c "taskkill /F /IM adb.exe"` → `adb devices` で daemon を起動し直す。`offline` から `device` に戻るまで数十秒待つ。`dev-doctor.sh` / `dev-up.sh` は先頭でこの状態を検知して即座に失敗する |
| エミュレータのブートが5分経っても終わらない | API 35 のコールドブートは実測でこれを超える | `EMULATOR_BOOT_TIMEOUT` を伸ばす（既定600秒）。途中でスクリプトを止めた場合も、二重起動を避けるため再実行で「既に接続済み」になるのを確認する |
| `adb devices` の結果を自作スクリプトで判定すると常に外れる | Windows の `adb.exe` は行末に CR を付けるため `$2` が `device\r` になる | `tr -d '\r'` を通す（`common.sh` は対応済み） |
| backend の `.env` を書き換えたのに反映されない | コンテナは作成時の環境変数を保持する | `up -d --force-recreate api` で作り直す |
| バンドルは成功しているのに白い | JS 実行時エラー | `ui.sh logs` と `ui.sh key 82`（開発メニュー） |

## 関連

- [app-startup-guide.md](../../../packages/mobile/docs/app-startup-guide.md) — 手動手順・初回セットアップ・iPhone実機
- [android-emulator](../android-emulator/SKILL.md) — エミュレータ起動と AVD 一覧だけを扱う下位のスキル
- [local-env-setup](../local-env-setup/SKILL.md) — `.env` 生成を含む初期セットアップ
