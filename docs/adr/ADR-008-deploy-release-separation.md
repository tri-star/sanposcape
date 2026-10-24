# ADR-008: デプロイとリリースを分離し、公開はフィーチャーフラグとストアの手動リリースで制御する

## 現在有効な決定（要約）

> 最終更新: 2026-10-24（SS-233: mobile が見るフラグの2段階の削除、互換性台帳、計画とレビューでの互換の確認）。同日の前回: SS-230（決定8 の `version` の規則の読み方と D32 の `expo-application` を注記。決定は ADR-006・ADR-M-020 の SS-230 追補）、SS-231（最低サポートバージョンの持ち越しに、ポリシー・申告の contract 待ちへの導線を足した）。その前: 2026-10-22（SS-103: OTA の本番配信と `EXPO_TOKEN` の分離）。本節は本文（追補を含む）を要約したもので、一次記録は本文。
> 本文と食い違う場合は本節の誤りとして本節を直す。

### 決定

- **デプロイ（本番にコードを置く）とリリース（利用者に見せる）を分離し、未公開の機能はフラグ OFF のまま main にマージして本番にデプロイしてよい**。
  制御の軸は「ネイティブの配信 = ストア」「JS の配信 = EAS Update」「公開 = フィーチャーフラグ」の3つ。（本文: 決定1）
- **フラグ基盤は AWS AppConfig で、器は `sanposcape-infra` の Terraform（`live/platform`）、値は本リポジトリが所有する**。
  Profile は `feature-flags`（`AWS.AppConfig.FeatureFlags`、hosted）、Deployment Strategy は独自に作る。backend は boto3 の `appconfigdata` を直接呼び（Lambda Extension は使わない）、
  ID は SSM `/sanposcape/<env>/platform/appconfig/*` から受け取り、完全 ARN への権限の絞り込みは SAM の実行ロールポリシーで行う。（本文: 決定2）
- **mobile の公開時期は App Store の手動リリースと Google Play の公開の管理・段階的公開で制御する**。これはバイナリの配信の制御で、機能の公開はフラグで別に制御する。（本文: 決定3）
- **バージョンはアプリ別に採番し、タグ `<app>/vX.Y.Z` と GitHub Release は production へのデプロイ成功時だけ作る**。
  リリースノートは git-cliff で生成して `CHANGELOG.md` はコミットせず、mobile のキーは `app.json` の `version` のみとする。（本文: 決定4、決定5）
- **mobile（iOS）は TestFlight 配信（`mobile-production-testflight.yml`、main のみ・承認なし）と、ストアで公開した後に人が起動する
  タグ・Release の作成（`mobile-production-release.yml`、`production` Environment の承認あり）を分ける**。
  Release 作成は EAS の BUILD_ID を入力に、EAS が記録したビルドのコミットへタグを付け、再ビルドしない。
  検査（承認の前・Environment と書き込み権限なし）と作成（承認の後）の2 job に分け、承認者は Summary の version・buildNumber を
  App Store Connect で公開したビルドと照合する。
  mobile のタグの version は git-cliff で bump せず `app.json` の `version` をそのまま使い、同じ version のタグが別のコミットにあれば失敗する。
  「新機能」欄の下書きは TestFlight 配信の Job Summary にプレビューとして出す。（本文: SS-213 追補 D24〜D28）
- **フラグは「追加 → ON → 削除」の3段階で、削除まで終えて1つの機能追加とみなす**。
  **mobile が見るフラグ（`audience: "client"`）の削除は2段階**で、まず backend の分岐・定義ファイルのキーと mobile の分岐を消し、
  `/app-config` は登録簿の固定値（`true`）を AppConfig の取得の状態に関わらず返し続ける。固定値は、最低サポートバージョンが分岐を消したコードを
  ストアのバイナリに埋め込んだ最初の version 以上になってから消す（OTA で届けた版は数えない）。AppConfig の値は段階2 まで `prune` しない（段階1 より前の backend へ戻しても機能が消えないように）。
  本番で現在 OFF のフラグと、backend だけが見るフラグは1つの PR で消す。固定値の仕組みは未実装。（本文: SS-233 追補 D40）
  定義はリポジトリ内のファイルで管理し、切り替えは GitHub Actions の `workflow_dispatch`（prod は承認あり）が hosted configuration version を作って `StartDeployment` する形でだけ行う。
  認証には sam-deploy とは別の OIDC ロール `sanposcape-<env>-feature-flags` を使う。（本文: 決定6）
- **切り替えワークフローは `.github/workflows/feature-flags.yml`、定義ファイルは `packages/backend/feature-flags.json`（AppConfig FeatureFlags 形式そのもの、既定値入り）**。
  フラグの現在値の正本は AppConfig（直近に配信を完了した版）で、ワークフローは現在値を引き継いで指定の1本だけを書き換えた版を作る。
  入力は環境・フラグキー・on/off（と定義から消えたキーを削除する `prune`）、ロール ARN は Environment Variables `AWS_FEATURE_FLAGS_ROLE_ARN`、環境ごとに直列化して配信完了まで待つ。
  配信中の版が削除されて読めないときは、`from_defaults` を明示したときだけ既定値から組み立てる。
  定義ファイルのキー集合は登録簿 + 予約キーと一致させる（pytest。D40 の固定値のキーは除く予定で、仕組みは未実装）。（本文: SS-99 追補 D19〜D23、SS-233 追補 D40）
- **フラグキー・説明・クライアント公開の可否は backend のコード（`core/feature_flags.py` の `FEATURE_FLAGS`）、値と最低サポートバージョンは AppConfig が所有する**。
  キーは `_enabled` を付けない snake_case。`client_requirements` は最低サポートバージョンを属性で配る予約キーで、常に `enabled: true` に保つ。
  （本文: SS-98 追補 D7、D9）
- **API と DB スキーマの変更は expand → contract の2段階で行う**。置き換える API は `deprecated=True` で意味とスキーマを変えずに残し、
  削除は `/app-config` の最低サポートバージョン以上のクライアントだけが残ってから行う。
  列追加は「新しいコードが古いスキーマで動く隙間」が残る点に注意（本文: 決定7 の SS-171 追補）。（本文: 決定7）
- **互換のために残しているもの（mobile が見るフラグ・固定値、非推奨 API、後で必須にするリクエストの項目、後で NOT NULL にする列・消す列）は
  [互換性台帳](../compat-ledger.md)に、片付けてよい条件（最低サポートバージョン / 全環境の backend のデプロイ）とともに載せる**。
  ポリシー・申告の記述はデータ取扱い台帳 6 が正本。最低サポートバージョンを上げるときに両方を見る。（本文: SS-233 追補 D41）
- **計画（task-workflow のプラン）とレビュー（change-reviewer の観点）で、配布済みのアプリとの互換を必須の項目として確かめる**。（本文: SS-233 追補 D42）
- **OTA で届けてよいのは「公開済み機能の不具合修正」と「フラグ OFF で入る新機能」だけで、channel の付け替えでリリースを制御しない**。
  `version` を上げる PR と配布ビルドはセットで計画する。（本文: 決定8）
- **OTA の本番配信は `mobile-production-update.yml`（main のみ）で、承認の前の検査（prepare）と `production` Environment の承認の後の配信（publish）の2 job に分ける**。
  prepare は production channel が protected であることを確かめ、配信先の本番ビルド（production channel・同じ version・ストア向けの最新）を引き、
  ネイティブの fingerprint（ビルドの記録と `fingerprint:generate --build-profile production`）が違えば失敗し、OTA の JS に入りうるコミットの一覧を Summary に出す。
  OTA の JS には `eas.json` の `build.production.env` を与え、EAS の production 環境に同じ名前の変数があれば失敗する（`eas update` では EAS の値が勝つため）。
  Release Manager のトークンは `eas update` の step にだけ渡す。ロールバックは Expo の Owner が手元で行う。（本文: SS-103 追補 D34〜D37、D39）
- **`EXPO_TOKEN` は Expo の権限で2つに分ける**。`production` channel は protected で、Release Manager の robot user のトークンを
  `production` Environment の Secret に、Developer の robot user のトークンをリポジトリ Secret に、同じ名前で置く。
  job に `environment: production` を付けると Release Manager に切り替わる。TestFlight 配信（D28）は承認なしのまま。
  eas-cli は `packages/mobile` の devDependency に固定版で入れ、CI は `pnpm exec eas` を使う。（本文: SS-103 追補 D34、D38）
- **backend はフラグを一度も取得できていないときだけ全フラグ OFF に倒す**。空の応答（変化なし）では直前の値を、取得失敗では一度取得できた値（known-good）を維持する。値とセッションは Lambda の実行環境ごとに保持する。（本文: 決定2、決定9、決定9-1、SS-183 追補）
- **公開済み機能の緊急停止（kill switch、安全側 ON）は AppConfig ではなく環境変数で持つ**。`GOOGLE_MAPS_LOOP_ROUTE_ENABLED` は環境変数のまま残す。
  （本文: SS-98 追補 D8）
- **`GET /app-config` は認証不要で DB を触らず、`Cache-Control: no-store` を返す**（このヘッダーは OpenAPI には出ない）。
  `flags` は登録簿のクライアント公開フラグを必ず全部含む `dict[str, bool]`（AppConfig に値が無ければ `false`）、`minimum_supported_versions` は
  iOS / Android 別で `null` は強制アップデートしない、`config_source` は診断専用でクライアントは分岐に使わない。（本文: SS-98 追補 D1、D10）
- **ユーザー条件付きのフラグ（SS-98 追補 D2 の言う「ダークローンチ」）は採用しない**。そのため mobile はサインイン後に `/app-config` を再取得せず、
  サインアウト時のキャッシュ削除からも `/app-config` を除外している（D2 を覆すときはこの2つも見直す）。（本文: SS-98 追補 D2、SS-100 追補 D14、D15）
- **backend は `FEATURE_FLAG_MODE = real | stub`（既定 `real`、local / test 以外で `real` 以外なら起動失敗）で切り替える**。
  `APPCONFIG_*` の ID が1つでも空なら AWS を呼ばない実装に落ち、AppConfig への取得は最初にフラグを参照したリクエストで行う。（本文: SS-98 追補 D3、D5）
- **mobile はフラグ値を TanStack Query の `["app-config"]` だけで保持し、永続キャッシュは持たない**。`staleTime` 5分・`gcTime` 無期限で、
  フォアグラウンド復帰時に直近の取得試行（成功または失敗）から60秒以上経っていれば再取得し、取得中は重ねて再取得しない。（本文: SS-100 追補 D11、D14）
- **mobile は直近の成功値が無い間（初回ロード中・初回取得失敗）と、未知キー・bool 以外の値を OFF として扱う**。
  成功値があれば再取得の失敗中もその値を使い、画面を隠す判定は `pending` / `enabled` / `disabled` の3値で行う。
  キー定数は backend の登録簿の写しを自前で持ち、`config_source` は内部型から除き、`services/` の real/mock 層は作らない。（本文: SS-100 追補 D12、D13、D16、D18）
- **mobile は最低サポートバージョンを下回ると、閉じられない全画面の案内でストアへ誘導する**。判定は `/app-config` の成功値があるときだけで、
  `null`・形式不正・取得前・取得失敗では出さない（強制しない側）。散歩中と、未保存の散歩をサマリ画面などでまだ保存できる間は出さない。実行中のバージョンは
  `Constants.expoConfig.version`（`runtimeVersion` が `appVersion` のため）、ストアの URL は本番の掲載ページに固定する。
  最低バージョンを変える入力はまだ足していない。（本文: SS-101 追補 D29〜D33）
- **最初の実フラグ `pin_registration`（ピン登録, [ADR-009](./ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)）が登録され、疎通確認用の `app_config_probe` は削除済み**。
  backend の API 自体はこのフラグでガードしない（ADR-009 決定10）。（本文: SS-98 追補 D7、2026-09-21 追記 SS-88）

### 未解決・持ち越し

課題ID付きの項目（SS-97 / SS-102 / SS-103）は、2026-09-21 時点で Plane 上 Todo。

- ~~**prod が未構築**~~ → SS-97 は完了し、backend は 2026-10-01 から prod で稼働している（2026-10-17 に `backend/v0.2.0` をデプロイし、タグと Release も作られた）。（本文: 前提となる制約、移行・対応が必要な事項）
- ~~**フラグ切り替えワークフロー（SS-99）は実行実績が無い**~~ → 2026-09-22 に dev で初回を実行し、2026-10-17 に production で `pin_registration` を ON にした。
  prod には 2026-10-17 まで AppConfig の版が一度も配信されておらず、それまでの prod は全フラグ OFF（`config_source: default`）で動いていた（設計どおり）。（本文: SS-99 追補 D22、2026-10-17 棚卸し追補）
- **最低サポートバージョン（`client_requirements` の属性）を変える経路が無い**。ワークフローは現在値を引き継ぐだけで、決定6 によりコンソールからも
  操作しない。SS-101 でも足さず、最初の contract を計画するときに入力を足す。値が `null` の間はアップデートの案内は出ない。
  （本文: SS-99 追補 D23、SS-101 追補 D33）
  （**SS-231 追補**: API・DB スキーマのほかに、プライバシーポリシー・App Privacy の申告にも、古いアプリのために残している記述（contract 待ち）がある。
  最低サポートバージョンを上げたら [データ取扱い台帳](../privacy/data-inventory.md) の 6 を見る。決定は [ADR-012](./ADR-012-lp-static-site-astro-s3-cloudfront.md) の SS-231 追補）
  （**SS-233 追補**: API・DB・フラグの contract 待ちは [互換性台帳](../compat-ledger.md) に一覧した。最低サポートバージョンを上げたらこちらも見る（D41））
- **mobile が見るフラグの固定値を返す仕組みが未実装**。最初に mobile が見るフラグを消す課題（`pin_registration` の削除）で実装する。（本文: SS-233 追補 D40）
- **「最低サポートバージョン以上のアプリだけが残った」を何で判断するか（バージョン別の利用状況の出どころ）が決まっていない**。最初の contract を計画するときに決める。（本文: SS-233 追補の未解決）
- ~~**production ではフラグ切り替えワークフローをまだ実行できない**~~ → prod の `live/platform` は apply 済みで、`production` Environment に
  `AWS_FEATURE_FLAGS_ROLE_ARN` が設定され、2026-10-17 に production で実行した。（本文: SS-99 追補 D21）
- ~~**OTA の本番配信ワークフロー・`EXPO_TOKEN` の Environment Secret への移動（SS-103）が未着手**。~~
  → SS-103 で実装した。**OTA の本番配信は未実行**で、1.0.0 の本番ビルドとは fingerprint が一致しないため（owner の変更・eas-cli の追加）、初回は次の本番ビルドの後になる。
  （本文: SS-103 追補 D37、未解決）
- mobile のタグ・Release（SS-102）は iOS 分を SS-213 で実装した。TestFlight 配信は 2026-10-17 に実行済みで、Release 作成はストア公開が未実施のため未実行。Android の本番提出とタグは未整備。
  （本文: 決定4、移行・対応が必要な事項、SS-213 追補の未解決）
- **ストア側の設定（App Store の手動リリース / Google Play の公開の管理）が未実施**で、`release-runbook.md` の該当記述は未検証。（本文: 移行・対応が必要な事項）

### 変更・撤回された決定

- 決定6 の削除の段階: 「フラグの分岐とフラグ定義を1つの PR で消す」→ mobile が見るフラグは、backend が固定値を返す期間を挟んだ2段階（本文: SS-233 追補 D40）
- SS-98 追補 D1 の「フラグを削除しても古いビルドは未知キーを読めなくなるだけで壊れない」→ スキーマは壊れないが、そのキーで出し分けている機能は配布済みのアプリから消える（本文: SS-233 追補 D40）
- 本文の決定2「実行環境ごとにセッションを 1 回開く」、決定9-1 の known-good の維持、SS-98 追補 D3 の「`_lifespan`（コールドスタート時に1回実行される）」は、SS-183 まで Lambda では成り立っていなかった（Mangum が呼び出しごとに lifespan を回し、フラグの取得元を毎回作り直していた）。決定の変更ではなく、挙動を記述に合わせた（本文: SS-183 追補、[ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md) SS-183 追補）
- 取得失敗時の挙動: 「未配信・取得失敗・空の応答のいずれも全フラグ OFF」→ 一度も取得できていないときだけ全 OFF、それ以外は直前の値・known-good を維持（本文: 決定9-1、SS-98 / PR #88）
- 本文の「ネガティブな影響」にある「取得失敗で全 OFF に倒す＝公開済みの機能が突然見えなくなる」は決定9-1 以前の記述で、現在そうなるのは一度も取得できていない場合だけ
- 決定4「バージョン規則・スキップ条件は ADR-005 の SS-72 追補をそのまま他アプリへ適用する」は、mobile には適用しない。
  mobile は `app.json` の `version` をそのままタグにし、スキップ・失敗の条件も変えた（本文: SS-213 追補 D26）
