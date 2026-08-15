# ADR-004: モバイル E2E(Maestro) のビルド方式と CI コスト戦略

## 日付

2026-07-19（初版）、2026-08-14 追補（fingerprint キャッシュの前提不整合）、
2026-08-15 追補（エミュレータ環境に起因する不安定性・キャッシュキーの絞り込み）

## コンテキスト

[ADR-003](./ADR-003-development-build-and-dev-loop.md) により本アプリは development build 前提になった。E2E(Maestro) は**実際にインストールしたアプリ**をエミュレータ/実機上で操作するため、E2E 用のビルド成果物が必要になる。ここで次の懸念がある。

- **どのビルドを E2E に使うか**: development build は Metro からJSを取得する前提で、Metro が動いていないと起動しない → CI で不安定。
- **コスト**: EAS の**クラウドビルドを CI で毎回実行すると課金**が気になる。
- 本プロジェクトの E2E 方針（`architecture-guideline`）: **認証=スタブ / backend API=実物 / モバイル機能は Maestro で再現可能なら実物、不可なら stub**。

## 決定

- **E2E には standalone な preview ビルド**（JS 埋め込み・スタブ用 env 焼き込み）を使う。日常開発の development build とは別プロファイルにする（`eas.json` の `preview`）。
  - `preview` に E2E 用 env（`EXPO_PUBLIC_AUTH_MODE=dev`、`EXPO_PUBLIC_DEV_USER_KEY=e2e-user-1`、`EXPO_PUBLIC_BACKEND_API_URL=http://10.0.2.2:8000`、`EXPO_PUBLIC_LOCATION_MODE=mock`）を焼き込む。`dev` は backend の `POST /auth/dev-session` を使う＝**backend API は実物**であり、認証の入口だけを差し替える（詳細は [ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md)）。位置情報はエミュレータの位置設定がフレークになりやすいため `mock`（東京駅固定）にする（[ADR-006](./ADR-006-location-service-real-mock.md)）。
