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

## ADR（設計判断の記録）

**設計を変える実装に着手する前に、該当する ADR を読むこと。** ガイドラインが「何をするか」を、
ADR が「なぜそうなっているか」を持っている。ADR の決定を覆す変更をする場合は、
ADR の追補（または新規 ADR の作成）が必要（[adr-writing](../../.agents/skills/adr-writing/SKILL.md) スキルを使う）。

mobile 固有の判断は `adr/` 配下、frontend/backend にまたがる判断や
ドメイン知識は [`docs/adr/`](../../docs/adr/)（リポジトリルート）にある。
mobile 固有の ADR は `ADR-M-{番号}`、ルートの ADR は `ADR-{番号}` と書き分ける（参照するときも同じ。接頭辞の無い `ADR-009` はルートの ADR を指す）。

| ADR | 主題 |
|---|---|
| [ADR-M-001](./adr/ADR-M-001-folder-structure.md) | フォルダ構造と命名規則 |
| [ADR-M-002](./adr/ADR-M-002-mobile-tech-stack.md) | 技術スタック（スタイル・状態管理・地図・APIクライアント） |
| [ADR-M-003](./adr/ADR-M-003-development-build-and-dev-loop.md) | development build 前提の開発ループ、アプリ識別子の本番/開発分割（SS-79 追補） |
| [ADR-M-004](./adr/ADR-M-004-e2e-build-ci-strategy.md) | E2E(Maestro) のビルド方式と CI コスト戦略（依存追加が APK キャッシュに効く）・CIエミュレータの安定化。配布ビルド（EAS クラウドビルド）との使い分け（SS-79 追補）。フローの書き方の注意（clearState の分離・一時表示を assert しない・ASCII 入力。SS-152 追補） |
| [ADR-M-005](./adr/ADR-M-005-styling-without-unistyles.md) | スタイルは RN の StyleSheet + テーマ Context。ThemeProvider の初期モード注入・永続化・ネイティブ外観の上書き（SS-86 追補。ADR-M-016） |
| [ADR-M-006](./adr/ADR-M-006-location-service-real-mock.md) | 位置情報サービスは real/mock の2モード。バックグラウンド記録（SS-156 追補。本体は ADR-M-018） |
| [ADR-M-007](./adr/ADR-M-007-expo-config-and-maps-key-injection.md) | Expo 設定と Maps SDK キーの注入。`APP_VARIANT` による本番識別子への上書き分岐（SS-79 追補）。開発ツール（画面カタログ）の表示可否の実行時判定（SS-148 追補） |
| [ADR-M-008](./adr/ADR-M-008-active-walk-state-and-route-cache.md) | 進行中/保存待ちの散歩の状態管理とルートのキャッシュ共有。バックグラウンド記録（SS-156 追補。本体は ADR-M-018） |
| [ADR-M-009](./adr/ADR-M-009-auth-session-state-and-route-gate.md) | 認証セッション状態の集約と認証ゲート |
| [ADR-M-010](./adr/ADR-M-010-photo-service-and-direct-s3-upload.md) | 写真の取得・加工は services/photo（real/mock）、アップロードは presigned POST で S3 直送 |
| [ADR-M-011](./adr/ADR-M-011-pin-location-picking-and-adjustment.md) | ピンの位置の選択と調整（任意地点からの登録は長押し、登録画面での調整はタップ・画面内オーバーレイ）。ピンタブへの統合（SS-146 追補）。ナビタブの FAB と地点選択画面の削除（SS-147 追補） |
| [ADR-M-012](./adr/ADR-M-012-pin-map-display-and-detail.md) | 登録済みピンの地図表示（取得範囲・上限の見せ方・散歩中の地図への合成）とピン詳細（写真のページング・画像キャッシュ）。ピンタブでの表示（SS-146 追補）。`/pins/map` の削除とナビタブ idle への「最近の散歩」の合成（SS-147 追補）。アカウントタブのゲスト表示（SS-148 追補）。ピン詳細への編集・削除ボタンの追加と詳細ルートの `[pinId]/index.tsx` への移動（SS-119 追補。本体は ADR-M-017）。写真ビューアのピンチでの拡大（SS-153 追補）。登録済みピンを地図のアイコンで描く・マーカーの基準点（SS-172 追補。本体は ADR-M-019） |
| [ADR-M-013](./adr/ADR-M-013-pin-tag-suggestions.md) | ピンのタグ入力の候補（地図単位の既存タグ・端末での絞り込み・既存表記への統一） |
| [ADR-M-014](./adr/ADR-M-014-sanpo-map-list-and-detail.md) | 地図一覧と地図詳細（端末での絞り込み・ピンの全件取得の上限・地図作成ダイアログ）。地図のアイコンの選択・変更（SS-171 追補。本体は ADR-M-019） |
| [ADR-M-015](./adr/ADR-M-015-app-icon-assets.md) | 採用PNGとAndroid Adaptive Iconレイヤー、アイコンの再生成とネイティブビルドへの反映 |
| [ADR-M-016](./adr/ADR-M-016-theme-mode-preference.md) | テーマ（外観）設定の端末保存とネイティブ外観の上書き |
| [ADR-M-017](./adr/ADR-M-017-pin-edit-and-delete.md) | ピンの編集・削除（編集画面の構成・保存の順序と冪等性・権限による出し分け・削除後のキャッシュ） |
| [ADR-M-018](./adr/ADR-M-018-background-walk-location-tracking.md) | 散歩中の位置記録はバックグラウンドのロケーションタスクで行う（使用中のみ権限・iOS background mode・Android フォアグラウンドサービス・端末バッファと統合）。権限の利用目的文言と FGS 通知の文言（SS-157 追補） |
| [ADR-M-019](./adr/ADR-M-019-sanpo-map-icon-and-map-pin-shape.md) | 地図のアイコン（13種類・色はアイコンから決まる・作成時と地図詳細で選ぶ）、登録済みピンの地図アイコンでの描画、`MapPin` の SVG シルエットとマーカーの基準点（`anchor` + `centerOffset`） |
| [ADR-M-019](./adr/ADR-M-019-external-web-pages.md) | アプリから外部の Web ページ（プライバシーポリシー）を開く方式（アプリ内ブラウザ + OS ブラウザへのフォールバック）と、法的文書の URL をビルドで切り替えないこと |