- 決定4「Release 用に生成した CHANGELOG を『新機能』欄の下書きにも使う（SS-102）」→ TestFlight 配信の時点のプレビューを使う（本文: SS-213 追補 D27）
- SS-103 の「`EXPO_TOKEN` を Environment Secret に移す」→ OTA 用（Release Manager）だけを Environment Secret に置き、ビルド用（Developer）はリポジトリ Secret に残す。
  SS-213 追補の「TestFlight 配信にも Environment を付ける（D28 の見直し）」は不要になった（本文: SS-103 追補 D34）
- 決定8「ネイティブを変えたら `version` を上げる」は人の規則のまま、OTA の配信の前に fingerprint の比較で機械的にも確かめるようになった（本文: SS-103 追補 D37）
  → 「次のリリースで `version` を上げてストアで配る」と読む。変更が main に入った時点では上げない（上げると公開中の版へ OTA を出せなくなる）。
  `version` を上げるのは公開済みの次の本番 TestFlight ビルドの直前（本文: 決定8 の SS-230 注記。決定は [ADR-006](./ADR-006-mobile-app-delivery-eas-hosted.md) の SS-230 追補）
- D32 の「`expo-application` は使わない」→ ビルド番号を表示するために入れた。`version` の取得元は `Constants.expoConfig.version` のまま
  （本文: D32 の SS-230 注記。決定は [ADR-M-020](../../packages/mobile/adr/ADR-M-020-external-web-pages.md) の SS-230 追補）
- 本文の「ポジティブな影響」にある「`GOOGLE_MAPS_LOOP_ROUTE_ENABLED` もこの基盤へ移せば…」は初版時点の見込みで、現在は環境変数のまま残す（本文: SS-98 追補 D8）
- `minimum_supported_versions` の扱い: mobile は保持のみ（SS-100 追補 D17）→ 下回るとアップデートの案内を出す（本文: SS-101 追補 D29〜D32）
- 最低サポートバージョンの変更入力: 「SS-101 で必要になったら足す」（SS-99 追補 D23）→ SS-101 でも足さず、最初の contract の計画時に足す（本文: SS-101 追補 D33）
- mobile のサインイン後の `/app-config` 再取得: D2 で申し送り → 実装しない（本文: SS-100 追補 D14）
- フォアグラウンド復帰時の再取得間隔（60秒）の起点: 直近の成功時刻 → 直近の取得試行（成功または失敗）の時刻（本文: SS-100 追補 D14、SS-100 / PR #89 追補）
- mobile で永続キャッシュを持たない理由②: E2E 用 APK のキャッシュミス → development build の作り直しと依存追加の待機コスト（理由①と結論は不変。本文: SS-100 追補 D14、2026-09-20 訂正）
- `FlagDocumentSource` を `integrations` 側に置く理由: 循環 import を避けるため → 既存の依存の向きに揃えるため（配置は不変。本文: SS-98 追補 D3）
- 用語の注意（決定の変更ではない）: 本文の決定8・決定理由の「ダークローンチ」は「フラグ OFF で入る新機能」の意味で採用している。
  SS-98 追補 D2 以降の「ダークローンチ」は「ユーザー条件付きのフラグ」の意味で不採用。両者は別物
- 疎通確認用フラグ `app_config_probe`: 「最初の実フラグが入った時点で削除する」（予定）→ **削除済み**。
  `pin_registration`（ADR-009）が最初の実フラグとして登録された（本文: SS-98 追補 D7、2026-09-21 追記 SS-88）

## 日付

2026-09-20（初版、SS-104）、2026-09-20 追補（SS-98: `/app-config` のレスポンススキーマと
フラグ取得基盤）、2026-09-20 追補（SS-100: mobile のフラグ受け皿）、2026-09-21 追補
（SS-100: PR #89 レビュー対応でフォアグラウンド復帰の再取得判定を精密化）、2026-09-21 追補
（SS-93: SS-96 の完了を反映）、2026-09-21 追補（SS-88: `pin_registration` を最初の実フラグ
として追加し `app_config_probe` を削除）、2026-09-21 追補（SS-99: フラグ切り替えワークフローと
定義ファイル）、2026-10-01 追補（SS-148: D16 の表示範囲の注記）、2026-10-04 追補（SS-183: Lambda で
lifespan が呼び出しごとに走っていた事実の訂正）、2026-10-04 追補（SS-171: 決定7 に列追加の隙間と応答側のフィールド追加の扱い）、
2026-10-17 追補（SS-213: mobile（iOS）の本番の TestFlight 配信と公開後のタグ・Release の作成）、2026-10-17 棚卸し追補（prod の稼働とフラグ切り替えの実行を反映）、
2026-10-17 追補（SS-101: mobile の最低サポートバージョンを下回るアプリへのアップデートの案内）、
2026-10-22 追補（SS-103: OTA の本番配信と `EXPO_TOKEN` の分離）、
2026-10-24 追補（SS-231: ポリシー・申告の contract 待ちへの導線のみ。決定は ADR-012）、
2026-10-24 注記（SS-230: 決定8 の `version` の規則の読み方、D32 の `expo-application`）、
2026-10-24 追補（SS-233: mobile が見るフラグの2段階の削除、互換性台帳、計画とレビューでの互換の確認）

## ステータス

採用（SS-104 で決定）。実装は SS-94 / SS-95 / SS-96 / SS-97 / SS-98 / SS-99 / SS-100 / SS-101 /
SS-102 / SS-103 に分かれており、2026-09-20 時点では SS-94（AppConfig の器）・SS-95（境界への
読み取り権限追加）・SS-98（backend の取得基盤と `/app-config`）・SS-100（mobile のフラグ受け皿）が
完了し、残りは未着手である。
（**SS-93 追補**: 2026-09-21 時点で SS-96（フラグ切り替え用 OIDC ロール）も完了している。
残る SS-97 / SS-99 / SS-101 / SS-102 / SS-103 は未着手）
（**SS-99 追補**: 2026-09-21 に SS-99（フラグ切り替えワークフロー）を実装した。実行実績はまだ無い）
（**2026-10-17 棚卸し追補**: SS-97 も完了し、backend は 2026-10-01 から prod で稼働している。フラグ切り替えは 2026-09-22 に dev で、2026-10-17 に production で実行した）
（**SS-183 追補**: 2026-10-04 に、Lambda で lifespan が呼び出しごとに走り、決定2・決定9-1・SS-98 追補 D3 の
記述が成り立っていなかった事実を末尾の「SS-183 追補」で訂正した。決定は変えていない）
（**SS-213 追補**: 2026-10-17 に、SS-102 の iOS 分（タグ・Release の作成）を本番の TestFlight 配信と合わせて実装した。TestFlight 配信は同日に実行済みで、Release 作成はストア公開が未実施のため未実行）
（**SS-101 追補**: 2026-10-17 に、mobile の最低サポートバージョンを下回るアプリへのアップデートの案内を実装した。最低バージョンを変える入力は無い）
（**SS-103 追補**: 2026-10-22 に、OTA の本番配信ワークフローと `EXPO_TOKEN` の分離を実装した。OTA の本番配信は未実行）
**本 ADR は実装に先行して方針を固定するものであり、「決まっていること」と「各実装チケットが
これから決めること」を節ごとに区別して書いている。**

## コンテキスト

### なぜ今これを決めるのか

[ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md) の SS-72 追補で
backend のデプロイが GitHub Actions から実行できるようになり、production デプロイ成功時に
`backend/vX.Y.Z` タグと GitHub Release が自動生成されるところまで到達した。その追補の末尾は
次の一文で締められている。

> デプロイとリリース（利用者への機能の公開）の分離（AppConfig によるフィーチャーフラグ、
> ストアの手動リリース）は、別途 ADR を起こす予定。

本 ADR がその「別途 ADR」である。ADR-005 は「backend をどう公開するか」に閉じているのに対し、
リリース戦略は backend・mobile・CI/CD をまたぐため、ルートの `docs/adr/` に新規で起こしている。

### 解こうとしている問題

**デプロイ（コードを本番環境に置くこと）とリリース（利用者に機能を見せること）が
現状では不可分である。** そのため次の不都合がある。

1. **機能が完成するまで main へマージできない、あるいはマージした瞬間に公開されてしまう。**
   長寿命のブランチが必要になり、マージ時の衝突とレビュー負荷が増える。
2. **backend と mobile の公開タイミングを揃えられない。** mobile はストア審査を挟むため
   backend より遅れる。backend を先に出すと mobile が追いつくまで未使用の API が公開され、
   mobile を先に出すと存在しない API を叩く。
3. **公開後に問題が見つかったときの引き返し方が「再デプロイ」しかない。**

### 現状のフィーチャーフラグとその限界（AppConfig を入れる直接の動機）

利用者から見える挙動を制御するフラグは `GOOGLE_MAPS_LOOP_ROUTE_ENABLED`
（周回ルートの kill switch、SS-33 / [ADR-007](./ADR-007-loop-route-generation.md)）の 1 つだけで、
`config.py` の `Settings` が読む Lambda 環境変数として実装されている
（`DB_DISABLE_PREPARED_STATEMENTS` も同じ形だが、これはドライバ側の回避策であって
機能のフラグではない）。運用手順は
[packages/backend/docs/deployment.md](../../packages/backend/docs/deployment.md)
「周回ルートの kill switch」にあるが、そこに書かれているとおり次の限界がある。

- 即時に切り替えるには `aws lambda update-function-configuration` で環境変数を
  **丸ごと置換**する必要がある（差分更新ではないため、現在値を控えてから渡す）
- その変更は **次の `sam deploy` で `template.yaml` の内容に巻き戻る**
- 恒久化するには `template.yaml` を編集して redeploy する ―― つまり
  **フラグを切り替えるのに再デプロイが要る**

最後の点が本質的な問題である。フラグの目的は「デプロイなしで公開状態を変えられること」なのに、
現行方式ではそれが成立していない。

### 既に「配布済みビルドとの互換」を守っている実例がある

`/explore/routes/walking` は `deprecated=True` のまま残されており、router の docstring に
「SS-33: `/explore/routes/loop` に置き換え。**配布済みビルドの互換のため維持する**
（意味・スキーマは変えない）」と書かれている。これは本 ADR の決定7（expand / contract）を
既に実践している例であり、本 ADR はこれを暗黙の慣行から明文化された規則に格上げする。

### 前提となる制約

- **mobile はユーザーの端末に残り続ける。** `runtimeVersion.policy: "appVersion"`
  （[ADR-006](./ADR-006-mobile-app-delivery-eas-hosted.md) の SS-89 追補）のため、
  OTA（EAS Update）で直せるのは同一 `expo.version` の端末だけで、古い version のバイナリは
  更新されないまま backend を叩き続ける。
- **本リポジトリは public である。** AWS のアカウント ID・リソース ID をリポジトリに書けない。
- **AppConfig の器は別リポジトリ（`sanposcape-infra` の Terraform）が作る。**
  SAM と Terraform の責務境界は ADR-005 / ADR-006 で既に確定しており、本 ADR はそこに例外を作らない。
- **prod はまだ存在しない。** `sanposcape-backend-prod` スタックは未デプロイ、
  `app-api.sanposcape.com` は名前解決せず、ストアへの公開も未実施である。
  したがって本 ADR の手順は**実運用による検証を経ていない**。
  （**2026-10-17 棚卸し追補**: backend は 2026-10-01 から prod で稼働し、production でのフラグの切り替えも実行した。ストアへの公開は未実施）

## 決定

### 1. デプロイとリリースを分離する

**デプロイ**（コードを本番環境に置くこと）と**リリース**（利用者に機能を見せること）を
別の操作として扱い、別の承認経路に載せる。

- 未完成・未公開の機能も、**フラグ OFF の状態で main にマージし、本番にデプロイしてよい。**
- 「本番に出ている」ことと「利用者に見えている」ことを別々に管理する。

軸を整理すると次の 3 つになる。以降の決定はこの表の行に対応する。

| 軸 | 手段 | 何を制御するか |
|---|---|---|
| **配信（ネイティブ）** | ストアの手動リリース / 段階的公開 | 誰の端末に新しいバイナリが載るか |
| **配信（JS）** | EAS Update（OTA） | 同一 `runtimeVersion` 内で誰に新しい JS が載るか |
| **公開** | AppConfig のフィーチャーフラグ | 誰に機能が見えるか |

### 2. 未公開機能はフィーチャーフラグ（AWS AppConfig）で OFF のまま本番デプロイし、フラグ ON をリリースとする

フラグの基盤には **AWS AppConfig** を使う。器（Application / Environment /
Configuration Profile / Deployment Strategy）は Terraform（`sanposcape-infra` の `live/platform`）が
所有し、**フラグの値は本リポジトリが所有する**（Secrets Manager と同じ「器は infra、中身はアプリ」の分担）。

実装上の合意事項（SS-94 / SS-95 / SS-96 / SS-98 / SS-99 で infra 側と合意済み）:

- **backend は boto3 の `appconfigdata` を直接呼ぶ。Lambda Extension は使わない。**
  デプロイロールの変更が不要でテストも容易なため（infra 推奨）。
- 実行環境ごとにセッションを 1 回開き、次回トークンと `NextPollIntervalInSeconds` を保持して
  間隔内はキャッシュを返す。`GetLatestConfiguration` は変化が無いと空ボディを返すため、
  前回値を保持する。
  （**SS-183 追補**: SS-183 まで、Lambda ではこれが成り立っていなかった。Mangum が呼び出しごとに
  lifespan を回して取得元を作り直していたため、`/app-config` のたびにセッションを開き直していた。
  末尾の「SS-183 追補」）
- Configuration Profile は `feature-flags`、type は `AWS.AppConfig.FeatureFlags`、
  `location_uri` は `hosted`。
- **Deployment Strategy は独自に作る。** 組み込みの `AppConfig.AllAtOnce` はベイク時間が 10 分あり、
  その間は次のデプロイを開始できないため。dev はベイク 0 分、prod は `StopDeployment` で
  引き返せる時間を残すため数分を置く。
- ID は SSM 経由で受け渡す（public リポジトリに ID を置かないため。
  ADR-005 決定5 の `APP_SECRET_ARN` や SS-72 追補の `lambda_boundary_arn` と同じ理由）。
  契約は `/sanposcape/<env>/platform/appconfig/{application_id,environment_id,configuration_profile_id,deployment_strategy_id}`。
- Lambda 実行ロールの Permission Boundary（SS-95）は `appconfig:StartConfigurationSession` /
  `GetLatestConfiguration` をワイルドカード ARN で許可する。**境界では ID まで絞れない**
  （AppConfig の ID は `live/platform` で採番され、より先に apply される `live/account` からは
  参照できない）ため、**完全 ARN への絞り込みは SAM テンプレート側の実行ロールポリシーで行う。**
- ローカル / テスト環境ではスタブを用意する（既存の `AUTH_MODE` / `MAPS_MODE` と同じモード切替の流儀）。

### 3. mobile はストアの手動リリースと段階的公開で公開時期を制御する

- **App Store**: 「App Review 承認後に手動でリリース」を選び、承認と公開を切り離す。
- **Google Play**: 「公開の管理（Managed publishing）」を有効にし、段階的公開（staged rollout）で
  配信先の割合を制御する。

これは**バイナリの配信**の制御であり、決定2 の**機能の公開**の制御とは別軸である
（決定1 の表を参照）。両方を使うことで「新しいバイナリは一部の利用者にだけ配り、
機能自体はフラグで全員に対して OFF」といった状態を作れる。

なお mobile の機能も `/app-config`（決定2）越しのフラグでガードできる（SS-100）ため、
**「コードは配布済み・フラグ OFF」は mobile でも成立する。**

### 4. バージョンはアプリ別に採番し、タグは `<app>/vX.Y.Z` に統一する

モノレポだがアプリごとに独立したバージョンとリリースノートを持つ。
タグの接頭辞でアプリを区別する（`backend/v0.1.0`、`mobile/v0.1.0`、将来の LP も同じ形）。

- 採番とリリースノートは **git-cliff**（リポジトリ直下の `cliff.toml`）で生成する。
  設定はアプリに依存させず、アプリ別の差分は CLI 引数で渡す
  （`--include-path 'packages/<app>/**'` と `--tag-pattern '^<app>/v[0-9]+\.[0-9]+\.[0-9]+$'`）。
- バージョン規則・スキップ条件は ADR-005 の SS-72 追補および
  [deployment.md](../../packages/backend/docs/deployment.md) §4.1 に記載したものを
  そのまま他アプリへ適用する。