- **地図の描画と外部データは E2E の assert 対象にしない**（SS-15 で確立）。CI の preview APK には
  Maps SDK キーを注入していないため Android の地図は灰色のままである。`/explore/places` も
  当初は CI の backend に Google の server key が無く常に 503 を返していた（→ 下記 SS-21 追補・
  SS-44 追補で解消済み）。したがって Maestro は
  「画面と主要コントロールが表示されること」までを検証し、**候補件数・地図タイルの描画は検証しない**。
  同じ理由で、ログアウトのフローは散歩開始画面からの候補選択に依存させず
  `sanposcape://settings` のディープリンクで `/settings` に入る形にする。

  **（SS-21 追補）**
  - **地図タイルの描画を assert しない方針は維持**する（CI の preview APK には Maps SDK キーを
    注入しない）。
  - 一方で **`/explore/places` が常に 503 という前提は、backend に `MAPS_MODE=fake`（決定的な
    fake provider）を入れることで解消する**（SS-44）。SS-21 時点で入れたのは `compose.yaml` の
    `environment:` に `MAPS_MODE` の受け口を追加するところまでで、backend の `Settings.maps_mode`
    と `FakeGoogleMapsProvider` 本体（提供元切り替えのロジック）は当時未実装だった（backend 対応
    は SS-44 として別タスクに切り出し）。
  - **候補の件数・名称・距離/時間の値は引き続き assert しない**（SS-44 完了後も維持）。assert
    するのは「候補が 1 件以上ある（`spot-card-0` が存在する）」までとする。
  - 実キーを CI に置く案は却下（課金とシークレット管理。ADR-004 の当初のコスト方針を維持する
    ため）。

  **（SS-44 追補: backend 側は対応済み）**
  - backend に `Settings.maps_mode` と `FakeGoogleMapsProvider`
    （`packages/backend/src/sanposcape/integrations/google_maps/fake.py`）を実装済み。
    `mobile-e2e.yml` は SS-21 時点から `ENV=test MAPS_MODE=fake` を渡しているため、
    **CI の backend は既に決定的な候補を返す**（`/explore/places` は 503 ではない）。
  - **（SS-54 で完了）** Maestro 側の切り替えも済み、`mobile-e2e.yml` は
    `maestro test packages/mobile/.maestro/` で MVP 主要フローを含む全フローを常時実行する。
  - フロー構成: `.maestro/` 直下＝実行対象のフロー、`.maestro/subflows/`＝`runFlow` 専用
    （Maestro は既定でワークスペース直下のみ実行する）。外部データに依存するフローには
    `maps-required` タグを付ける。CI は fake provider で依存を満たせるため絞り込まずに全フローを
    実行し、タグは依存を用意できないローカル環境向けの `--exclude-tags` 用に残す。
  - **履歴の件数・空状態は E2E で assert しない**（dev ユーザーキーが固定で、同一 CI ラン内の
    他フローの記録が残るため）。空状態の検証は Vitest（純粋関数）の責務。

  **（SS-42 追補）記録タブの集計値（合計距離・連続日数・推定歩数）も assert しない**。
  履歴件数と同じ理由（dev ユーザーキー固定・同一 CI ラン内の他フローの記録が混ざる）に加え、
  JST の日付境界をまたぐと値が変わるため。assert するのは「集計のロードが完了し
  `history-stats-error` が出ていないこと」+ `history-period-chart` / `history-step-goal-card`
  が表示されることまで。

  **（SS-44 追補: `eas build --local` が Orval 生成物を除外する問題への対応）**
  - `mobile-e2e.yml` の「Generate API client (Orval)」ステップでチェックアウト先には
    `src/api/generated/` を正しく生成できていても、次の `eas build --local` 実行時に
    ビルドが失敗する事象があった（`Unable to resolve module @/api/generated/...`）。
  - 原因: `eas build --local` はサンドボックス用の一時ディレクトリへプロジェクトをコピーする際、
    `.easignore` が無ければ**リポジトリ内の全 `.gitignore` ルールを再適用してファイルを除外する**
    （`eas-cli` の `src/vcs/local.ts` の挙動）。`packages/mobile/.gitignore` は
    `src/api/generated/` を除外しているため、生成済みの API クライアントが untracked ファイルとして
    アーカイブから丸ごと落とされていた。入力側の `packages/backend/openapi.yaml` は
    git 管理下のため問題なくコピーされる。
  - 対応: `packages/mobile/package.json` に EAS Build の npm hook
    `eas-build-post-install`（`pnpm install` 直後、サンドボックス内で実行される）を追加し、
    そこで `pnpm run orval` を再実行するようにした。これによりサンドボックス内で
    生成物が確実に揃う。`mobile-e2e.yml` 側の「Generate API client (Orval)」ステップは
    実質不要になったが、害はないため残置している。
  - `.easignore` で `.gitignore` の再適用自体を無効化する案は採らなかった
    （`.git`/`node_modules` 以外の除外ルールを全て手動で再定義する必要があり保守コストが高いため）。

  **（SS-44 追補: GradleのMetaspace OOMとCIハングへの対応）**
  - Orval生成物の問題を解消した後、`eas build --local` が Gradle の `assembleRelease` に
    自動付随する `lintVitalAnalyzeRelease`（多数のネイティブモジュールに対して並行実行される）
    で JVM の **Metaspace が枯渇し `OutOfMemoryError`** となり、`BUILD FAILED` になる事象が発生した。
  - さらに悪いことに、Gradle自体は失敗して終了しているのに **Javaのワーカー子プロセスが
    後片付けされず残存**し、`eas-cli-local-build-plugin`（親のNodeプロセス）がその終了を
    待ち続けて**ステップが完了しないままハングする**（GitHub Actions上は `in_progress` の
    まま数十分〜居座る）という二次的な問題も確認した。
  - 対応:
    - `app.config.ts` に config plugin（`withAppBuildGradle`）を追加し、
      `android/app/build.gradle` の `android { }` ブロックへ `lint { checkReleaseBuilds = false }`
      を注入。`lintVitalAnalyzeRelease` タスク自体を `assembleRelease` の依存グラフから外し、
      OOMの原因を根本から取り除いた。**E2E用のpreviewビルド（内部配布専用）にリリース品質ゲートの
      Lintは不要**という判断による（本番配布用ビルドではこの限りではない）。
    - `mobile-e2e.yml` の「Build preview APK」ステップに `timeout-minutes: 40` を設定。
      lint-vital無効化後は通常10分台で終わる想定だが、**別の原因で同種のハングが再発しても
      CIが自動で失敗し、手動キャンセルなしにログを回収できる**ようにする安全策。
