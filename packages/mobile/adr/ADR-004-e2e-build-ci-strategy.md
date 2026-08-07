# ADR-004: モバイル E2E(Maestro) のビルド方式と CI コスト戦略

## 日付

2026-07-19

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
  - **残っているのは Maestro 側の切り替えのみ**: `mobile-e2e.yml` の
    `--exclude-tags=maps-required` を外し、MVP 主要フローを CI で常時実行する作業は未了。
    したがって「MVP 主要フローが CI から除外されている」状態自体は現時点でも継続している。
    理由が「backend 未対応」から「workflow の更新が未了」に変わった点に注意。
  - フロー構成: `.maestro/` 直下＝実行対象のフロー、`.maestro/subflows/`＝`runFlow` 専用
    （Maestro は既定でワークスペース直下のみ実行する）。外部データに依存するフローには
    `maps-required` タグを付け、依存を用意できない環境では `--exclude-tags=maps-required` で
    除外できるようにする。
  - **履歴の件数・空状態は E2E で assert しない**（dev ユーザーキーが固定で、同一 CI ラン内の
    他フローの記録が残るため）。空状態の検証は Vitest（純粋関数）の責務。
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
  - **残作業（SS-21 側または後続 issue）**: `mobile-e2e.yml` の
    `--exclude-tags=maps-required` を外し、コメントアウト中の `--include-tags=maps-required`
    行と統合して `maestro test packages/mobile/.maestro/` の1コマンドにする。あわせて同ファイル
    冒頭の `TODO(SS-44)` ブロックと "Start backend" ステップ内の陳腐化コメントを削除する。

## 関連情報

- [ADR-003: development build 前提と開発ループ](./ADR-003-development-build-and-dev-loop.md)
- CI: `.github/workflows/mobile-e2e.yml` / `.github/workflows/mobile-ci.yml`
- [mobile ローカル環境構築手順](../docs/local-env.md)
- E2E 方針: [アーキテクチャガイドライン](../docs/architecture-guideline.md)