- **`CHANGELOG.md` はリポジトリにコミットせず、GitHub Release の本文だけにする。**
- mobile では、生成した CHANGELOG を**ストアの「新機能」欄の下書きとしても使う**（SS-102）。
- mobile でタグ・CHANGELOG のキーにするのは **`app.json` の表示用 `version` のみ**である。
  ビルド番号（iOS の `buildNumber` / Android の `versionCode`）は EAS サーバーが採番するため
  （ADR-006 の SS-89 追補）、キーにしない。

### 5. dev（development）へのデプロイではバージョンを振らない

タグと GitHub Release を作るのは production へのデプロイが成功したときだけとする
（ADR-005 の SS-72 追補で確定済み）。バージョンは「本番に出ているもの」を指す番号であり、
検証環境に出たものに番号を与えると、番号が何を指すのかが曖昧になるため。

dev に何が出ているかは GitHub Actions の実行履歴で確認する。

### 6. フラグのライフサイクルは「追加 → ON → 削除」の 3 段階とし、削除まで終えて初めて完了とする

| 段階 | 操作 | 完了の目安 |
|---|---|---|
| 追加 | フラグ定義を本リポジトリに追加し、既定値 OFF で本番へデプロイする | 本番にコードが載り、利用者には見えていない |
| ON | フラグ切り替えワークフローで ON にする（prod は承認あり） | **これがリリース** |
| 削除 | フラグの分岐とフラグ定義を消す PR を出す | フラグが 1 つ減っている |

- **削除まで含めて 1 つの機能追加とみなす。** 削除しないフラグが積み上がると、
  分岐の組み合わせが増えてコードが読めなくなり、テストで担保すべき状態数も増える。
  （**SS-233 追補**: mobile が見るフラグは、1つの PR で消すと配布済みのアプリから公開済みの機能が消える。
  backend が固定値を返す期間を挟んだ2段階で消す。末尾の「SS-233 追補」D40）
- フラグの定義（名前・説明・既定値）は**本リポジトリ内のファイルで管理する**。
  ワークフローがその値から hosted configuration version を作成して `StartDeployment` する（SS-99）。
  Terraform は hosted configuration version を作らない（SS-94）。
- **フラグの切り替えは GitHub Actions の `workflow_dispatch` からのみ行い、
  AWS コンソールから直接操作しない。** Actions の実行履歴を
  「いつ・誰が・何をリリースしたか」の記録にするため（SS-99）。
- 切り替え用の認証には **sam-deploy とは別の OIDC ロール** `sanposcape-<env>-feature-flags`（SS-96）を使う。
  フラグの切り替えに CloudFormation や IAM の権限は不要であり、`iam:CreateRole` を持つ
  sam-deploy ロールの使用場面を最小に保つため。

### 7. API の変更は expand → contract の 2 段階で行う

**配布済みの mobile ビルドは更新されないまま backend を叩き続ける。**
したがって backend の API 変更は、常に「古いクライアントが動いたまま新しいクライアントも動く」
中間状態を経由させる。

| 段階 | やること |
|---|---|
| **expand** | 新しいフィールド / エンドポイントを**追加**する。古いものは残したまま、意味も変えない。新規フィールドは任意（optional）にする |
| （移行） | 新しいクライアントを配布し、古いクライアントが十分に減るのを待つ |
| **contract** | 古いフィールド / エンドポイントを削除する |

- 既存エンドポイントを置き換える場合は、まず FastAPI の `deprecated=True` を付けて残す
  （`/explore/routes/walking` が実例）。**意味とスキーマは変えない。**
  「残っているが挙動が変わっている」が最も危険な状態である。
- **contract に進んでよいかの判断材料は「最低サポートバージョン」とする。**
  `/app-config` が返す最低サポートバージョン（SS-98）を下回るアプリには
  アップデートを促す（SS-101）。そのバージョン以上のクライアントだけが残ったと言える状態になって
  初めて、古いフィールド / エンドポイントを削除する。
- DB スキーマの変更にも同じ原則を適用する。ADR-005 決定9 によりマイグレーションは手動であり、
  デプロイ完了からマイグレーション実行までの間は**新しいコードが古いスキーマで動く**。
  expand（列の追加・NULL 許容）と contract（列の削除・NOT NULL 化）を別のデプロイに分ける。
- **SS-171 追補（2026-10-04, [ADR-009](./ADR-009-sanpo-map-pin-data-model-and-photo-upload.md) 決定31）**:
  - 新規フィールドを任意にする規則は**リクエスト側**の話として読む。応答側のフィールド追加は
    古いクライアントが無視するだけなので、required にしてよい（mobile の型付きの都合など）。
  - NOT NULL の列でも、**server default があれば古いコードの INSERT は通る**。expand の目的
    （古いコードを壊さない）を満たすので、NOT NULL + server default の列追加は expand として扱える。
  - ただし**既存テーブルへの列追加には隙間が残る**。デプロイからマイグレーション実行までの間、
    新しいコードがその列を SELECT するため、そのテーブルを読む API は `UndefinedColumn` で
    500 になる（マイグレーション Lambda は API と同じ成果物を使うため、コードより先には流せない）。
    prod の稼働後は、マイグレーションだけの PR を先にマージして先に流す
    （手順は `docs/release-runbook.md`）。

### 8. OTA（EAS Update）は「配信」の手段であって「リリース」の手段ではない

OTA で届ける利用者向けの変更は、次のいずれかに限る。

1. **既に公開済みの機能に対する不具合修正**
2. **フラグ OFF の状態で入る新機能**（ダークローンチ。公開は決定2 のフラグ ON で行う）

理由:

- `runtimeVersion.policy: "appVersion"` のため、OTA が届く範囲は**同一 `expo.version` の端末のみ**。
  `version` を上げた瞬間、既存端末はその後の新 version 向け `eas update` を受け取らなくなる
  （ADR-006 の SS-89 追補）。
- OTA は**ストア審査を経ず即時に全対象端末へ届く**ため、それ単体では段階的公開の制御が効かない。
  SS-103 が OTA 配信ワークフローに `workflow_dispatch` + production Environment の承認を
  課しているのも同じ理由である。

運用上の帰結:

- **channel の付け替えでリリースを制御しない。** channel は `eas.json` の既存の割り当て
  （`production` プロファイル → `production` channel）をそのまま使う。公開の制御はフラグで行う。
- **`version` を上げる PR と配布ビルドはセットで計画する。** `version` を上げると、その version の
  ネイティブバイナリを配布するまで OTA の配信先が存在しなくなる
  （[build-profiles.md](../../packages/mobile/docs/build-profiles.md)
  「表示用バージョン `version` の運用ルール」）。
- ネイティブモジュールや config plugin の変更を伴う場合は、`version` を上げて互換境界を切る。
  （**SS-230 注記**: 上げるのは、その変更を含むバイナリを出す次のリリースのとき。変更が main に入った時点では上げない。
  [ADR-006](./ADR-006-mobile-app-delivery-eas-hosted.md) の SS-230 追補）

### 9. フラグの取得に失敗した場合は全フラグ OFF で動く（フェイルセーフ）

**一度も値を取得できていない**とき（未配信＝そのプロファイルにまだ構成が配信されていない、
初回取得の失敗、取得した内容が JSON として壊れている）は、**既定値＝全フラグ OFF** で
動作する（SS-94 の申し送り、SS-98）。

「フラグが読めない」ときに未公開の機能が露出するより、公開済みの機能が見えなくなるほうが
損害が小さいという判断による。AppConfig の最初のデプロイ前はそもそも配信済みの構成が存在しないため、
この既定値が無いと backend が起動できない。

#### 9-1. 一度取得できた値（known-good）は、その後の取得失敗では捨てない（2026-09-21 追記, SS-98 / PR #88）

当初この決定は「未配信・取得失敗・空の応答のいずれの場合も全フラグ OFF」と書いていたが、
性質の異なる 3 つの事象を一括りにしていたため、実装（SS-98）との食い違いを生んだ。
次のように切り分ける。

| 事象 | 挙動 |
| --- | --- |
| 一度も取得できていない（未配信 / 初回失敗 / パース失敗） | **全フラグ OFF**（`config_source: "default"`） |
| 空の応答（`GetLatestConfiguration` の「変化なし」） | **直前に取得した値を維持** |
| 取得失敗（known-good を持っている状態での失敗） | **known-good を維持**し、バックオフ後に再取得 |

理由は 3 つある。

1. **空の応答は正常系であって失敗ではない。** `GetLatestConfiguration` は構成に変化が無いとき
   空ボディを返す仕様で、これを「全 OFF」に倒すとポーリングのたびに全フラグが消えて復活する
   壊れた挙動になる。当初の文面の「空の応答」は「未配信」を指す意図だったと読むべきで、
   記述が不正確だった。
2. **known-good を保持しても、この決定が守ろうとしているリスクは発生しない。** 守りたいのは
   「未公開の機能が露出する」ことだが、known-good 上で OFF のフラグは保持されても OFF のままで、
   保持によって OFF が ON に変わる経路は存在しない。露出リスクが実在するのは known-good が
   無い場合だけで、そこは上表のとおり全 OFF に倒している。
3. **逆に全 OFF へ倒すと実害がある。** AppConfig の一時的なスロットリングやネットワーク断で、
   **公開済み**の機能がバックオフ間隔のあいだ消える。(2) よりこちらに倒す利得が無い。

なお「ON にした機能を OFF に戻して緊急停止する」用途はこの決定の射程外である。決定8 および
追補 D8 のとおり、公開済み機能の緊急停止（安全側が ON）はフィーチャーフラグではなく
環境変数が担うため、「AppConfig が読めずに stale な ON を掴み続ける」ことは緊急停止の
妨げにならない。

（**SS-183 追補**: known-good は Lambda の実行環境の中で保持する値だが、SS-183 までは取得元が
呼び出しごとに作り直されていたため、呼び出しをまたいでは維持されていなかった。末尾の「SS-183 追補」）

## 検討した選択肢

### 選択肢1: AWS AppConfig ← 採用

- **概要**: AWS マネージドのフィーチャーフラグ基盤。器は Terraform、値はアプリ側リポジトリ。
- **メリット**:
  - 既に AWS 上にインフラがあり、OIDC・SSM 契約・Permission Boundary という
    既存の仕組み（ADR-004 / ADR-005）にそのまま載る。新しいアカウントも新しい秘密情報も増えない。
  - **再デプロイなしで値を切り替えられる**（現行の環境変数方式の最大の欠点が解消する）。
  - Deployment Strategy にベイク時間があり、`StopDeployment` で引き返せる。
  - 固定費が MVP のコスト感に収まる。
- **デメリット**:
  - AWS 固有であり、backend 以外（mobile / LP）は `/app-config` 越しにしか読めない。
  - 実装が増える（セッション管理・キャッシュ・フェイルセーフ・スタブ）。
  - 組み込みの Deployment Strategy が使えず、自作が必要（ベイク 10 分の制約）。

### 選択肢2: Lambda 環境変数を使い続ける（現状維持）

- **概要**: `config.py` の `Settings` に `*_ENABLED` を生やし、`template.yaml` で値を与える。
- **メリット**: 追加実装がゼロ。既に 1 つ（`GOOGLE_MAPS_LOOP_ROUTE_ENABLED`）動いている。
- **デメリット**:
  - **切り替えに再デプロイが要る**（または手動更新が次の `sam deploy` で巻き戻る）。
    デプロイとリリースの分離という目的そのものを達成できない。
  - 切り替えの履歴が残らない。
  - mobile / LP から読む経路が無い。

### 選択肢3: 外部 SaaS（LaunchDarkly など）

- **概要**: フィーチャーフラグ専業の SaaS を使う。
- **メリット**: UI・ターゲティング・監査ログが最初から揃っている。ダークローンチの表現力が高い。
- **デメリット**:
  - MVP 段階で月額の固定費が乗る。
  - 管理するアカウントと秘密情報が 1 つ増える（ADR-004 の「秘密の保管先は消費者で決める」方針に
    新しい経路を足すことになる）。
  - 現時点で必要なのは ON/OFF だけで、ターゲティングの表現力に対価を払う理由が無い。

### 選択肢4: DB のテーブルでフラグを持つ

- **概要**: PostgreSQL にフラグ用テーブルを作り、backend が読む。
- **メリット**: 追加のマネージドサービスが不要。値の変更が即時。
- **デメリット**:
  - **フラグの読み取りが DB の可用性に依存する。** DB 障害時に「フラグが読めないので全 OFF」に
    落ちると、障害の影響範囲が不必要に広がる。
  - Lambda ごとにキャッシュが分かれる問題（ADR-005 決定8 と同じ構図）が再演する。
  - 値の変更経路が「本番 DB への書き込み」になり、承認と履歴を残す仕組みを自前で作る必要がある。
  - mobile / LP から読むには結局 `/app-config` のようなエンドポイントが要る。

## 決定理由

**選択肢2（現状維持）を外した理由が、この ADR の出発点そのものである。**
「フラグを切り替えるのに再デプロイが要る」状態では、デプロイとリリースを分離できない。
`GOOGLE_MAPS_LOOP_ROUTE_ENABLED` の運用手順が
「即時に変えられるが次の `sam deploy` で巻き戻る / 恒久化するには redeploy」という
二者択一になっていることが、その証拠として既にドキュメントに残っている。

**選択肢1 を採ったのは、増える管理対象が最も少ないため。** AppConfig は
既存の OIDC・SSM 契約・Permission Boundary の枠組みにそのまま載り、
新しいアカウント・新しい秘密情報・新しい請求先が増えない。選択肢3 はこの 3 つが全て増える。

**選択肢4 を外した決め手は可用性の結合である。** フラグは「何かが壊れたときに機能を止める」
用途を含む（`GOOGLE_MAPS_LOOP_ROUTE_ENABLED` がまさにそれ）。その読み取り先を
アプリ本体と同じ DB に置くと、最も必要な場面で使えない可能性がある。

**決定8（OTA の位置づけ）は本 ADR で新たに導出したものである。** SS-72 の検討事項には
OTA の扱いが明示されていなかったが、SS-103 が本課題と `relates to` で紐付き、本文に
「`runtimeVersion`(policy: appVersion) と channel の運用を ADR-006 の未完了事項に沿って整理する」
とあるため、ここで決めるべき事項と判断した。「OTA は不具合修正のみ」とより狭く縛る案も
検討したが、SS-100 により mobile の機能もフラグでガードできる以上、ダークローンチを禁じる理由が無く、
決定1 と整合しないため採らなかった。

## 影響

### ポジティブな影響

- **未完成の機能を main にマージできる。** 長寿命ブランチとマージ時の衝突が減る。
- **backend と mobile の公開タイミングを揃えられる。** 両方を配布済みにしたうえで、
  フラグ ON という 1 つの操作で同時に公開できる。ストア審査の所要時間がリリース計画から外れる。
- **引き返す手段がデプロイ以外に増える。** 問題が起きたらフラグ OFF で戻せる
  （`StopDeployment` によるデプロイ自体の停止も含む）。
- **リリースの履歴が GitHub Actions に残る。** 「いつ何が公開されたか」を後から追える。
- 現行の `GOOGLE_MAPS_LOOP_ROUTE_ENABLED` も、この基盤へ移せば
  「巻き戻る一時変更か、再デプロイを伴う恒久変更か」の二者択一から解放される。

### ネガティブな影響・トレードオフ

- **コードにフラグの分岐が増える。** 決定6 の削除段階を実行しないと、分岐の組み合わせが
  増え続けてコードが読めなくなる。「削除まで含めて 1 つの機能追加」という規律に依存している。
- **テストすべき状態が増える。** フラグ ON / OFF の両方で壊れないことを担保する必要がある。
- **リリースの操作が 1 つ増える。** 「デプロイしたら公開」より手数が多い。
  小さな修正では割に合わない場合があり、すべての変更をフラグで包む必要はない
  （どの変更をフラグで包むかの線引きは運用手順側に置く）。
- **AppConfig の取得失敗が新しい失敗経路になる。** 決定9 のフェイルセーフで
  「全 OFF」に倒すが、これは「公開済みの機能が突然見えなくなる」ことを意味する。
- **フラグの数が増えるほど、AppConfig のデプロイのベイク時間が運用の律速になる。**
  同一 Environment では前のデプロイのベイク中に次を開始できない（SS-94）。
- **expand → contract は 2 回のデプロイを要する。** API の変更が常に 2 段階になり、
  古いフィールドを消すまでの間はスキーマに冗長さが残る。
- **本 ADR の手順は未検証である。** prod はまだ存在せず、ストアへの公開も未実施のため、
  ストア側の設定手順は公式ドキュメントに基づく記述に留まる。
  （**2026-10-17 棚卸し追補**: prod は 2026-10-01 から稼働し、backend のデプロイとフラグの切り替えは prod でも実行した。ストア側の設定は依然として未検証）

### 移行・対応が必要な事項