- **CI では EAS クラウドビルドを使わない**。ランナー上で `eas build --local` を実行し、**クラウドビルド枠を消費しない**。
- **`@expo/fingerprint` でネイティブ影響入力のハッシュを計算し、APK をキャッシュ**する。fingerprint が変わらない限り再ビルドしない（＝JSのみの変更では APK を作り直さない）。
- **E2E の実行頻度を分離**する:
  - 常時（PR毎・安価）: lint / typecheck / **Vitest**（`mobile-ci.yml`、ビルド不要）。
  - E2E（重い）: **nightly / 手動 / ネイティブ変更時（native影響パスへの push）のみ**（`mobile-e2e.yml`）。

## 検討した選択肢

### E2E に使うビルド

#### 選択肢1: standalone preview ビルド（採用）

- **メリット**: Metro 不要で自己完結。CI で決定的に動く。スタブ設定を焼き込める。
- **デメリット**: development build とは別にビルドが要る。

#### 選択肢2: development build を E2E にも流用

- **メリット**: ビルドが1種類。
- **デメリット**: Metro 依存で CI が不安定。E2E 用のスタブ設定の切替が煩雑。

### CI のビルド方式

#### 選択肢1: `eas build --local` + fingerprint キャッシュ（採用）

- **メリット**: **EAS クラウド枠を消費しない**。署名/バンドルは EAS CLI が面倒を見る。fingerprint で再ビルドを最小化。
- **デメリット**: ランナーに Android ビルド環境が要り CI 時間は増える。初回にクレデンシャル準備が必要。

#### 選択肢2: EAS クラウドビルドを毎回実行

- **メリット**: 設定が単純。
- **デメリット**: **課金**が読みにくく、頻度が上がると高コスト。今回の懸念そのもの。

#### 選択肢3: 素の `expo prebuild` + Gradle

- **メリット**: EAS 非依存。
- **デメリット**: 署名・バンドル設定を自前で用意する必要があり手間。`eas build --local` の方が楽。

## 決定理由

- E2E は**再現性**が命なので、Metro に依存しない standalone(preview) を使うのが妥当。
- コスト懸念に対し、`eas build --local`（クラウド枠を使わない）＋ **fingerprint による APK キャッシュ**＋**実行頻度の分離**で、「ほとんどの PR ではビルドが走らない・E2E も回る」を両立できる。
- fingerprint は「ネイティブに影響する入力」のハッシュなので、JS のみの変更ではキャッシュヒットし再ビルドを避けられる（本質的に正しいキャッシュキー）。

## 影響

### ポジティブな影響

- E2E がネットワーク/Metro 非依存で決定的に動く。
- EAS クラウドビルドの課金を基本的に発生させない。
- ネイティブ未変更なら APK を再利用でき、CI が速く・安くなる。

### ネガティブな影響・トレードオフ

- E2E 用に `preview` プロファイルとビルド経路を別途保守する必要がある。
- `eas build --local` のためランナーに Android ビルド環境が必要で、キャッシュミス時の CI 時間は長い。
- 初回運用に EAS アカウント連携（`EXPO_TOKEN`）と Android クレデンシャルの準備が要る。

### 移行・対応が必要な事項

