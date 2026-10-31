# mobileに関する開発ドキュメント

## 設計ガイドライン

- 利用するべきライブラリ、Linter/Formatterなどのツールセットは [ツール・ライブラリ] (./docs/toolsets-libraries.md) を参照
- アーキテクチャに関するガイドラインは [アーキテクチャガイドライン](./docs/architecture-guideline.md) を参照
- mobileに関するフォルダ構造は [フォルダ構造](./docs/folder-structure.md) を参照
- ファイル/フォルダの命名規則は [ファイル命名規則](./docs/naming-conventions.md) を参照
- ページ、コンポーネントの実装に関するガイドラインは [ページ・コンポーネント](./docs/pages-components-guideline.md) を参照

## 環境構築・起動手順

- ローカル環境の構築手順は [ローカル環境構築](./docs/local-env.md) を参照
- エミュレータ/実機での起動手順は [起動手順ガイド](./docs/app-startup-guide.md) を参照
- iPhone実機での development build は [iPhone実機 development build 手順](./docs/iphone-device-development.md) を参照
- EAS のビルドプロファイル（どの backend を向くか・環境変数の供給元・アプリ識別子の SSoT・
  配布手順）は [ビルドプロファイルと環境変数](./docs/build-profiles.md) を参照

## 作業の進め方

- 作業を始める前に `.claude/agent-memory/mobile/MEMORY.md` を読み、関係する話題のメモリを読む。
- `src/api/generated/`（Orval の生成物）は gitignore 対象で、worktree には無いか古いことが多い。
  API に触る計画・実装の前に `pnpm --filter mobile orval` で作り直し、現物の型を確かめる。
  backend の API 変更と同じブランチで進めるときは、`packages/backend/openapi.yaml` を更新した後に作り直す
  （`orval.config.ts` の入力は `../backend/openapi.yaml`）。
- 新しい API・フィールドを使う変更は、フラグで包むか、backend を prod にデプロイしてから配布する計画にする。
  本番で現在 ON のフラグを消すときは backend の固定値の期間を挟む（[リリース運用手順](../../docs/release-runbook.md) §3・§7、[互換性台帳](../../docs/compat-tracker.md)）。
- 変更後は `pnpm --filter mobile typecheck` / `lint` / `format:check` / `test` を通す。
  - ルートを追加・削除したとき、ブランチを切り替えたときは、`typecheck` の前に
    `pnpm --filter mobile exec expo customize tsconfig.json` で `.expo/types/router.d.ts` を作り直す
    （古い型が残ると、存在しないルートで型検査される）。
  - 整形の確認は `format:check` スクリプトで行う。対象は `src` / `app` と設定ファイルだけで、
    `oxfmt --check .` は対象外の docs・adr まで差分として報告する。

## ADR（設計判断の記録）

**設計を変える実装に着手する前に、該当する ADR を読むこと。** ガイドラインが「何をするか」を、
ADR が「なぜそうなっているか」を持っている。ADR の決定を覆す変更をする場合は、
ADR の追補（または新規 ADR の作成）が必要（[adr-writing](../../.agents/skills/adr-writing/SKILL.md) スキルを使う）。

mobile 固有の判断は `adr/` 配下、frontend/backend にまたがる判断や
ドメイン知識は [`docs/adr/`](../../docs/adr/)（リポジトリルート）にある。
mobile 固有の ADR は `ADR-M-{番号}`、ルートの ADR は `ADR-{番号}` と書き分ける（参照するときも同じ。接頭辞の無い `ADR-009` はルートの ADR を指す）。

ADR を新しく作ったら、下の表とルートの `README.md` の ADR 一覧に1行ずつ足す。追補で主題が広がったら、その行の説明にも追記する。