- [x] SS-94: `live/platform` に AppConfig の器を作り、SSM に 4 つの ID を入れる（`sanposcape-infra` 側。**完了**）
- [x] SS-95: Lambda 実行ロールの境界に `appconfig:StartConfigurationSession` / `GetLatestConfiguration` を追加する（**完了**）
- [x] SS-96: フラグ切り替え用の OIDC ロール `sanposcape-<env>-feature-flags` を作る（`sanposcape-infra` 側。**完了**。
      **SS-93 追補**で反映）
- [x] SS-97: prod の `live/account` を apply し、`production` Environment に `AWS_SAM_DEPLOY_ROLE_ARN` を設定する（**2026-10-17 棚卸し追補**: 完了。prod は 2026-10-01 から稼働）
- [x] SS-98: backend に AppConfig 読み取り基盤と `/app-config` エンドポイントを追加する（**完了**）。
      **（SS-98 追補）** レスポンススキーマ・ダークローンチの要否・
      `GOOGLE_MAPS_LOOP_ROUTE_ENABLED` の移行要否は下記「SS-98 追補」で決定した。
- [x] SS-99: フラグ切り替えワークフローを追加する（**完了**。定義ファイルのフォーマットと置き場所は
      下記「SS-99 追補」で決定した）
- [x] SS-100: mobile が `/app-config` のフラグで機能表示をガードする（**完了**。詳細は下記
      「SS-100 追補」を参照）
- [x] SS-101: 最低サポートバージョンを下回るアプリにアップデートを促す（決定7 の contract の前提。**完了**。
      末尾の「SS-101 追補」を参照。最低バージョンを変える入力は D33 で持ち越し）
- [ ] SS-102: mobile の `mobile/vX.Y.Z` タグ・Release・CHANGELOG を自動生成する
      （**SS-213 追補**: iOS 分は SS-213 で実装した。Android 分が残る。末尾の「SS-213 追補」を参照）
- [x] SS-103: OTA の本番配信ワークフローを追加し、`EXPO_TOKEN` を Environment Secret へ移す
      （**SS-103 追補**: 完了。OTA 用のトークンだけを Environment Secret に置き、ビルド用は権限を絞ってリポジトリ Secret に残した。末尾の「SS-103 追補」を参照。初回の配信は未実行）
- [x] `GOOGLE_MAPS_LOOP_ROUTE_ENABLED` を AppConfig のフラグへ移行するかを判断する。
      **（SS-98 追補）環境変数のまま残すと結論した。** 理由は下記「SS-98 追補」§D8 を参照
- [ ] ストア側の設定（App Store の手動リリース / Google Play の公開の管理）を実際に行い、
      [release-runbook.md](../release-runbook.md) の未検証の記述を実測で確定させる
- [ ] 各実装チケットの完了時に、確定した構成を本 ADR へ追補する

## 追補: `/app-config` のレスポンススキーマとフラグ取得基盤（2026-09-20, SS-98）

決定2 が backend 側に投げていた「レスポンススキーマとダークローンチの要否は SS-98 で決める」
（コメント1 参照）への回答。実装は `packages/backend/src/sanposcape/app_config/`
（HTTP エンドポイント）、`core/feature_flags.py`（評価層）、
`integrations/aws/appconfig.py`（boto3 `appconfigdata` の取得層）に分かれている。

節番号は D1, D2, D3, D5, D7, D8, D9, D10 の順。**D4 と D6 は欠番**（この2つの番号に対応する
決定が本追補には無く、意図的に使用していない。今後この2つの番号を新設する決定が生じた場合は、
この欠番を埋める形で追補すること。既存の節番号は他の節・本リポジトリのコード（後述）から
参照されているため、詰めて振り直さない）。

### D1: `/app-config` のレスポンススキーマ

```http
GET /app-config            認証不要（/health と同じ扱い）。Cache-Control: no-store
```

```json
{
  "flags": {
    "app_config_probe": false
  },
  "minimum_supported_versions": {
    "ios": "0.1.0",
    "android": "0.1.0"
  },
  "config_source": "appconfig"
}
```

（`app_config_probe` は最初の実フラグ導入まで用の暫定キー。SS-88 以降は `pin_registration` に
置き換わっている——`app_config_probe` は SS-88 backend PR で削除済み。上の JSON 例は
このドキュメントの記述時点のものなので、実際のキー集合は `core/feature_flags.py` の
`FEATURE_FLAGS` を参照すること。）

| フィールド | 型 | 意味 |
|---|---|---|
| `flags` | `dict[str, bool]` | **クライアント公開可**と登録簿（`core/feature_flags.py` の `FEATURE_FLAGS`）でマークされたフラグのみ。登録済みキーは AppConfig 側に値が無くても必ず `false` で出る（キー集合は backend のバージョンで決まる） |
| `minimum_supported_versions.ios` / `.android` | `string \| null` | `X.Y.Z` 形式。`null` は「**最低バージョンの指定なし = 強制アップデートしない**」（AppConfig を読めない場合も `null` になる。決定9 と同じ向きの fail-safe） |
| `config_source` | `"appconfig" \| "default" \| "stub"` | 診断用。値の出どころ。**クライアントはこの値で分岐してはいけない**（秘密情報は含まない） |

決定の要点:

- **`flags` は固定キーのオブジェクトではなく map にする。** フラグのライフサイクルは
  「追加 → ON → **削除**」（決定6）であり、フラグの増減が毎回 OpenAPI スキーマの
  破壊的変更になるのは expand → contract（決定7）と噛み合わない。map ならフラグを
  削除しても API スキーマは不変で、古いビルドは未知キーを読めなくなるだけで壊れない。
  代償として mobile 側は型安全を失う（SS-100 でキー定数を自前定義する）。
  （**SS-233 追補**: スキーマは壊れないが、未知キーは OFF なので、そのキーで出し分けている機能は古いビルドから消える。
  mobile が見るフラグの削除は2段階にした。末尾の「SS-233 追補」D40）
- **値は `bool` 単体**（`{"enabled": true}` のようにネストしない）。クライアントに属性を
  配る要件が現時点で無く、必要になれば別フィールド（例 `flag_attributes`）を追加する
  expand で足せる。
- **最低サポートバージョンはプラットフォーム別。** iOS / Android は審査とストアの段階的公開で
  普及速度が異なり、片方だけ古いビルドを切りたい場面が現実に起きる。`expo.version`
  （`app.json`）は共通の1つの値だが、キーは分けておく（後から `string` → `{ios, android}`
  に変えるのは破壊的変更になるため）。
- **`/app-config` は DB を触らない。** 認証も DB も要らない軽量経路にしておくと、
  DB 障害時にもフラグを配れる（選択肢4 を却下した理由と同じ発想）。

### D2: ダークローンチ（ユーザー条件付きフラグ）は不採用

**結論: 採用しない。**

1. **`/app-config` は未認証で叩ける必要がある。** mobile はサインイン前にフラグを読む
   （起動時ガード・強制アップデート判定）。ユーザー条件付きにすると「未認証時の値」と
   「認証後の値」が食い違い、mobile はサインインの前後で2回取得して差し替える実装になる。
   最初に入れる基盤の複雑さとして割に合わない。
2. **AppConfig にターゲティングの仕組みが無い。** `AWS.AppConfig.FeatureFlags` が配るのは
   キー → `enabled` + 属性だけで、ルール評価は自前実装になる。選択肢3（LaunchDarkly）を
   外した理由「現時点で必要なのは ON/OFF だけ」がそのまま当てはまる。
3. **検証の代替手段が既にある。** 「自分だけで試す」は dev 環境（`ENV=staging`）でフラグを
   ON にすれば足りる。
4. キャッシュが壊れる。ユーザー単位評価にすると `/app-config` はユーザーごとに違う応答に
   なり、D10 のキャッシュ方針が作り直しになる。

将来入れるときに変えるもの（今のうちに用意しておいた拡張点）:

| 変更対象 | 具体的な変更 |
|---|---|
| 評価 API | `FeatureFlags.is_enabled(key)` に**キーワード引数**で `context=...` を足す。既存呼び出しは無変更で済む（現状のシグネチャは `def is_enabled(self, key: str) -> bool` で、`*, context=...` を後から追加できる形にしてある） |
| フラグ JSON | `flags.<key>.attributes` に `allowed_user_keys` 等を定義し、`values.<key>` に値を入れる。**属性は `enabled: true` のときしか配信されない**ため「OFF だが特定ユーザーだけ ON」は表現できない（フラグの意味論が変わるため ADR 追補が別途必要） |
| `/app-config` | 任意認証（既存の `get_current_user_optional` を使う）にする。`Cache-Control` は `no-store` のまま |
| mobile | サインイン完了後に `/app-config` を再取得する（**SS-100 では実装しない。理由と拡張点は D14 を参照**） |

### D3: 層の分離と初期化タイミング

**層の分離**: 「AppConfig からどう取るか」（`integrations/aws/appconfig.py`、取得層/transport）と
「どのキーが存在し、どれをクライアントに見せるか」（`core/feature_flags.py`、評価層）を分ける。
両者は変更理由が異なる（前者は AWS API の都合、後者はフラグの登録簿・公開ポリシーの都合）ため、
1つのモジュールにまとめると変更のたびに無関係な差分が混ざる。

**`FlagDocument` / `FlagDocumentSource`（Protocol）を `core` 側ではなく
`integrations/aws/appconfig.py` 側に置いた理由**: 実装時の設計判断では「core 側に置くと
循環 import になるため」としていたが、これは**技術的に不正確**だった。`FlagDocumentSource` は
`Protocol` であり構造的部分型が効くため、`AppConfigFlagSource` 等の実装クラスは明示的に
import/継承しなくても適合する。つまり型定義を `core/feature_flags.py` に移しても、依存の向きが
`integrations → core` に反転するだけで**循環にはならない**。

実際にこの配置を採った理由は、既存の前例（`core/runtime_config.py` が
`integrations/aws/secrets.py` の型を使う、という `core → integrations` の依存の向き）との
**一貫性を優先した**ためである。古典的なポート＆アダプタでは「ポート(Protocol)と DTO は
評価ロジックを持つ側（`core`）が所有し、アダプタ（具象実装）がそれに依存する」向き
（`integrations → core`）がより教科書的だが、本リポジトリでは逆方向（`core → integrations`）の
前例が既にあり、この1箇所だけ向きを変えると一貫性が崩れる。動くものを実装終盤に配置し直す
利得より、リポジトリ内で依存の向きを揃えておく利得を優先した。技術的な制約ではなく
一貫性のためのトレードオフである、という点を後続の設計判断のために明記しておく。

**初期化タイミング**: `main.py` の `_lifespan`（コールドスタート時に1回実行される）は
`FlagDocumentSource` / `FeatureFlags` の**インスタンスを作るだけ**で、AppConfig への実際の
取得（`get_document()` の呼び出し）は行わない。最初にフラグを参照したリクエスト（通常は
`/app-config`）が初めて取得する。これにより、`/app-config` 以外のエンドポイントの
コールドスタートに AppConfig 取得のレイテンシ（`APPCONFIG_CONNECT_TIMEOUT_SECONDS` +
`APPCONFIG_READ_TIMEOUT_SECONDS` が最悪ケース）を乗せずに済む。同じ形は
`google_maps_provider`（`HttpGoogleMapsProvider` も `_lifespan` でインスタンス化されるだけで、
実際の Places/Routes 呼び出しはリクエスト時）にも使われている既存パターンである。
（**SS-183 追補**: 「コールドスタート時に1回実行される」は、SS-183 まで Lambda では事実に反していた。
Mangum の `lifespan="auto"` が呼び出しごとに `_lifespan` を走らせていた。SS-183 で、Lambda では init で
1 回だけ起動する形にした。インスタンスを作るだけで取得しない、という本節の決定は変わらない。末尾の「SS-183 追補」）

### D5: モード切替（`FEATURE_FLAG_MODE`）

`AUTH_MODE` / `MAPS_MODE` と同じ型（決定2 が予告していたとおり）。

```python
feature_flag_mode: Literal["real", "stub"] = "real"       # コード既定は fail-safe な real
feature_flag_stub_document: str = ""                       # stub 用の簡略 JSON 文字列
appconfig_application_id: str = ""
appconfig_environment_id: str = ""
appconfig_configuration_profile_id: str = ""
appconfig_poll_interval_seconds: int = 60
appconfig_error_backoff_seconds: int = 30
appconfig_connect_timeout_seconds: float = 1.0
appconfig_read_timeout_seconds: float = 2.0
```

- `ENV` が `local` / `test` 以外で `feature_flag_mode != "real"` だと起動失敗する
  （許可リスト方式。ADR-002 決定4 と同じ fail-safe 方針）。
- **`APPCONFIG_*` の ID が1本でも空なら `UnconfiguredFlagSource`（AWS を一切呼ばない）に
  フォールバックする。** これにより CI（`backend-ci.yml`）と既存開発者の `.env` は無変更で
  安全（`MAPS_MODE` 未設定時に `UnconfiguredGoogleMapsProvider` に落ちるのと同じ構造）。
- stub の入力は `GetLatestConfiguration` が返す簡略 JSON と同じ形（本番と同じパーサを通す）。
  型は `str`（`dict` にすると pydantic-settings の自動 JSON デコードが絡み、
  `GOOGLE_ALLOWED_AUDIENCES` で踏んだ「パース失敗で起動できない」罠を再演しうるため）。

### D7: AppConfig に置く設定 JSON（SS-99 がそのまま使える例）

**書き込む側**（hosted configuration version の中身。`AWS.AppConfig.FeatureFlags` の正規形）:

```json
{
  "version": "1",
  "flags": {
    "client_requirements": {
      "name": "client requirements",
      "description": "機能フラグではない予約キー。クライアントの最低サポートバージョンを属性で配る。必ず enabled=true にすること（false にすると属性が配信されず backend は null にフォールバックする）",
      "attributes": {
        "ios_minimum_version": {
          "description": "これ未満の iOS アプリにアップデートを促す（SS-101）",
          "constraints": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" }
        },
        "android_minimum_version": {
          "description": "これ未満の Android アプリにアップデートを促す（SS-101）",
          "constraints": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" }
        }
      }
    },
    "app_config_probe": {
      "name": "app config probe",
      "description": "基盤の疎通確認用。機能には紐づかない。最初の実フラグが入ったら削除する"
    }
  },
  "values": {
    "client_requirements": {
      "enabled": true,
      "ios_minimum_version": "0.1.0",
      "android_minimum_version": "0.1.0"
    },
    "app_config_probe": { "enabled": false }
  }
}
```

**読み取る側**（`GetLatestConfiguration` が返す簡略 JSON。backend / stub が扱う形）:

```json
{
  "client_requirements": {
    "enabled": true,
    "ios_minimum_version": "0.1.0",
    "android_minimum_version": "0.1.0"
  },
  "app_config_probe": { "enabled": false }
}
```

スキーマ上の制約（AWS 公式の型リファレンスより。SS-99 が守る必要がある）:

- フラグキー / 属性名は `^[a-z][a-zA-Z\d_-]{0,63}$`（先頭は小文字英字。snake_case で統一）。
- `version` は `"1"` 固定・必須。トップレベルは `version` / `flags` / `values` のみ
  （`additionalProperties: false`。独自のメタ情報を足せない。D9 の理由）。
- **`enabled: false` のフラグの属性は `GetLatestConfiguration` の応答に含まれない**
  （AWS の仕様）。`client_requirements` は**常に ON に保つ**必要がある。OFF にすると
  最低サポートバージョンが `null` に落ちる（= 強制アップデートしない側なので安全）。
- 最低サポートバージョンを配るためだけの別 Configuration Profile は作らない。
  infra（SS-94）が作った profile は `feature-flags` の1本だけのため、既存 profile に
  相乗りしている。
- フラグキーの命名規約: `_enabled` のような接尾辞を付けず、機能名の snake_case にする
  （`flags` という map の値が bool なので、接尾辞は冗長）。例: `walk_sharing`, `route_replay`。

`app_config_probe`（疎通確認用フラグ）について: SS-98 時点では実機能に紐づくフラグが
1つも無く、SS-99（切替ワークフロー）も SS-100（mobile の消費）も切り替える対象が無いと
検証できない。そのため、登録簿と AppConfig の JSON 例にこのフラグを1つ置いた
（client 公開・既定 OFF・挙動なし）。**最初の実フラグが入った時点で削除する**
（決定6 の「削除まで含めて1つ」に反する常駐フラグにしない。コード上のコメント
（`core/feature_flags.py`）にも同じ注記がある）。

**（2026-09-21 追記, SS-88）** ピン登録機能（[ADR-009](./ADR-009-sanpo-map-pin-data-model-and-photo-upload.md)）の
`pin_registration` が最初の実フラグとして登録され、同じ PR で `app_config_probe` を
`core/feature_flags.py` の `FEATURE_FLAGS` から削除した。`app_config/tests/test_router.py` /
`core/tests/test_feature_flags.py` のサンプルキーも `pin_registration` に置き換えている。
本節・上の JSON 例にある `app_config_probe` は SS-98 時点の記録として残すが、
**現在のコードには存在しない。**