- リポジトリ Secrets に `EXPO_TOKEN` を設定し、Android クレデンシャル（credentials.json 等）を用意する。
- 認証などのモード切り替えを `EXPO_PUBLIC_AUTH_MODE` で読む実装は **SS-10 で実装済み**（`src/config/authMode.ts`）。`preview` の env はその受け皿。
- backend を E2E ジョブ内で `10.0.2.2:8000` に到達可能な形で起動する（`mobile-e2e.yml` に実装済み）。E2E ジョブは backend を **`AUTH_MODE=dev`** で起動する必要がある（`/auth/dev-session` を有効化するため）。`mobile-e2e.yml` は既に `AUTH_MODE=dev` を設定済み。
- `MAPS_MODE=fake` を backend に届ける経路は **SS-21（`packages/backend/compose.yaml` の
  `environment:` に `MAPS_MODE: ${MAPS_MODE:-real}` の受け口を追加、`mobile-e2e.yml` から
  `MAPS_MODE=fake` を渡す）と SS-44（backend の `Settings.maps_mode` と
  `FakeGoogleMapsProvider` 本体を実装）で完了済み**。CI の backend は既に fake provider で
  決定的な候補を返す。
  - **SS-54 で完了**: `mobile-e2e.yml` の Maestro 実行を
    `maestro test packages/mobile/.maestro/` の1コマンドに統合し（タグによる絞り込みを廃止）、
    同ファイル冒頭の TODO ブロックと実行ステップ内の陳腐化コメントを削除した。
    これにより MVP 主要フローが CI で常時実行される。

## 追補: fingerprint キャッシュと E2E の前提の不整合（2026-08-14）

### 問題

当初の決定は「fingerprint は『ネイティブに影響する入力』のハッシュなので、JS のみの変更では
キャッシュヒットし再ビルドを避けられる（本質的に正しいキャッシュキー）」としていたが、これは
**standalone preview ビルドが JS をビルド時に埋め込む**という前提と両立しなかった。
development build（Metro からJSを都度取得）であればこの理屈は正しいが、E2E に使う preview
ビルドはまさに Metro 非依存にするために JS をバンドルへ焼き込んでいる（本ADRの「決定」参照）。
そのため、UI/ロジックなど JS のみの変更（例: SS-57 のゲスト導線ボタン追加）があっても
APK キャッシュキーは変わらず、**古い JS を埋め込んだままの APK が使われ続ける**。一方で
Maestro フロー（`.maestro/**`）は当時の `push` トリガー対象に含まれていたため新しいUI要素を
アサートするように更新され、「アプリのバグではないのに E2E が落ち続ける」状態になっていた
（2026-08-10 にビルドされたキャッシュが 2026-08-13 の SS-57 マージ後も再利用され、
`sign-in-guest-button` を探すフローが要素未検出で失敗。run 31811792167 / 31813105115 で確認）。

### 対応

- **APK キャッシュキーに `packages/mobile` のソース全体のハッシュ（`git ls-files -s` ベース）を
  合成**し、ネイティブ影響入力に限らずどんな変更でも再ビルドされるようにした
  （`mobile-e2e.yml` の "Compute build cache key" ステップ）。「JSのみの変更ではキャッシュヒット」
  という当初の設計方針は撤回する。
  （**2026-08-15 追補**: 「ソース全体」から `.maestro/` / `docs/` / `adr/` の3ディレクトリを
  除外した。詳細は下記「追補: エミュレータ環境に起因する不安定性への対応」の問題3を参照。）
- 上記によりコスト最適化（JSのみのPRでは再ビルドしない）が失われる埋め合わせとして、
  **自動実行トリガーを `push`（ネイティブ影響パスへの変更時）から廃止し、毎週土曜 08:00 JST の
  定期実行 + 手動実行（`workflow_dispatch`）のみ**に変更した。E2E 自体の実行頻度が
  大幅に下がるため、実行の都度ほぼ確実にビルドが発生しても許容できると判断した。

### 影響の更新

- 「ネイティブ未変更なら APK を再利用できる」というポジティブな影響は、「**ソースが全く
  変わっていない場合**（同一コミットへの再実行・手動再実行など）のみ APK を再利用できる」に
  縮小した。
- E2E は main への push で自動実行されなくなったため、**ネイティブ影響のある変更をマージしてから
  実際に E2E で検証されるまで最大1週間のタイムラグが生じる**。検証を急ぐ場合は
  `workflow_dispatch` での手動実行を都度行う必要がある。

## 追補: エミュレータ環境に起因する不安定性への対応（2026-08-15）