| ADR | 主題 |
|---|---|
| [ADR-M-001](./adr/ADR-M-001-folder-structure.md) | フォルダ構造と命名規則 |
| [ADR-M-002](./adr/ADR-M-002-mobile-tech-stack.md) | 技術スタック（スタイル・状態管理・地図・APIクライアント） |
| [ADR-M-003](./adr/ADR-M-003-development-build-and-dev-loop.md) | development build 前提の開発ループ、アプリ識別子の本番/開発分割（SS-79 追補） |
| [ADR-M-004](./adr/ADR-M-004-e2e-build-ci-strategy.md) | E2E(Maestro) のビルド方式と CI コスト戦略（依存追加が APK キャッシュに効く）・CIエミュレータの安定化。配布ビルド（EAS クラウドビルド）との使い分け（SS-79 追補）。フローの書き方の注意（clearState の分離・一時表示を assert しない・ASCII 入力。SS-152 追補）。入力欄の入れ直しに `eraseText` を使わない・ビルド後の Gradle デーモンの停止とランナーのメモリの記録・Maestro の版の固定（2026-10-17 追補） |
| [ADR-M-005](./adr/ADR-M-005-styling-without-unistyles.md) | スタイルは RN の StyleSheet + テーマ Context。ThemeProvider の初期モード注入・永続化・ネイティブ外観の上書き（SS-86 追補。ADR-M-016）。デザイントークンの SSoT は Claude Design で同期は一方向（SS-202 追補） |
| [ADR-M-006](./adr/ADR-M-006-location-service-real-mock.md) | 位置情報サービスは real/mock の2モード。バックグラウンド記録（SS-156 追補。本体は ADR-M-018）。精度の許可 `getPrecision`（SS-160 追補。本体は ADR-M-022）。端末の向き `watchHeading`（SS-169 追補。本体は ADR-M-023） |
| [ADR-M-007](./adr/ADR-M-007-expo-config-and-maps-key-injection.md) | Expo 設定と Maps SDK キーの注入。`APP_VARIANT` による本番識別子への上書き分岐（SS-79 追補）。開発ツール（画面カタログ）の表示可否の実行時判定（SS-148 追補）。散歩中の地図の計測値の表示（軌跡の点の数・JS の FPS）も開発ツールに含める（SS-229 追補） |
| [ADR-M-008](./adr/ADR-M-008-active-walk-state-and-route-cache.md) | 進行中/保存待ちの散歩の状態管理とルートのキャッシュ共有。バックグラウンド記録（SS-156 追補。本体は ADR-M-018）。散歩中の地図への歩いた軌跡の表示（SS-168 追補）。画面を行き来したときの軌跡の線の作り直し（SS-211 追補）。iOS で帰りの線が太く描かれるのを補正（SS-232 追補） |
| [ADR-M-009](./adr/ADR-M-009-auth-session-state-and-route-gate.md) | 認証セッション状態の集約と認証ゲート。サインイン後の戻り先（`returnTo`・許可リスト。SS-151 追補） |
| [ADR-M-010](./adr/ADR-M-010-photo-service-and-direct-s3-upload.md) | 写真の取得・加工は services/photo（real/mock）、アップロードは presigned POST で S3 直送。撮影日時を EXIF から読み、位置情報は捨てる（SS-163 追補）。容量超過の文言に上限の値を書かない（SS-236 追補） |
| [ADR-M-011](./adr/ADR-M-011-pin-location-picking-and-adjustment.md) | ピンの位置の選択と調整（任意地点からの登録は長押し、登録画面での調整はタップ・画面内オーバーレイ）。ピンタブへの統合（SS-146 追補）。ナビタブの FAB と地点選択画面の削除（SS-147 追補） |
| [ADR-M-012](./adr/ADR-M-012-pin-map-display-and-detail.md) | 登録済みピンの地図表示（取得範囲・上限の見せ方・散歩中の地図への合成）とピン詳細（写真のページング・画像キャッシュ）。ピンタブでの表示（SS-146 追補）。`/pins/map` の削除とナビタブ idle への「最近の散歩」の合成（SS-147 追補）。アカウントタブのゲスト表示（SS-148 追補）。ピン詳細への編集・削除ボタンの追加と詳細ルートの `[pinId]/index.tsx` への移動（SS-119 追補。本体は ADR-M-017）。写真ビューアのピンチでの拡大（SS-153 追補）。登録済みピンを地図のアイコンで描く・マーカーの基準点（SS-172 追補。本体は ADR-M-019）。アーカイブ済みのピンを地図表示から除外（SS-173 追補。本体は ADR-M-021）・地図表示の絞り込み（SS-174 追補。本体は ADR-M-021）。写真ビューアの撮影日時の表示（SS-163 追補）。ピン詳細の地図を正方形にしてパン・ピンチで操作可能に（SS-149 追補）。ピン詳細の住所（表示のたびに引き DB に保存しない・座標ごとのキャッシュ。SS-212 追補）。ピンのクラスタ表示（地図ごと 1,000 件まで取り端末でまとめる・円のタップで拡大。D3 の変更。SS-243 追補）。ピン詳細の情報カード・住所のコピー・ピンタブへの移動（SS-246 追補） |
| [ADR-M-013](./adr/ADR-M-013-pin-tag-suggestions.md) | ピンのタグ入力の候補（地図単位の既存タグ・端末での絞り込み・既存表記への統一）。登録画面に最寄り駅のタグを最初から入れておく（SS-225 追補） |
| [ADR-M-014](./adr/ADR-M-014-sanpo-map-list-and-detail.md) | 地図一覧と地図詳細（端末での絞り込み・ピンの全件取得の上限・地図作成ダイアログ）。地図のアイコンの選択・変更（SS-171 追補。本体は ADR-M-019）。ピン一覧のアーカイブ済みの扱い（SS-173 追補。本体は ADR-M-021） |
| [ADR-M-015](./adr/ADR-M-015-app-icon-assets.md) | 採用PNGとAndroid Adaptive Iconレイヤー、アイコンの再生成とネイティブビルドへの反映、DEV帯による開発用アイコンの分離（SS-227追補） |
| [ADR-M-016](./adr/ADR-M-016-theme-mode-preference.md) | テーマ（外観）設定の端末保存とネイティブ外観の上書き |
| [ADR-M-017](./adr/ADR-M-017-pin-edit-and-delete.md) | ピンの編集・削除（編集画面の構成・保存の順序と冪等性・権限による出し分け・削除後のキャッシュ）。訪問状況・アーカイブの編集（SS-173 追補。本体は ADR-M-021）。地図の変更（SS-175 追補） |
| [ADR-M-018](./adr/ADR-M-018-background-walk-location-tracking.md) | 散歩中の位置記録はバックグラウンドのロケーションタスクで行う（使用中のみ権限・iOS background mode・Android フォアグラウンドサービス・端末バッファと統合）。権限の利用目的文言と FGS 通知の文言（SS-157 追補）。大まかな位置でも点を捨てない（SS-160 追補。本体は ADR-M-022）。GPS の飛びを距離に加算しない（SS-91 追補） |
| [ADR-M-019](./adr/ADR-M-019-sanpo-map-icon-and-map-pin-shape.md) | 地図のアイコン（13種類・色はアイコンから決まる・作成時と地図詳細で選ぶ）、登録済みピンの地図アイコンでの描画、`MapPin` の SVG シルエットとマーカーの基準点（`anchor` + `centerOffset`）。絵を Noto Emoji のカラー SVG に（系統色のピン + 淡い円 + 画像・38px・同梱ライセンスの画面。SS-191 追補） |
| [ADR-M-020](./adr/ADR-M-020-external-web-pages.md) | アプリから外部の Web ページ（プライバシーポリシー・利用規約。SS-187 追補）を開く方式（アプリ内ブラウザ + OS ブラウザへのフォールバック）と、法的文書の URL をビルドで切り替えないこと。「このアプリについて」のアプリのバージョンの行（SS-228 追補）。ビルド番号（expo-application）・本番以外のチャネル・OTA の update ID の併記（SS-230 追補） |
| [ADR-M-021](./adr/ADR-M-021-pin-visit-status-and-archive.md) | ピンの訪問状況・アーカイブ（詳細はバッジ・編集はスイッチ + 既存の保存・地図表示からアーカイブ済みを常に除外し地図詳細の一覧には出す・権限の出し分け・登録時の初期値（散歩中=訪問済み））。地図表示の絞り込み（アーカイブ済み・訪問状況。共有・保存しない・アーカイブ済みは半透明。SS-174 追補） |
| [ADR-M-022](./adr/ADR-M-022-location-permission-flow-and-approximate-location.md) | 位置情報の権限の求め方（事前説明画面を置かない）と、拒否・大まかな位置のときの挙動（文脈ごとの中立な案内・前面復帰での回復・大まかな位置の案内） |
| [ADR-M-023](./adr/ADR-M-023-current-heading-on-map.md) | 地図上の現在地の向きの表示（端末の方位を `watchHeading` で購読・ネイティブの購読を1本にまとめる・`Polygon` の扇形で描く・ズームに合わせた半径・フォーカス中だけ購読） |