### D8: `GOOGLE_MAPS_LOOP_ROUTE_ENABLED` は AppConfig へ移行しない

「移行・対応が必要な事項」の宿題への回答。**環境変数のまま残す。**

- AppConfig 基盤の既定値は**全フラグ OFF**（決定9）。`GOOGLE_MAPS_LOOP_ROUTE_ENABLED` の
  安全側は**ON**（既に公開済みの機能で、OFF にすると「同じ道で戻る」フォールバックに落ちる）。
  移行すると「AppConfig が読めない → 公開済み機能が静かに劣化する」という、今は存在しない
  障害経路が増える。
- kill switch は「何かが壊れたときに止める」ためのもので、AppConfig 自体が壊れていても
  効いてほしい。
- backend 内部のフラグでクライアントには公開しない（`/app-config` に出す理由が無い）。

一般規則として書き下す:

| 種類 | 安全な既定 | 置き場所 |
|---|---|---|
| 未公開機能の公開制御（リリース） | OFF | **AppConfig** |
| 公開済み機能の緊急停止（kill switch） | ON | **環境変数（`Settings`）** |

### D9: フラグ定義の所有（コードの登録簿 / AppConfig の値）

| 決めること | 所有者 | 変更手段 |
|---|---|---|
| フラグキーの正典・説明・**クライアント公開の可否** | **backend のコード**（`core/feature_flags.py` の `FEATURE_FLAGS`） | PR（レビューを通る） |
| フラグの値（ON / OFF）・最低サポートバージョン | **AppConfig**（hosted configuration version） | GitHub Actions（SS-99） |

- **公開可否をコード側に置くのが要点。** AppConfig の値を切り替える操作で
  「backend 内部専用のつもりだったフラグがクライアントに露出する」事故を構造的に防ぐ
  （D7 のとおり AppConfig の JSON には独自メタ情報を足せない、という制約とも整合する）。
- `/app-config` は登録簿にある client フラグを必ず全部返す（AppConfig 側に無ければ
  `false`）。AppConfig 側にある未知キーは無視する（ログは DEBUG）。応答のキー集合が
  「デプロイされている backend のバージョン」で決まり、mobile から見て予測可能になる。
- フラグ定義ファイル（SS-99 が使う `flags.json` の置き場所とフォーマット）は SS-99 の
  担当（決定6 がそう割り当てている）。SS-99 でファイルを作るときは、登録簿（Python）と
  ファイル（JSON）のキー集合が一致することを pytest で検査することを推奨する。

### D10: キャッシュ方針

- レスポンスヘッダは **`Cache-Control: no-store`**。
- CloudFront のキャッシュポリシー（Terraform 所有）に挙動を依存させたくない。リリース当日に
  「フラグを ON にしたのに反映されない」の原因が CloudFront かポーリング間隔（既定60秒）か
  コンテナ再利用かで切り分け不能になるのを避けるため。`/app-config` は DB も外部 API も
  叩かない軽量経路で、キャッシュしないコストは小さい。
- 反映の遅延要因は **AppConfig のベイク時間 + ポーリング間隔（既定60秒）+ 実行環境ごとの
  ばらつき**に閉じる。後日トラフィックが増えたら `max-age` を入れる余地は残る
  （expand で足せる）。
- **`Cache-Control: no-store` は OpenAPI（`openapi.yaml`）には出力されない。** FastAPI の
  router が `Response.headers` 経由で実行時に付与するヘッダーであり、`response_model` の
  スキーマにもレスポンス定義にも現れない。mobile（Orval で `openapi.yaml` を消費する側）から
  はこの契約が見えないため、キャッシュしない前提で実装する必要がある場合は本 ADR
  （またはコードコメント）を参照させること。
- **`config_source` は「最後に値を取得できた出所」を示す。** 決定9-1 のとおり取得失敗時は
  known-good を維持するため、直近の取得が失敗していても、その値が AppConfig 由来なら
  `"appconfig"` を返す（`"default"` に変わるのは一度も取得できていない場合だけ）。
  クライアントは `config_source` で挙動を分岐させないこと（診断用）。

## 追補: mobile のフラグ受け皿（2026-09-20, SS-100）

決定2・決定9・追補 D1/D2/D9/D10 を mobile 側で実際に成立させた実装の記録。
実装は `packages/mobile/src/api/`（`appConfigQueryKey.ts` / `appConfigApi.ts`）、
`src/config/featureFlags.ts`（キー定数）、`src/lib/`（`appConfigSnapshot.ts` /
`featureGate.ts` / `appConfigRefresh.ts`、いずれも純粋関数）、`src/hooks/`（`useAppConfig.ts` /
`useAppConfigBootstrap.ts` / `useFeatureFlag.ts`）、`src/components/app-config/`
（`AppConfigBootstrap.tsx` / `FeatureGate.tsx`）に分かれている。詳細な設計判断は
[packages/mobile/docs/architecture-guideline.md](../../packages/mobile/docs/architecture-guideline.md)
「フィーチャーフラグ（`/app-config`）の扱い」に譲り、ここでは ADR に残す価値のある決定のみを記す
（節番号は D11 以降を使う。**D4 と D6 は欠番のまま**――既に SS-98 追補冒頭で明示済みの欠番であり、
本追補でも詰めて振り直さない）。

### D11: フラグ値の保持場所は TanStack Query、Zustand には複製しない

`queryKey: ["app-config"]` の1本に一本化した。`/app-config` は未認証でも叩けるサーバー状態であり、
[ADR-M-002](../../packages/mobile/adr/ADR-M-002-mobile-tech-stack.md) の「サーバー状態 = TanStack
Query」、および `packages/mobile/docs/folder-structure.md` の「サーバー由来のデータは `src/store/`
に置かない」に従う。`AuthGate` の `loading` 中でも取得を開始できることが、Zustand に持たせる理由が
無いことの根拠になっている。

### D12: キー定数は mobile 側で自前定義し、自動同期はしない

D1 の申し送りどおり `packages/mobile/src/config/featureFlags.ts` に `FEATURE_FLAG_KEYS`
（`as const` オブジェクト + `FeatureFlagKey` 型）を置いた。正典は backend のコード
（D9 のとおり `core/feature_flags.py` の `FEATURE_FLAGS`）であり、このファイルは**その写し**で
機械的な同期はしない（mobile のテストから Python を読むことはしない）。ズレても壊れないよう、
未知キーは常に OFF に倒す（下記 D13）。**SS-100 では実フラグを1つも追加していない**
（backend の登録簿にあるクライアント公開フラグが `app_config_probe`（疎通確認用）の1件のみで、
mobile 側に隠したい未公開機能も現時点で存在しないため）。

### D13: フェイルセーフの具体

- ロード中 / 取得失敗 / 未知キー / 値が bool でない異常応答 → `isFeatureEnabled()` は常に `false`
  （`flags[key] === true` の厳密比較で担保）。
- **ロード中は直近の成功値を保持する。** 再取得（フォアグラウンド復帰）が失敗しても、
  直近に成功した `data` がキャッシュに残っていれば `status: "ready"` のまま扱い、
  画面のチラつき（公開済み機能が一瞬消えて戻る）を避ける。
- 画面ごとフラグで隠す用途では、「まだ分からない（`loading`）」と「OFF が確定した
  （`ready`/`unavailable` の OFF）」を区別できるよう `resolveFeatureGateDecision` が
  `pending` / `enabled` / `disabled` の3値を返す。`loading` 中に確定的な OFF 扱い
  （`<Redirect>` 等）をすると、「フラグ ON なのに起動直後は必ず弾かれる」不具合になるため。

### D14: キャッシュ方針

- `staleTime` 5分 / `gcTime` `Infinity`（一度取れた値は捨てない）/ `refetchOnMount: false`
  （画面遷移のたびに叩かない）。更新の取り込みはフォアグラウンド復帰時の `invalidateQueries`
  （最小間隔60秒）に任せる。
  （**2026-09-21 追補（SS-100、PR #89 レビュー対応）**: 「最小間隔60秒」の起点は当初
  `dataUpdatedAt`（直近成功時刻）のみだったが、これは TanStack Query の仕様上**成功時にしか
  更新されない**ため、取得が失敗し続けている間は起点が進まず絞りが効かなくなる不具合が
  あった（初回失敗なら `dataUpdatedAt` は永久に 0 で毎回 true、成功後の失敗なら古い成功時刻の
  まま前進しない）。`invalidateQueries` 1回は transport のリトライ（`src/api/transientRetry.ts`
  最大3）× TanStack の `retry: 2`（最大3）で最悪9リクエストになりうるため、
  「障害中にだけ絞りが外れる」という最も避けたい壊れ方になっていた。`shouldRefreshOnForeground`
  （`src/lib/appConfigRefresh.ts`）の起点を `lastAttemptedAt = max(dataUpdatedAt, errorUpdatedAt)`
  （直近の**成功または失敗**の時刻）に改め、加えて `isFetching`（実行中）のときは重ねて
  `invalidateQueries` を呼ばないよう false を返すようにした。これは決定9 のフェイルセーフの
  向きを変えるものではない。値が読めない間は従来どおり全フラグ OFF に倒れる。変わるのは
  「無駄打ちを減らす」点のみである）。
- **永続キャッシュ（AsyncStorage 等）は持たない。** 理由は2つ。
  ① 決定9 のフェイルセーフは「読めない時は OFF」であり、前回起動時の ON を永続化すると
  kill switch が効かない端末が生まれ、フェイルセーフの向きが逆転する。
  ②（**2026-09-20 訂正**: 当初「依存追加は [ADR-M-004](../../packages/mobile/adr/ADR-M-004-e2e-build-ci-strategy.md)
  の E2E APK キャッシュを1回ミスさせるコストに見合わない」としていたが、この前提は
  ADR-M-004 自体が 2026-08-14 追補で撤回済みで誤りだった。`packages/mobile/docs/toolsets-libraries.md`
  も「依存追加時の APK キャッシュミスは論点にならない」と明記しており、当時の根拠は成立しない）
  候補である `@react-native-async-storage/async-storage` は**ネイティブモジュール**であり、
  追加すると development build の作り直しが必要になる
  （[ADR-M-003](../../packages/mobile/adr/ADR-M-003-development-build-and-dev-loop.md)
  「再ビルドが必要なのはネイティブが変わるときだけ（native 依存の追加/削除...）」）。
  あわせて依存追加自体に `minimumReleaseAge`（2日）の待機コストも伴う
  （`packages/mobile/docs/toolsets-libraries.md`）。得られるのは起動直後の数百 ms の
  チラつき低減のみで、このコストに見合わない。**結論（永続キャッシュを持たない）自体は変わらない。**
- **サインイン完了後の `/app-config` 再取得は実装しない。** 追補 D2 が「サインイン完了後に
  `/app-config` を再取得する」と mobile 側に申し送っていたが、D2 自体がダークローンチ
  （ユーザー条件付きフラグ）を不採用としており、現状の応答は未認証/認証後で同一であるため、
  今入れても「必ず同じ値が返ってくる再取得」を1本足すだけになり決定6 の精神（使われない分岐を
  残さない）に反する。将来 D2 を覆す際の拡張点は `src/hooks/useAppConfigBootstrap.ts` の1箇所
  （`useAuthSessionStore` の `status` が `authenticated` に遷移したら
  `invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY })` を呼ぶ）に特定してある。

### D15: サインアウト時のクリア対象から `/app-config` を除外する

`src/api/queryClient.ts` のサインアウト時後始末（[ADR-M-009](../../packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md)
決定6）を `queryClient.clear()` から `removeQueries({ predicate: ... })` に変更し、
`/app-config` のキャッシュだけを対象外にした。ユーザー非依存の公開設定を「共有端末での前ユーザーの
データ漏れ防止」という決定6 の目的に巻き込む必要が無いため（除外できるのは D2 がダークローンチを
不採用としているからで、D2 を覆す場合はこの除外も見直しが必要。詳細は ADR-M-009 の SS-100 追補）。

### D16: `config_source` は mobile の内部型から落として分岐を構造的に禁止した

mobile 側の `AppConfigSnapshot`（`src/lib/appConfigSnapshot.ts`）は意図的に `config_source` を
持たない。D1 が「クライアントはこの値で分岐してはいけない」と定めているため、プロダクトコードが
参照できる型から落とすことで型システムに担保させた。診断表示が必要な開発ツール画面
（`/dev-screens` の `AppConfigDebugCard`。本番ビルド以外で開ける）だけは別 hook（`useAppConfigDiagnostics()`）から読む。
（SS-148 追補: `/dev-screens` を開けるのは「本番以外のビルド」になり、staging（TestFlight）でも表示される。
`config_source` で分岐しない方針は変わらない。ADR-M-007 SS-148 追補）

### D17: `minimum_supported_versions` は保持のみ

`AppConfigSnapshot.minimumSupportedVersions`（`{ ios: string | null; android: string | null }`。
`undefined` は `null` に畳み済み）として保持するところまでが SS-100 のスコープ。バージョン比較・
アップデート促進 UI は SS-101 の責務（D1 の表の docstring どおり）。
（**SS-101 追補**: 比較と全画面の案内は末尾の「SS-101 追補」D29〜D32 で実装した）

### D18: mobile 側に `services/` の real/mock 層は作らなかった

フラグ取得は HTTP で完結し、ネイティブ機能にも認証にも依存しない
（`packages/mobile/docs/folder-structure.md` は `services/` を「認証・実機依存機能」の器と
定義している）。ユニットテストは Orval の msw ハンドラで、E2E は実 backend で足りる。
ローカルで ON/OFF を試す手段も backend 側に既にある（D5 の `FEATURE_FLAG_MODE=stub` +
`FEATURE_FLAG_STUB_DOCUMENT`）。mobile に3つ目のモード環境変数を増やすと、「端末側で ON にできる」
抜け道を作ることになり、フラグの正典が2つになる。

## 追補: フラグ切り替えワークフロー（2026-09-21, SS-99）

決定6 と SS-98 追補 D7/D9 を満たす切り替え経路の実装記録。実装は
`.github/workflows/feature-flags.yml`、`packages/backend/feature-flags.json`（定義ファイル）、
`packages/backend/scripts/feature_flags_document.py`（投入する版の組み立て）。運用手順は
[release-runbook.md](../release-runbook.md) §3 に置く。節番号は D19 以降を使う。

### D19: 定義ファイルは AppConfig FeatureFlags 形式そのもので、既定値を `values` に持つ

- 置き場所は `packages/backend/feature-flags.json`。登録簿（`core/feature_flags.py`）と同じ package に置き、
  キー集合の一致（登録簿の全キー + 予約キー `client_requirements`）を pytest で検査する（D9 の推奨どおり）。
- 形式は D7 の「書き込む側」の JSON そのもの（`version` / `flags` / `values`）。`values` は既定値で、
  通常のフラグは `enabled: false`、`client_requirements` は `enabled: true` 以外を検査で弾く（決定9・D7）。
  独自形式にしないのは、変換層を持たずに済み、未配信の環境への最初の版がこのファイルからそのまま作れるため。
- 説明文は登録簿（Python）と定義ファイルの両方にある。一致は検査しない（キー集合だけ）。
  AppConfig 側の `description` は運用者がコンソールで読む補助情報で、正典は登録簿のまま（D9）。

### D20: フラグの現在値の正本は AppConfig。ワークフローは現在値を引き継いで1本だけ書き換える

- hosted configuration version は文書全体を置き換えるため、「1本を切り替える」には他のフラグの現在値が要る。
  値をリポジトリのファイルに持たせる案は、フラグを倒すたびに PR が要り、決定1（デプロイとリリースの分離）に反するので採らない。
- 現在値は「その環境で直近に配信を完了した（`COMPLETE`）版」を `ListDeployments` → `GetHostedConfigurationVersion`
  で読む。`ROLLED_BACK` の配信は飛ばす（実際に配信されている値ではないため）。未配信なら定義ファイルの既定値から始める。
- 定義ファイルに増えたキーは既定値で足す。定義に無い属性は落とすが、`_` で始まる AppConfig の予約フィールド
  （`_variants` 等）は残す。
- **定義ファイルから消えたキーは、既定では定義ごと維持し、`prune` 入力を付けたときだけ落とす。**
  prod の backend は main から手動でデプロイするので、フラグ削除 PR のマージ後もしばらくは古い backend が
  そのキーを読んでいる。ここで自動で落とすと、無関係なフラグを切り替えただけで ON の機能が消える。
  dev で古い ref から起動した場合も、新しいフラグの ON を黙って失わない。
  （PR レビュー指摘による変更。当初案は「次の切り替えで自動的に消える」だった）