本ADRは当初「E2E は再現性が命」としてビルド方式の決定的さに注力していたが、実際に E2E を
定常運用してみると、**不安定性の主因はアプリでもビルドでもなく CI エミュレータ環境そのもの**
だった。ここでは調査で判明した事実と、それに対する決定を残す。以下はいずれも
「アプリの不具合ではないのに E2E が落ちる」類の問題であり、放置すると
[SS-57 のときと同様に E2E の信頼性が失われる](#追補-fingerprint-キャッシュと-e2e-の前提の不整合2026-08-14)。

### 問題1: GNSS デッドロックによる system_server の強制終了

`google_apis` イメージでは Play Services 側の位置プロバイダが GNSS を start/stop し続け、
これがエミュレータの GNSS HAL をデッドロックさせる。Watchdog が `android.fg` スレッドの
ブロックを検知して **system_server ごと強制終了**するため、以降の全 adb 操作が
`Can't find service: package` で失敗し、実行中のフロー以降がすべて巻き添えで落ちる
（run 31819288121 / 31829640836 で同一スタックを確認）。

```
W/Watchdog: *** WATCHDOG KILLING SYSTEM PROCESS: Blocked in handler on foreground thread (android.fg) for 76s
    at GnssStatusProvider.onReportStatus / GnssNative.native_stop
    at GnssLocationProvider.stopNavigating / updateRequirements / onSetRequest
```

**決定: `adb root` した上で `pm disable` により GMS の位置プロバイダを無効化する。**

```
adb root && adb wait-for-device
adb shell pm disable --user 0 com.google.android.gms/com.google.android.location.fused.FusedLocationService
adb shell pm disable --user 0 com.google.android.gms/com.google.android.location.internal.GoogleLocationManagerService
adb unroot && adb wait-for-device
```

ここに至るまでに3つの誤った対策を経ており、**同じ轍を踏まないよう失敗した理由を残す**。

1. **`cmd location set-location-enabled false` だけでは止まらない**（run 31829640836）。
   ユーザー向けの位置情報トグルを落としても GNSS HAL
   `android.hardware.gnss-service.ranchu` は `Gnss:onGnssLocationCb` を出し続けて実際に測位しており、
   `GnssLocationProvider` の start/stop はフロー境界ごとに繰り返されていた。要求元を断つ必要がある。
2. **shell UID のままではコンポーネントを無効化できない**（run 31884618163）。
   `SecurityException: Shell cannot change component state` で拒否される。AOSP の
   `PackageManagerService.setEnabledSettings` は、`callingUid == SHELL_UID` のとき
   「パッケージ単位（`className == null`）の ENABLED / DISABLED_USER 切り替え」のみを許可し、
   コンポーネント単位の指定は TEST_ONLY パッケージ以外一律で禁止する。
   `google_apis` イメージは userdebug なので `adb root` でこの分岐ごと回避できる。
3. **コンポーネントに `pm disable-user` は使えない**（run 31891552311）。root 化して
   SecurityException が消えても結果は `new state: default` のままだった。同関数のコンポーネント
   処理は ENABLED / DISABLED / DEFAULT の3つでしか `switch` しておらず、`disable-user` が送る
   `DISABLED_USER`(3) は `default` 節に落ちて
   `Failed setComponentEnabledSetting: ... requested an invalid new component state` を
   ログに出すだけで捨てられる。**コンポーネントには `pm disable`（DISABLED=2）を使う。**
   一方パッケージ単位（下記の問題2）はアプリ単位の状態として正しく扱われるため
   `disable-user` のままでよい。この非対称性が紛らわしい。

**検証方法**: ジョブログに `Component {...} new state: disabled` が出ること。`default` は
「無効化されなかった」を意味するので、成功と読み違えないこと。GNSS が実際に止まったかは
失敗時 artifact の logcat から `Gnss:onGnssLocationCb` が消えたかで確認する。

### 問題2: エミュレータの飢餓（CPU/IO 逼迫）

Play Services 群のバックグラウンド処理でランナーが飽和し、アプリの描画が約1fpsまで低下
（`EGL app_time_stats avg≈1000ms`）、`pm clear` が13分54秒かかるといった状態になっていた。
これは問題1の Watchdog タイムアウトを誘発するだけでなく、**タップの取りこぼし**も引き起こす
（run 31824150888: 正しい座標に MotionEvent が届いているのに終了ダイアログが開かなかった）。

**決定: E2E に不要な Google アプリと background dexopt を無効化する。**
logcat の行数で負荷源を実測して対象を決めた（GMS 約4700行 / GSA 2369 /
settings.intelligence 1599 / GNSS HAL 933 / Bugle 898 / AiAi 592）。

```
adb shell pm disable-user --user 0 com.google.android.googlequicksearchbox
adb shell pm disable-user --user 0 com.google.android.apps.messaging
adb shell pm disable-user --user 0 com.google.android.as
adb shell pm disable-user --user 0 com.google.android.settings.intelligence
adb shell cmd package bg-dexopt-job --disable
```

**ネットワークには触れない**こと。backend へ `10.0.2.2:8000` で到達する必要がある。

**決定: タップの取りこぼしは Maestro の `retry` コマンドで吸収する。**
Maestro 側の再タップ機構（`retryTapIfNoChange`）には頼れない。現行版では既定で無効な上、
有効化しても `hierarchyBasedTap` は「タップ前後でビュー階層が変化した＝効いた」と解釈するため、
経過時間・距離・歩数が毎秒書き換わる散歩中画面では常に真になり再タップされないためである。
`retry` は `MaestroException`（アサーション失敗・要素が見つからない）でのみ再試行して他は
伝播させるので、アプリが実際に壊れている場合はきちんと失敗する（不具合の握り潰しにはならない）。

### 問題3: キャッシュキーが広すぎた

2026-08-14 の追補で「`packages/mobile` のソース全体」をキーに含めた結果、**APK の中身に一切
影響しないファイルの変更でも約30分の再ビルド**が走るようになっていた
（run 31884618163: Maestro フローを1行直しただけで29分30秒のビルド。E2E 本体は3分46秒）。

**決定: `packages/mobile` のうち `.maestro/` / `docs/` / `adr/` をキーから除外する。**
いずれもソースから `import`/`require` されておらず Metro のバンドル対象外であることを確認済み。
run 31898755204 でビルドがスキップされ、ジョブ全体が 36分53秒 → **6分35秒**になった。

ただしこの除外は 2026-08-14 の追補で直した「古い APK が使い回される」バグを再発させうる操作でも
ある。**除外を追加する際は必ず「そのパスがソースから参照されないこと」を確認する。**

### 影響

#### ポジティブな影響

- E2E の実行時間が短縮された（Maestro 実行 3m11s / ジョブ全体 6m35s）。
- フロー定義やドキュメントの修正がキャッシュヒットで回せるようになり、E2E の
  イテレーションコストが下がった。

#### ネガティブな影響・トレードオフ

- **`google_apis`（userdebug）イメージ前提の構成になった**。`adb root` が使えない
  `google_apis_playstore` へ切り替える場合、問題1の対策が成立しなくなる。
- エミュレータを「素の状態」から遠ざけたため、**実機との乖離が広がった**。ここで無効化した
  コンポーネントに依存する機能は E2E で検証できない（現状のアプリは依存していない）。
- CI 環境を整えるための adb 操作が増え、`mobile-e2e.yml` の script が長くなった。
  イメージやAPIレベルを上げる際は、これらのコマンドが依然有効かの再確認が要る。

#### 未解決の事項

- 問題1の対策が入った状態での成功は run 31898755204 の1回のみ。この事象はもともと断続的
  （直近の失敗は4ランのうち2回）なので、**再発しないと断定できる段階にはない**。
- 再発した場合は、失敗時 artifact の logcat に `Gnss:onGnssLocationCb` が残っているかを見れば、
  GNSS 経路がまだ生きているのか別要因なのかを切り分けられる。

## 関連情報

- [ADR-003: development build 前提と開発ループ](./ADR-003-development-build-and-dev-loop.md)
- CI: `.github/workflows/mobile-e2e.yml` / `.github/workflows/mobile-ci.yml`
- [mobile ローカル環境構築手順](../docs/local-env.md)
- E2E 方針: [アーキテクチャガイドライン](../docs/architecture-guideline.md)
