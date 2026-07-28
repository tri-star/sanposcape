---
applyTo: "packages/mobile/**"
---

# Mobile Review Instructions

- `packages/mobile/docs/` の最新の設計・命名・UI・テストルールを正とし、変更がそれらに従うか確認する。
- Expo Router の `app/` はルーティング、Provider 配線、認証ガードに留め、画面・機能の実装を `src/features/` に置く。横断 UI と機能固有 UI、純粋ロジックと React Native 依存の副作用が適切に分離されているか確認する。
- API 由来のサーバー状態は TanStack Query で管理し、Zustand に重複保持していないか確認する。Orval の `src/api/generated/` は手編集しない。
- 認証・位置情報など実機依存機能は `src/services/` の real/dev/mock 差し替え層に置く。`EXPO_PUBLIC_*` に秘密情報を置かず、トークンを安全でないストレージに保存せず、real/dev/mock の切替が本番の認証・認可を弱めないことを確認する。
- React の hook では依存配列、古いクロージャ、連続操作・画面離脱後の非同期更新、購読・タイマー・位置情報取得の cleanup を確認する。通信失敗・ローディング・空状態・再試行・オフライン時に壊れないか確認する。
- 画面・ナビゲーションの変更では、認証が必要な画面への直接遷移、動的ルート引数の検証、戻る操作、深いリンクで不正な状態にならないか確認する。主要画面を追加した場合、開発用 `ScreenCatalog` のリンク追加も確認する。
- UI は既存の共通 primitive とテーマを優先し、色・余白・文字サイズ等をハードコードしていないか確認する。操作要素の 44x44 以上のタップ領域、押下フィードバック、適切な `accessibilityRole`・`accessibilityLabel`・`accessibilityState`、Maestro 用 `testID` を確認する。
- コンポーネントのレンダリングテストは現在の Vitest 設定の対象外である。判定・整形ロジックを React Native 非依存の純粋関数へ切り出し、その `.test.ts` を追加しているか、静的データの不変条件を検証しているか確認する。