- `client_requirements` は切り替え対象にせず、組み立て時に必ず `enabled: true` に戻す（D7）。
- **直近の `COMPLETE` の配信が指す版が削除されていたら、既定では失敗させる。** `from_defaults` 入力を付けたときだけ
  定義ファイルの既定値から組み立てる。現在値が分からないまま既定値（全 OFF）に倒すと、prod では公開済みの機能が
  黙って消えるため。ワークフローのロールは版を削除できず、infra の資格情報による操作でしか起きない。
  （2026-09-22 追記: dev の初回実行で実際に起きた。infra の疎通確認手順が、テスト用の版を配信してから削除していたため）
- 現在の版と内容が同じなら配信しない（Job Summary に「変更なし」を出す）。比較では AppConfig が付けうる
  `_createdAt` / `_updatedAt` を除く。
- 定義ファイルは AppConfig のスキーマが弾くもの（未知のキー、`name` 64 文字超、`description` 1024 文字超、
  属性 25 個超）を `prepare` job で先に弾く。prod では承認後に失敗させないため。

### D21: 入力・認証・Environment

- 入力は `environment`（development / production）・`flag`（自由入力。定義ファイルで検査）・`state`（`off` / `on`、既定 `off`）。
  `flag` を choice にしないのは、フラグの追加・削除のたびにワークフロー定義まで変えることになるため。
  検査は承認待ちに入る前の `prepare` job（AWS に触らない）で行う。
- 認証は infra SS-96 のロール `sanposcape-<env>-feature-flags`。ARN は Environment Variables
  `AWS_FEATURE_FLAGS_ROLE_ARN`（`AWS_SAM_DEPLOY_ROLE_ARN` と同じ扱い。秘密ではない）。Secrets は使わない。
- GitHub Environment は backend のデプロイと共用の `development` / `production`（infra のロールの trust の既定）。
  production の Required reviewers と main 限定がそのまま効き、ワークフロー側でも production は main 以外から起動すると落とす。
- 2026-09-21 時点で dev はロールと AppConfig が揃っている（infra 側で確認済み）。prod は `live/platform` が未 apply で、
  ロールも AppConfig も無い。（**2026-10-17 棚卸し追補**: prod の `live/platform` も apply 済みで、`production` Environment に `AWS_FEATURE_FLAGS_ROLE_ARN` を設定し、2026-10-17 に production で実行した）
- AppConfig の ID は SSM `/sanposcape/<env>/platform/appconfig/*` から読み、`::add-mask::` でログから隠す
  （public リポジトリの Actions ログは公開されるため。リポジトリに ID を置かないのと同じ理由）。
- OIDC トークンを持つ job ではサードパーティの依存を入れない（aws CLI と python3 の標準ライブラリのみ）。
  組み立てスクリプトを標準ライブラリで書き、backend のパッケージ（`sanposcape`）を import しないのはこのため。
  そのぶん `FLAG_KEY_PATTERN` / 予約キーをスクリプト側に写しており、一致は pytest で検査する。

### D22: ベイク中の衝突は直列化と完了待ちで吸収し、`StopDeployment` は組み込まない

- 同一環境で配信中（ベイク中を含む）は次の `StartDeployment` が `ConflictException` になる。
  ワークフローは `concurrency: feature-flags-<environment>`（取り消さない）で直列化し、各 run が
  `GetDeployment` で `COMPLETE` まで待つ（上限 20 分）ので、後の run は衝突しない。
  ただし GitHub の仕様で待機できる run は group ごとに1つで、待機中にさらに起動すると待機していた run は
  キャンセルされる。これは仕組みでは防がず、runbook で「run の成功を確認する」ことで扱う。
  それでも進行中の配信が見つかった場合（ワークフロー外から始めた配信）は、何もせずに失敗させる。
- 引き返しは逆の値での再実行で行う。`StopDeployment`（ロールには権限がある）はワークフローに入れていない。
  prod のベイクは1分で、入れるとワークフローの入力と分岐が増える割に得るものが小さいため。必要になったら追加する。
- hosted configuration version の作成に楽観ロック（`--latest-version-number`）は使っていない。
  書き込み経路がこのワークフローだけで、環境ごとに直列化しているため。

### D23: 最低サポートバージョンの変更入力は持たない（SS-101 に送る）

`client_requirements` の属性値（`ios_minimum_version` / `android_minimum_version`）は現在値を引き継ぐだけで、
変更する入力は無い。値を使う側（SS-101 のアップデート促進）が未実装で、今入れても検証できない入力を
1つ増やすだけになるため。SS-101 で必要になったときに、同じワークフローへの入力追加か別ワークフローかを決める。
（**SS-101 追補**: SS-101 でも入力は足さず、最初の contract を計画するときに決める。末尾の「SS-101 追補」D33）

## 追補: Lambda で lifespan が呼び出しごとに走っていた件の訂正（2026-10-04, SS-183）

backend の Lambda ハンドラー（`aws_lambda/api.py`）は `Mangum(app, lifespan="auto")` で作られていた。
mangum 0.22.0 はこの設定で、Lambda の呼び出しのたびに FastAPI の lifespan を startup / shutdown させる。
そのため `main._lifespan` が作るフラグの取得元（`AppConfigFlagSource` と `FeatureFlags`）は、
SS-98 以来 Lambda では呼び出しごとに作り直されていた。原因と直し方は
[ADR-005 の SS-183 追補](./ADR-005-backend-serverless-deployment-lambda-function-url.md) に記録した。
本 ADR に関係するのは次の訂正だけで、決定そのものは変えていない。

- **決定2**「実行環境ごとにセッションを 1 回開き…」は成り立っていなかった。`/app-config` のたびに
  `StartConfigurationSession` と `GetLatestConfiguration` が走っていた。
- **決定9-1** の known-good の維持は、呼び出しをまたいでは効いていなかった。取得に失敗した呼び出しは、
  直前の呼び出しで取得できた値を持たないため、`config_source: "default"`（全フラグ OFF）に倒れていた。
- **SS-98 追補 D3** の「`_lifespan`（コールドスタート時に1回実行される）」は事実に反していた。
  コールドスタートで AppConfig を取りに行かない、という D3 の決定自体は守られていた。

SS-183 で、Lambda では lifespan を init で 1 回だけ起動する形にしたため、上の 3 つは記述どおりの挙動になった
（pytest の境界のテストで確認済み。dev での確認は [ADR-005](./ADR-005-backend-serverless-deployment-lambda-function-url.md) の SS-183 追補の未解決を参照）。
（**2026-10-17 棚卸し追補**: 2026-10-17 に作業者が dev・prod で確認した）

**運用への影響**: SS-183 より前の Lambda では、呼び出しごとに取得し直していたため、フラグを切り替えると
ポーリング間隔を待たずに次の呼び出しで反映される挙動だった（dev でのフラグの切り替えの実行実績は無く、
観測した事実ではない）。（**2026-10-17 棚卸し追補**: 実際には 2026-09-22 に dev で切り替えを実行していた。この挙動を観測した記録は無い）今後は D10 と
[packages/backend/docs/deployment.md](../../packages/backend/docs/deployment.md) のとおり、
AppConfig のベイク時間に加えてポーリング間隔（既定 60 秒）ぶん遅れて反映される。

## 追補: mobile（iOS）の本番の TestFlight 配信と、公開後のタグ・Release の作成（2026-10-17, SS-213）

決定4・決定5 の mobile 分（SS-102 が予定していたもの）を、iOS について実装した。
ワークフローは `.github/workflows/mobile-production-testflight.yml`（TestFlight 配信）と
`.github/workflows/mobile-production-release.yml`（タグ・Release の作成）の2本で、手順は
[release-runbook.md](../release-runbook.md) §4.1、初回の準備は
[build-profiles.md](../../packages/mobile/docs/build-profiles.md)「本番の TestFlight 配信」にある。

### D24: TestFlight への配信と、タグ・Release の作成を別のワークフローに分ける

TestFlight に上げただけでは利用者に公開していない。決定5 は「本番に出ているもの」に番号を振る規則で、
backend では production へのデプロイの成功がその時点にあたる。mobile ではストアでの公開がその時点にあたり、
公開操作（審査提出・「このバージョンをリリース」）は App Store Connect で手動で行う（決定3）。
CI からは公開の時点を検知できないため、**公開した後に人が Release 作成のワークフローを起動する**。
`production` Environment の承認者が、承認の際に公開済みであることを確かめる。

そのために、Release 作成のワークフローは2つの job に分ける。Environment の承認は job の開始前に求められるので、
1つの job にすると検査が承認の後にしか走らず、承認者は入力の BUILD_ID（UUID）しか見られない。

- `resolve`（Environment 無し・`contents: read`）: ビルドを引いて検査し、作成するタグ・version・buildNumber・コミットを Job Summary に出す。
  承認者はこの version・buildNumber を App Store Connect で公開したビルドと照合してから承認する。
- `release`（`production`・`contents: write`）: checkout・ハッシュで検証した git-cliff・`gh` だけでタグと Release を作る。
  `pnpm install` と `npx eas-cli` のコード（版を固定していない npm の依存）は書き込み権限を持つ job で動かさない
  （backend-deploy.yml・feature-flags.yml の prepare と同じ考え方）。
  （**SS-103 追補**: eas-cli は devDependency に固定し `pnpm exec eas` になった（D38）。依存のコードを書き込み権限の job で動かさない方針は変えない）
  resolve の出力は信用せず、release job でコミットが main 上にあることとそのコミットの version を確かめ直す。
  git-cliff の設定（`cliff.toml`。`replace_command` でコマンドを実行できる）は、ビルドのコミットのものではなく main の先頭のものを使う。

TestFlight に上げたが公開しなかったビルドにはタグを付けない。

### D25: Release 作成の入力は EAS の BUILD_ID とし、再ビルドしない

Release 作成のワークフローは、TestFlight 配信のワークフローの Job Summary に出る BUILD_ID を受け取り、
`eas build:view` で EAS が記録したビルドのコミット（`gitCommitHash`）と version（`appVersion`）を引いて、
そのコミットにタグを付ける。

- コミット SHA や version を入力にすると、人が対応を調べることになり、公開したビルドとは別のコミットにタグを付けうる。
  BUILD_ID ならストアに出したバイナリとタグの対応が機械的に決まる。
- 本番の iOS ストア向けの完了済みビルド（bundle ID `com.sanposcape.app`）であること、コミットが main にあること、そのコミットの `app.json` の `version` と
  ビルドの version が一致することを確かめてから作る。
- `eas build:view --json` の出力は成果物（.ipa）のダウンロード URL を含むため、ログに出さない（public リポジトリ。ADR-006 の SS-79 追補と同じ配慮）。

### D26: mobile のタグの version は git-cliff で bump せず、`app.json` の `version` をそのまま使う

決定4 は「バージョン規則・スキップ条件は ADR-005 の SS-72 追補をそのまま他アプリへ適用する」としているが、
同じ決定4 が mobile のキーを「`app.json` の表示用 `version` のみ」としている。mobile の `version` は OTA の互換境界として
人がリリース単位で上げる値で（ADR-006 の SS-89 追補）、ストアに出した version と別の番号をタグに振ると対応が崩れる。
そこで mobile では **git-cliff の bump 規則を使わず、タグは `mobile/v<app.json の version>`** とし、git-cliff はリリースノートの生成だけに使う。

スキップ・失敗の条件も backend から変える。

| 状況 | backend | mobile |
|---|---|---|
| 同じタグが同じコミットにある | スキップ | スキップ（再実行） |
| 同じ version のタグが別のコミットにある | （bump するので起きない） | 失敗（公開済みの version のままビルドした） |
| 最新のタグがコミットの祖先ではない | スキップ（ロールバック） | 失敗（古いコミットのビルドを公開した） |
| リリースノートに載るコミットが無い | スキップ | **タグを作る**（ストアには公開済みのため） |

TestFlight 配信のワークフローは、`app.json` の `version` が最新の `mobile/v*` タグの version 以下ならビルドの前に失敗する。
公開済みの version 以下には App Store Connect がビルドを追加できず、EAS の枠を消費してから提出で失敗するため。

### D27: ストアの「新機能」欄の下書きは、TestFlight 配信の時点でプレビューとして出す

決定4 は Release 用に生成した CHANGELOG を「新機能」欄の下書きにも使うとしていたが、「新機能」欄は審査提出の時点で要り、
Release を作る（公開後）のでは遅い。そこで TestFlight 配信のワークフローが、同じ規則（前回の `mobile/v*` タグ以降の
`packages/mobile/**`）で生成したリリースノートを Job Summary にプレビューとして出す。EAS の枠を使わないので、ビルドの前に出す
（提出だけが失敗して手元でやり直す場合も下書きが得られる）。公開後の Release の本文は、
タグを付けるコミットまでで生成し直したものになる。

### D28: TestFlight 配信は main からのみで、承認は付けない

TestFlight 配信のワークフローは main からのみ実行できる（D25 でタグを付けるコミットが main 上にある必要があるため）。
`production` Environment の承認は付けない。TestFlight の内部配信は公開ではなく、公開の判断は App Store Connect の手動操作と
Release 作成の承認で行うため。`EXPO_TOKEN` はリポジトリ Secret のまま使う（Environment Secret への移動は SS-103）。
（**SS-103 追補**: リポジトリ Secret の `EXPO_TOKEN` は Developer ロールの robot user に入れ替え、そのまま使う。Environment は付けない。D34）
Android（Google Play）の本番提出は未整備で、どちらのワークフローも iOS だけを扱う。

### 未解決・持ち越し（SS-213 追補）

- **どちらのワークフローも実行実績が無い。** 本番のアプリレコード・本番識別子のクレデンシャル・ビルド番号の初期化などの
  手作業の準備（build-profiles.md）が終わってから初回を実行する。`eas build:view --json` の出力のキー（`gitCommitHash` など）は
  eas-cli 23.2.0 のソースで確かめたもので、実際の応答では未確認。
  （**2026-10-17 棚卸し追補**: 手作業の準備を済ませ、TestFlight 配信は 2026-10-17 に実行した（成功）。Release 作成はストア公開が未実施のため未実行で、`eas build:view --json` の実際の応答も未確認のまま）
- **Android の本番提出とタグ**: Google Play への提出を整備するときに、Release 作成の入力（iOS の BUILD_ID）をどう広げるかを決める。
  iOS と Android で同じ version を公開する前提なら、タグは1つのまま。
- ~~SS-103 で `EXPO_TOKEN` を Environment Secret に移すとき、TestFlight 配信のワークフローにも Environment を付けることになる（D28 の見直し）。~~
  → SS-103 で決着。トークンを Expo の権限で分け、Developer のトークンはリポジトリ Secret に残したので、TestFlight 配信に Environment は付けない（D34）
- ~~`npx eas-cli` の版を固定していない（既存の `mobile-release-build.yml` と同じ）。npm の公開が乗っ取られると、公開直後の版が
  `EXPO_TOKEN` を読める（`pnpm-workspace.yaml` の `minimumReleaseAge` も効かない）。mobile のワークフロー全体で固定の方法を揃えて決める。~~
  → SS-103 で決着。devDependency に固定し、5本とも `pnpm exec eas`（D38）

## 追補: mobile の最低サポートバージョンを下回るアプリへのアップデートの案内（2026-10-17, SS-101）

決定7 の contract の前提（「最低サポートバージョンを下回るアプリにはアップデートを促す」）の mobile 側の実装記録。
SS-100 追補 D17 で保持だけにしていた `AppConfigSnapshot.minimumSupportedVersions` を使う。
実装は `packages/mobile/src/features/app-update/`（判定は `lib/`、表示は `components/UpdateRequiredGate.tsx`）で、
`app/_layout.tsx` に1つ置く。`/app-config` のスキーマは変えていない。節番号は D29 以降を使う。

### D29: 閉じられない全画面の案内にする

- 最低サポートバージョンを下回ったら、全画面の案内（「アップデートが必要です」とストアを開くボタン）を出し、**閉じる手段を置かない**
  （Android の戻る操作も受け止めて何もしない）。contract は「最低バージョン未満の端末が API を使わない」ことを前提にするため、
  「後で」で閉じられる案内では前提にならない。推奨と必須の2段階にするには `/app-config` の拡張が要り、今の要件に無い。
- 判定は起動時だけでなく、`/app-config` の値が変わるたびに行う（フォアグラウンド復帰の再取得で上がった最低バージョンも拾う。D14）。
  最低バージョンが下がれば案内は消える。
- 表示は RN の `Modal` で `<Stack>` の上に重ねる。`<Stack>` を条件付きで差し替えるとナビゲータが作り直されるため。
  `Modal` にしたのは、画面側の `Dialog` / `BottomSheet`（これも `Modal`）より上に出し、Android の戻る操作を受け止めるため。

### D30: 判定できないときは出さない（強制しない側に倒す）

- 出すのは `status: "ready"`（直近の成功値がある。再取得の失敗中を含む）で、その OS の最低バージョンより実行中のバージョンが
  小さいときだけ。`loading`・`unavailable`、最低バージョンが `null`・形式不正、実行中のバージョンが取れない・形式不正のときは出さない。
  D1 の「`null` = 強制アップデートしない」、決定9 の fail-safe と同じ向きで、通信断や設定の誤りで全端末をふさがないため。
- 比較は `X.Y.Z` を数値の組として行う（`0.10.0` > `0.9.0`）。backend の `_VERSION_PATTERN` が形式不正を `null` に畳んで配るので、
  mobile の検査は防御のための二重チェック。ただし backend は Python の `re` の `\d` と `$` で検査するため、末尾の改行や
  ASCII 以外の数字（例: アラビア数字）を通す。mobile はこれを形式不正として扱い、案内は出ない（強制しない側）。値は ASCII の `X.Y.Z` で入れる。

### D31: 散歩中と、保存されていない散歩をまだ保存できる間は出さない

散歩は永続化されず（ADR-M-008）、ストアへ移ってアプリが終了すると記録を失う。そのため、**まだ記録を残せる間だけ**案内を遅らせる
（判定は `shouldDeferForWalk`）。

- 進行中の散歩がある（`useActiveWalkStore`）。
- 終了したが保存されていない散歩があり（`useFinishedWalkStore` の未保存）、サマリ画面（`/walk-summary`）にいる。
- 同じく未保存の散歩があり、サマリの CTA から来た保存のためのサインインの途中（`signInForSaveRequested` かつ `(auth)` の画面）。
- 未保存の散歩が、まだサマリ画面に着いていない（散歩の終了からサマリへの遷移の途中）。`useSegments()` はナビゲーションの状態が
  変わったコミットより1つ遅れて更新されるため、終了の直後は散歩中の画面のセグメントのまま「散歩中」だけが外れる。ここで遅らせないと、
  終了確認の `Dialog` が閉じるのと同時に案内の `Modal` が一瞬開く。サマリで表示したドラフトの `clientWalkId` を hook が覚えて判定する。
  散歩を終える導線はどれもサマリへ遷移する前提で、サマリを経ないドラフトを作る導線を足すときはこの条件を見直す。

サマリに着いた後に「ホームへ」で離れた未保存のドラフトは、サインアウトか次の散歩まで残るが、戻って保存する導線が無い。
これを条件に含めると、保存が失敗し続けた端末（ゲスト・422・再試行上限）ではアプリを再起動するまで案内が出なくなるため、
サマリを離れた時点で遅らせるのをやめる（SS-101 のレビューで判明）。
contract は最低バージョンを上げてから古いクライアントが減るのを待って行うので、散歩の終了まで遅らせても互換の問題にはならない。

### D32: 実行中のバージョンは `Constants.expoConfig.version`、ストアの URL はビルドで切り替えない

- 実行中のバージョンは `expo-constants` の `Constants.expoConfig?.version` を読む。OTA の update で起動すると update の manifest の値になるが、
  `runtimeVersion.policy` が `appVersion` なので update は同じ `version` のバイナリにしか届かず、バイナリの `version` と一致する
  （`runtimeVersion` の方針を変えるときはこの前提も見直す）。`expo-application` の `nativeApplicationVersion` は、ネイティブ依存の追加
  （development build の作り直し・`minimumReleaseAge` の待機）に見合わないので使わない。`expo-constants` 57 に `nativeAppVersion` は無い。
  （**SS-230 注記**: `expo-application` はビルド番号を表示するために入れた。`version` は判定と表示で同じ値を1か所で読むため、取得元を替えない。
  [ADR-M-020](../../packages/mobile/adr/ADR-M-020-external-web-pages.md) の SS-230 追補）
- ストアは本番の掲載ページに固定する（iOS: `https://apps.apple.com/app/id<submit.production.ios.ascAppId>`、
  Android: `https://play.google.com/store/apps/details?id=com.sanposcape.app`）。[ADR-M-020](../../packages/mobile/adr/ADR-M-020-external-web-pages.md)
  の法的文書の URL と同じく、ビルドの種類でプロダクトの挙動を分けない（ADR-M-007 の SS-148 追補）。staging・開発ビルドで開くと本番の
  掲載ページになるが、それらは TestFlight・APK で更新する。URL と本番の識別子（`eas.json`・`app.config.ts`）の一致は Vitest で検査する。
- ストアはアプリ内ブラウザではなく `Linking.openURL` で OS に開かせる。アプリ内ブラウザでは Web の掲載ページが開くだけで、ストアのアプリに渡らない。
  開けなければ画面内に URL 付きの案内を出す。

### D33: 最低サポートバージョンを変える入力は SS-101 でも足さない（D23 の持ち越しの判断）

D23 は「SS-101 で必要になったときに、同じワークフローへの入力追加か別ワークフローかを決める」としていた。SS-101 では mobile の受け皿だけを
作り、入力は足さない。最初の contract がまだ計画されておらず、OIDC を持つワークフローの変更は検証の手段も含めて
この課題（mobile）の範囲を超えるため。値が `null` の間は案内は出ない（D30）。最初の contract を計画するときに入力を足す
（それまでは `client_requirements` の属性は現在値の引き継ぎのまま）。ローカルでは backend の `FEATURE_FLAG_STUB_DOCUMENT` の
`client_requirements` で試せる（`packages/mobile/docs/architecture-guideline.md`）。

### 未解決・持ち越し（SS-101 追補）

- **最低サポートバージョンを変える経路が無い**（D33）。決定6 によりコンソールからの直接操作もしない。最初の contract の前に整える。
- E2E（Maestro）は足していない。CI の backend のスタブ文書は `client_requirements` を持たず（= `null`）、案内が出ると他のフローを
  すべてふさぐため。判定は Vitest で守る。2026-10-17 に Android エミュレータ（backend のスタブで最低バージョン 99.0.0）で、
  起動時の表示・戻る操作で閉じないこと・ストアの URL を開くこと・散歩中とサマリ画面では出ないこと・サマリから離れると出ることを確かめた。
  iOS の実機と、散歩の終了の瞬間に一瞬開かないこと（D31 の4つ目の条件）は目視では確かめられていない。

## 追補: OTA（EAS Update）の本番配信と、EXPO_TOKEN の分離（2026-10-22, SS-103）

決定8 が予定していた OTA の本番配信を実装した。ワークフローは `.github/workflows/mobile-production-update.yml`、
手順は [release-runbook.md](../release-runbook.md) §6・§8.4 にある。前提として、EAS の project を Organization アカウントへ移した
（[ADR-006](./ADR-006-mobile-app-delivery-eas-hosted.md) の SS-103 追補）。

### D34: `EXPO_TOKEN` を Expo の権限で2つに分け、production channel を protected にする

課題は「`EXPO_TOKEN` を Environment Secret に移し、OTA を `production` Environment の承認に限定する」としていた。
しかしトークンが1つのままでは、承認の無い経路（配布ビルド・TestFlight 配信・E2E。どれも同じトークンを使う）からも
`eas update --channel production` を実行でき、承認が形だけになる。GitHub の Environment が絞れるのは「どの job にトークンが渡るか」だけで、
トークンでできることは狭まらない。そこで Expo 側の権限で分けた。

- Expo の `production` channel を **protected** にする。publish・republish・ロールバック・channel の編集・保護の解除ができるのは
  Release Manager 以上だけになる（Developer は保護されていない channel にしか出せない）。
- robot user を2つ作る。
  - `github-actions-build`（**Developer**）: build・submit・`build:view`・`build:list`・`fingerprint:compare` 用。**リポジトリ Secret** の `EXPO_TOKEN`
  - `github-actions-ota-production`（**Release Manager**）: OTA の本番配信専用。**`production` Environment の Secret** の `EXPO_TOKEN`
- Secret の名前は同じ `EXPO_TOKEN` にする。Environment の Secret は同名のリポジトリ Secret より優先されるので、job に
  `environment: production` を付けるだけで Release Manager のトークンになる。
  **逆に、今後どこかの job に `environment: production` を付けると、その job の `EXPO_TOKEN` は黙って Release Manager に切り替わる。**
  `EXPO_TOKEN` を使う各 job に注記を置いた。
- Developer のトークンはリポジトリ Secret のままでよい。どのブランチから届いても本番の利用者に OTA は出せないため。
  そのため **D28（TestFlight 配信は承認なし）は変えない**。SS-213 追補の未解決「Environment Secret に移すとき TestFlight 配信にも Environment を付ける」は不要になった。
  Release 作成の resolve job に Environment を付けない設計（D24）もそのまま。
- この分け方は **production channel が protected であること**に懸かっている（外れると Developer のトークンで承認なしに本番へ出せる）。
  Expo は project を別のアカウントへ移すと保護を外すので、OTA の prepare は毎回 `eas channel:view production` で保護を確かめ、外れていれば失敗する。
- 採らなかった案: 全 job を `production` に寄せる（E2E の定期実行と作業ブランチからの E2E が止まる）、トークンを1つのまま Environment を分ける（承認が形だけ）、
  Developer 用の Environment を新設する（Developer のトークンの置き場を動かしても守れるものが増えない）。

### D35: OTA の本番配信は、承認の前の検査（prepare）と承認の後の配信（publish）の2 job にする

D24 の Release 作成と同じ理由で分ける（Environment の承認は job の開始前に求められ、1つの job だと検査が承認の後にしか走らない）。

- `prepare`（Environment なし・`contents: read`・Developer のトークン）: 配信先の本番ビルドを引き、D37 の検査をし、承認者が見る Job Summary を出す。
  配信先は、プラットフォームごとに「production channel・`app.json` の `version`（= runtimeVersion）・`production` profile・ストア向け・完了済み」の最新のビルド。
  本番ビルドの無いプラットフォームには配信しない（届く端末が無い。2026-10 時点で Android の本番ビルドは無い）。どちらにも無ければ失敗する。
- `publish`（`production` Environment・Release Manager のトークン）: 同じコミットで `eas update --channel production --environment production` を実行する。
- main の先頭からだけ配信する（`production` Environment のブランチ制限と同じ。前のコミットから出し直す用途には使わない。D39）。
- Summary には、配信先のビルドのコミットから今までの、OTA の JS に入りうるコミットの一覧を出す。範囲は `packages/mobile` に加えて
  `packages/backend/openapi.yaml`（orval の入力）・`pnpm-lock.yaml`・`pnpm-workspace.yaml`・ルートの `package.json`（mobile-ci.yml の paths と同じ考え方）。
  承認者はその中身が決定8 の範囲（公開済み機能の不具合修正・フラグ OFF の新機能）に収まることを確かめてから承認する。
- ビルドのコミットが今のコミットの祖先でなければ失敗する（ビルドに入った変更を OTA で巻き戻すことになるため）。
- publish は `eas update` のバンドル（Metro）のために依存のコードを動かす。Release Manager のトークンと依存のコードが同じ環境に乗るのは避けられないので、
  依存は lockfile で固定する（D38）。D24 の「依存のコードを書き込み権限の job で動かさない」とは別の妥協として記録する。そのうえで次の2つで範囲を狭める。
  - トークンは job 全体ではなく `eas update` の step にだけ渡す（`pnpm install`・orval の step の process env には入らない）。
    ただし同じ job の前の step で動いた依存のコードは、`node_modules` や `GITHUB_PATH` を書き換えて後の step のコードを差し替えられるので、
    これで依存のコードからトークンを守れるわけではない。トークンが不要な step で偶然に読まれる・ログに出る範囲を減らすだけの措置である。
  - publish では pnpm のストアのキャッシュ（`setup-node` の `cache: pnpm`）を使わない。キーは lockfile のハッシュで、トークンを持たない他の job と共有しているため。
- 採らなかった案: バンドルを prepare で作り `eas update --skip-bundler --input-dir` で publish に渡す（トークンのある job で動く依存のコードを eas-cli と app config の評価に絞れるが、
  成果物の受け渡しと、承認の後に検査を置き直す手間が増える。トークンの漏れの影響を減らしたくなったときの候補）。

### D36: OTA の JS は、本番バイナリと同じ `eas.json` の `build.production.env` で作る

`eas update` は build profile の `env` を読まない（`--environment` で読むのは EAS の環境変数だけ）。本番バイナリは
`APP_VARIANT=production` と `EXPO_PUBLIC_BACKEND_API_URL` / `EXPO_PUBLIC_*_MODE` を `eas.json` の `build.production.env` から受け取っており、
与えないと OTA の JS が開発用の設定で作られる（各 `*_MODE` は未設定なら real に倒れるが、接続先は `src/config/env.ts` の開発用の既定
`http://localhost:8000` に落ち、本番アプリが backend に届かなくなる）。

ワークフローは `eas.json` の `build.production.env` を読んで `GITHUB_ENV` に書いてから eas を実行する。値の正本は `eas.json` のままにし、
ワークフローに値を写さない。

**ただし env の優先順位は本番ビルドと逆になる。** `eas build` は EAS の変数の上に build profile の `env` を重ねる（`eas.json` が勝つ）が、
`eas update --environment` は `process.env` の上に EAS の変数を重ねる（EAS が勝つ）（eas-cli 25.2.0 の `evaluateConfigWithEnvVarsAsync` と `update` の実装）。
EAS の production 環境に `eas.json` と同じ名前の変数（例 `EXPO_PUBLIC_BACKEND_API_URL`）があると、OTA の JS だけがその値で作られ、
接続先が https なら app config も変わらないので fingerprint にも現れない。そこで EAS の production 環境（project / account）の変数名を取り、
`build.production.env` と名前が重なれば失敗する（`.github/scripts/check-eas-env-overlap.sh`）。
承認を待つ間に変数が足されうるので、prepare に加えて publish の `eas update` の直前でも同じ検査をする。
変数の名前と更新日時は承認者の Summary にも出す（値は出さない）。名前が同じまま値だけを書き換えられた場合は名前に現れないので、更新日時で気づけるようにする。
さらに、prepare の一覧（名前・scope・更新日時）のハッシュを publish に渡し、配信の直前の一覧と違えば失敗する。
承認の後に足された名前の重ならない変数や、値だけの書き換え（更新日時が変わる）を、承認者が見た状態のまま配信しないため。
名前は `env:list --format long` の各変数の先頭（ID の行の直後の Name の行）から取り、複数行の値の続きの行を名前と取り違えないようにしている。
`env:list` の出力の形が eas-cli の更新で変わったとき（見出しの行が無い・ID の行の数と取れた名前の数が合わない・0 件なのに「No variables found」の行が無い）は失敗する。
更新日時は各変数の最後の欄から日時の形の行だけを採る（複数行の plaintext の値の行を public な Summary に出さないため）。
2026-10-22 時点の EAS の production 環境の変数は `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`・`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`・`GOOGLE_MAPS_ANDROID_SDK_KEY` で、重なりは無い。

### D37: 承認の前に、配信先の本番ビルドとネイティブの fingerprint を比べる

決定8 は「ネイティブを変えたら `version` を上げる」を人の規則としていた（ADR-006 の未解決「`runtimeVersion` を上げるべき変更の見分け方」）。
`runtimeVersion.policy: "appVersion"` では EAS は互換を確かめないので、規則を破った OTA は既存の端末へ互換の無い JS として届き、起動直後に落ちうる（§8.4 の手段でも戻せない場合がある）。
そこで prepare が、配信先のビルドの fingerprint と今のコミットの fingerprint を比べ、ハッシュが違えば失敗させる。

- ビルドの側は、EAS がビルドの時に記録した `build:list` の `fingerprint.hash` を使う。今のコミットの側は
  `eas fingerprint:generate --platform <p> --build-profile production` で計算する。`--build-profile` は `eas build` と同じ関数で env を組み立てるので、
  本番ビルドと同じ優先順位（`eas.json` が勝つ）で計算できる（自前の計算と EAS の記録を混ぜない）。
- `eas fingerprint:compare --json` は判定に使わない。ビルドの fingerprint の source（EAS 側の保存は期限付き）が取れないと、ハッシュが同じでも失敗するため。
  一致しないときに違う項目を見せるためだけに、JSON なしの compare を best-effort で使う。
- 比べるのは配信先の最新のビルドだけ。同じ `version` の古いビルドとネイティブが違う状態は、それ自体が規則の違反で、ここでは検出しない。
  最新のビルドが利用者に公開したビルドより新しい（未公開の）場合は、比較の相手もコミット一覧の起点もそちらになり、一覧から公開ビルドとの間のコミットが抜ける。
- 差分の中身（app config の行）はログに出さず、違う項目の見出しとパスだけを出す。Android の本番ビルドでは Maps SDK キーが app config に入るため（public リポジトリ）。
  中身は手元で `eas fingerprint:compare` を実行して見る（runbook §6.1）。
- fingerprint はネイティブの互換に関わらない変更でも変わることがある。lockfile の変更で依存の配置（hoisting）が動いたとき、`.gitignore` を変えたとき、
  `owner` などの app config を変えたとき。どれも安全側（OTA を出さない）に倒れ、ストアで配布し直すことになる。
- 実測（2026-10-22、手元）: 10/18 の 1.0.0 の本番ビルド（`ce18a29`）と比べると、違いは `owner`（Organization への移管）・
  eas-cli の追加で app config の評価が読む `bplist-parser` の置き場所（版は同じ）・`packages/mobile/.gitignore`（`credentials.json` の追加）だけだった。
  どれもアプリの動きには影響しないが、**このビルドへは OTA を配信できない**。次の本番ビルドから配信できる。
- 採らなかった案: `fingerprint.config.js` で `owner` などを除く（記録済みのビルドの fingerprint は変わらず、今回の不一致は解消しない。owner の変更は一度きり）。

### D38: eas-cli は `packages/mobile` の devDependency に固定版で入れ、CI は `pnpm exec eas` で使う

SS-213 追補の未解決（`npx eas-cli` の版を固定していない）の決着。`npx eas-cli` は実行のたびに npm の最新版を取り、
`minimumReleaseAge`・Dependabot の cooldown・lockfile の検証のどれも効いていなかった。本番へ即時に届く OTA を CI から出す前に固定した。

- `eas-cli@25.2.0` を exact で入れ、5本のワークフロー（E2E・配布ビルド・本番 TestFlight 配信・Release 作成・OTA）は `pnpm install --frozen-lockfile` の後に `pnpm exec eas` を使う。版の更新は Dependabot の PR で行う。
- hoisted linker のため、eas-cli の依存に押されてトップレベルの 8 パッケージが入れ替わる（宣言している側には入れ子で元の版が入る）。
  追加の前後で、`@expo/*` と `expo-updates` の版、本番の env での `expo export --no-bytecode` の iOS バンドルが同一であることを確かめた
  （CI と同じ `pnpm install --frozen-lockfile` の配置でも同一）。native の fingerprint は変わる（D37 の実測）。今後の eas-cli の更新でも配置が動けば変わりうる。
- 採らなかった案: `npx eas-cli@<版>`（lockfile の検証と Dependabot の更新が効かない）、別ディレクトリの npm の lockfile（ツールチェーンが2つになる）。

### D39: OTA のロールバックは、Expo の Owner が手元で行う

protected channel を戻す操作（`eas update:republish` / `update:roll-back-to-embedded`）も Release Manager 以上が要る。
Release Manager のトークンは人に渡さず CI の `production` Environment にだけ置いているので、ロールバックは Owner が手元のログインで行う（runbook §8.4）。
ロールバックのワークフローと、OTA の段階的公開（`--rollout-percentage`。ロールアウトの終了も protected の操作になる）は、使う場面が出るまで作らない。

### 未解決・持ち越し（SS-103 追補）

- **OTA の本番配信は未実行。** Release Manager のトークンでの `eas update` と、`eas update --json` の応答（update group の取り出し）は初回の実行まで未確認。
  1.0.0 の本番ビルドへは D37 の不一致で配信できないので、初回は次の本番ビルドの後になる。
- prepare の検査は手元のログイン（Owner）で各ステップを実行して確かめた。Developer のトークンでの `channel:view`・`env:list`・`build:list`・`fingerprint:generate` は、
  マージ後の初回の実行まで未確認。Developer のトークンでの build・submit・E2E も、トークンを替えてからまだ実行していない。
- **Developer ロールが EAS の環境変数を作成・編集できるかは未確認**（Expo のドキュメントに記載が無く、protected の対象は今は channel だけ）。
  できる場合、D36 の名前の重なりの検査は新しい変数の追加を止めるが、既存の変数（`EXPO_PUBLIC_GOOGLE_*`）の値の書き換えは名前に現れず、次の OTA に入る
  （本番ビルドにも入る）。承認者が気づける手がかりは Summary の更新日時だけ。Developer の robot user で `eas env:create` が拒否されるかを確かめる。
- Developer のトークンでも `production` profile・`production` channel のビルドを作れ、ビルドの `gitCommitHash` はクライアントが申告する値なので、
  D37 が比べる「最新の本番ビルド」をすり替えられうる。影響は互換の検査が誤ることで、承認の迂回ではない。
- Android の本番ビルドを作る段で、`GOOGLE_MAPS_ANDROID_SDK_KEY` を EAS に `secret` で置くと CLI から読めず、`fingerprint:generate` の app config にキーが入らないため、
  ビルドの fingerprint と毎回一致しない可能性がある。その段で、置き方と fingerprint に入る項目を確かめる。
- `expo-updates` のコード署名（`updates.codeSigningCertificate`）は設定していない。Release Manager のトークンか Expo の Owner のアカウントが乗っ取られると、
  任意の JS が本番の利用者へ届く（今回の差分の前からある前提）。
- 以前の `EXPO_TOKEN`（個人アカウントのトークン）の無効化は、Developer のトークンでの実行を確かめた後に行う（人の作業）。
- `ci-e2e` Environment はブランチ制限を指定する設定だが規則が0件で、作業ブランチからも実行できる（本追補の範囲外。`mobile-e2e.yml` のコメントは「ブランチ制限で到達経路を絞る」としている）。

## 追補: 公開後の互換性 ―― mobile が見るフラグの2段階の削除と、互換性台帳（2026-10-24, SS-233）

mobile の 1.0.0 がストアの審査に入り、公開の後は配布済みのアプリが更新されないまま backend を叩き続ける。
mobile・backend とも任意のタイミングで本番にデプロイしてよい（決定1）が、そのたびに公開済みのアプリへ影響を出さないことを、
フラグ（決定2）と expand / contract（決定7）で守る。本追補は、その規則のうち決定6 の削除の段階と、
「互換のために残しているもの」をいつ片付けるかの管理に穴があったのを埋める。

### D40: mobile が見るフラグ（`audience: "client"`）の削除は、backend が固定値を返す期間を挟んだ2段階にする

決定6 の「削除」は、分岐とフラグ定義を1つの PR で消すとしていた（mobile の文書・コードのコメントも
「backend の登録簿と mobile の分岐を同じ PR で消す」としていた）。しかし mobile は `/app-config` の未知のキーを OFF として扱う（SS-100 追補 D13）。
backend の登録簿からキーを消すと、そのキーで機能を出し分けている配布済みのアプリでは、公開済みの機能が消える。
1.0.0（`ce18a29`）は `pin_registration` でピンタブ・ピン登録・地図一覧・ナビタブの地図の登録済みピンを出し分けており、本番では 2026-10-17 から ON なので、
従来の手順で `pin_registration` を消すと 1.0.0 からピン機能が消える。

SS-98 追補 D1 の「古いビルドは未知キーを読めなくなるだけで壊れない」は、**API のスキーマが壊れない**という意味では正しいが、
**機能は消える**。フラグを map にした決定（D1）はそのままに、削除の手順の側で吸収する。

| 段階 | やること | 片付けてよい条件 |
|---|---|---|
| 1. フラグの削除 | backend の分岐と `feature-flags.json` のキーを消し、登録簿ではそのキーを**固定値を返すキー**に移す（`/app-config` は AppConfig を見ずに固定値を返す）。mobile の分岐・キー定数・テストも同じ PR で消してよい（後の PR でもよい）。[互換性台帳](../compat-ledger.md)の行を「固定値で返している」に更新する（行は ON にした時点で足してある。D41） | ―― |
| 2. 固定値の削除 | 登録簿から固定値を消し、台帳の行を外す。AppConfig に残っている値もここで `prune` して消す | 最低サポートバージョン（iOS・Android とも）が、分岐を消したコードを**ストアのバイナリに埋め込んだ**最初の version 以上になり、そのバージョン以上のアプリだけが残ったと言える状態になった後（決定7）。OTA で分岐の無い JS を届けた version は数えない（OTA を当てていない端末や、埋め込みの JS へ戻した端末に分岐が残るため） |

- 対象は**本番で現在 ON のフラグ**（固定値が `true` になるもの）。固定値は、AppConfig の取得の状態に関わらず返す（一度も取得できていない間に全フラグを OFF に倒す決定9 より優先する。公開済みの機能は、取得に失敗しても消さない）。
- **本番で現在 OFF のフラグは、段階1 で固定値を置かずに消してよい**（未知のキーは OFF と同じ。一度も ON にしなかったフラグ、OFF に戻して機能ごと廃止するフラグ）。
  ただし機能ごと廃止する場合は、その機能が使う API の扱いを別に決定7 で考える。
- **backend だけが見るフラグ（`audience: "backend"`）は従来どおり1つの PR で消す。** 配布済みのアプリはそのキーを見ていない。
- 固定値の置き場所は **backend のコード（登録簿、`core/feature_flags.py`）** とする。段階1 で定義ファイルからはキーを消すが、
  **AppConfig の値は段階2 まで `prune` しない**。段階1 より前の backend へ戻した（runbook §8.2）とき、戻した backend は AppConfig の値を読むので、
  `prune` 済みだと `false` になり、配布済みのアプリから機能が消える。しかも prod の切り替えは main からしか起動できず、main の定義ファイルにはキーが無いので、
  ワークフローで ON に戻せない（`validate` で落ちる）。定義ファイルに無いキーはワークフローから切り替えられないので、残しておいても下の「AppConfig に ON のまま残す」案の欠点には当たらない。
- 採らなかった案:
  - AppConfig に ON のまま残す: ワークフローから切り替えられてしまう（OFF にすると配布済みのアプリから機能が消える）うえ、分岐の無いフラグが定義ファイルに残り、
    「定義ファイルのキー集合 = 登録簿 + 予約キー」の検査（SS-99 追補 D19）の意味が曖昧になる。
  - mobile の分岐だけ先に消し、backend の登録簿は最低サポートバージョンが上がるまで消さない: 段階1 の間、使われていないフラグが切り替えられる形で残り続ける点が上と同じ。
  - フラグを map ではなく固定キーのオブジェクトにする（D1 の見直し）: キーの削除が OpenAPI の破壊的変更になるだけで、配布済みのアプリから機能が消える問題は変わらない。
- 固定値を返す仕組み（登録簿の型・`/app-config` の組み立て・定義ファイルとのキー集合の検査（SS-99 追補 D19）から固定値のキーを除く）は、まだ実装していない。最初に mobile が見るフラグを消す課題
  （`pin_registration` の削除）で実装する。

### D41: 互換のために残しているものを「互換性台帳」（`docs/compat-ledger.md`）で一覧する

決定7 は「最低サポートバージョン以上のクライアントだけが残ってから contract する」としているが、何が contract を待っているかの一覧が無かった。
条件はコードのコメントや各 ADR に散らばり、最低サポートバージョンを上げるときに見る場所が無い。プライバシーポリシーの記述についてだけ、
[データ取扱い台帳](../privacy/data-inventory.md) 6 に同じ形の一覧があった（SS-231）。

- [互換性台帳](../compat-ledger.md)を新設する。載せるのは、配布済みのアプリ・稼働中の backend のために残している次のもの。
  - mobile が見るフラグ（ON にした後の削除待ち、D40 の固定値）。本番で ON にした時点で行を足す（その時点から削除に2段階が要るため）。D40 の段階1 で状態を更新し、段階2 で外す
  - 非推奨のエンドポイント・フィールド（`deprecated=True` など。決定7）
  - 本来は必須だが、配布済みのアプリのために任意にしているリクエストの項目（後で必須にする）
  - 後で NOT NULL にする列・消す列（決定7 の DB スキーマ）
- 片付けてよい条件は2種類に分けて書く。
  - **最低サポートバージョン**: 配布済みのアプリが原因で残すもの（フラグの固定値・非推奨 API・リクエストの必須化）
  - **全環境の backend のデプロイ（と migrate）**: 稼働中の backend が原因で残すもの（NOT NULL 化・古い列の削除・backend だけのフラグ）
- 台帳は**今の状態の一覧**で、決定の記録ではないので ADR ではなく `docs/` に置く（データ取扱い台帳と同じ扱い）。片付けたら行を外し、経緯は課題・PR に残す。
- ポリシー・App Privacy の申告の記述はデータ取扱い台帳 6 を正本のまま、互換性台帳からはリンクするだけにする（二重に管理しない）。
- 最低サポートバージョンを上げるとき（runbook §7.3）に、両方の台帳を見る。

### D42: 計画とレビューで、配布済みのアプリとの互換を必ず確かめる

規則は runbook §7 にあったが、計画とレビューで読まれる経路に載っていなかった。backend の AGENTS.md と change-review の参照資料には
「mobile CI が落ちたら mobile の最小の修正を同じ PR に入れる」とだけあり、型が変わっただけの変更（Orval の関数の形が変わる・応答に required のフィールドが増える）と、
配布済みのアプリが壊れる変更（リクエストの任意の項目を必須にする・応答のフィールドを消す）を区別していなかった。後者は mobile を直すと CI は通るが、配布済みのアプリは壊れる。

- task-workflow のプランに「配布済みアプリとの互換」を必須の項目として足す（「プライバシーへの影響」と同じ扱い）。
- change-reviewer の観点に「配布済みアプリとの互換」を独立の観点として足す。層をまたぐ契約（観点2）に含めると、新しいクライアントと backend の食い違いだけを見て、
  古いクライアントの側を見落とすため。
- change-review の参照資料（backend.md・mobile.md）、ルート・backend・mobile の `AGENTS.md` から、runbook §7 と互換性台帳へ辿れるようにする。

### 未解決・持ち越し（SS-233 追補）

- D40 の固定値を返す仕組みは未実装（`pin_registration` の削除の課題で行う）。
- 「最低サポートバージョン以上のアプリだけが残ったと言える状態」を何で判断するか（バージョン別の利用状況をどこから得るか）は決めていない。
  最低サポートバージョンを変える経路（SS-101 追補 D33）と合わせて、最初の contract を計画するときに決める。

## 関連情報

- [ADR-004: シークレットの保管先は「消費者」で決め、CI から AWS への認証は OIDC を使う](./ADR-004-secrets-management-and-cicd-aws-credentials.md)
  —— GitHub Environment と AWS アカウントの 1:1 対応、OIDC ロールの trust の絞り方。
  決定6 のフラグ切り替えロールも同じ枠組みに載る
- [ADR-005: backend は Lambda Function URL(AWS_IAM) + CloudFront で公開し、SAM で zip デプロイする](./ADR-005-backend-serverless-deployment-lambda-function-url.md)
  —— 本 ADR の出発点。SS-72 追補がこの ADR を予約した。決定4・決定5 の内容はそこで確定済み
- [ADR-006: mobile アプリの配信は EAS（Expo ホスト）に委ね、mobile 用 SAM テンプレートを作らない](./ADR-006-mobile-app-delivery-eas-hosted.md)
  —— 決定3・決定8 の前提（配布経路、`runtimeVersion` と `version` の関係）
- [ADR-007: 周回ルート（往路と異なる道で戻る）の生成方式](./ADR-007-loop-route-generation.md)
  —— 現行の唯一のフラグ `GOOGLE_MAPS_LOOP_ROUTE_ENABLED` の由来
- [docs/release-runbook.md](../release-runbook.md) —— 本 ADR に基づく実際のリリース手順
- [ADR-012](./ADR-012-lp-static-site-astro-s3-cloudfront.md) の SS-231 追補、[データ取扱い台帳](../privacy/data-inventory.md) の 2.1・6
  —— 決定7 の expand / contract を、プライバシーポリシーと App Privacy の申告にも当てはめたもの（**SS-231 追補**）
- [互換性台帳](../compat-ledger.md) —— 互換のために残しているものと、片付けてよい条件の一覧（**SS-233 追補** D41）
- [packages/backend/docs/deployment.md](../../packages/backend/docs/deployment.md)
  —— backend のデプロイ手順、タグと GitHub Release、現行の kill switch の運用
- [packages/mobile/docs/build-profiles.md](../../packages/mobile/docs/build-profiles.md)
  —— ビルドプロファイル、ビルド番号の採番、表示用 `version` の運用ルール
- Plane: SS-104（本 ADR）、SS-72（起点）、SS-94 / SS-95 / SS-96 / SS-97（infra）、
  SS-98 / SS-99（backend・CI）、SS-100 / SS-101（mobile のフラグ受け皿・アップデートの案内）、
  SS-102 / SS-103（mobile のリリース自動化・OTA）、SS-213（mobile（iOS）の本番の TestFlight 配信とタグ・Release）
- [AWS AppConfig feature flags (AWS 公式ドキュメント)](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-configuration-and-profile-feature-flags.html)
- [AWS AppConfig deployment strategies (AWS 公式ドキュメント)](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-deployment-strategy.html)
  —— 定義済み Deployment Strategy のベイク時間
- [Deployment patterns (Expo 公式ドキュメント)](https://docs.expo.dev/eas-update/deployment-patterns/)
  —— channel / branch と runtimeVersion の関係
