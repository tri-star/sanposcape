## ツール・ライブラリ

- 開発言語: TypeScript
- パッケージ管理: pnpm（`minimumReleaseAge` を設定し、公開から2日以上経過したバージョンのみ利用）
- フレームワーク: ReactNative(expo)
- ルーティング: Expo Router（ファイルベース）
- スタイル: react-native-unistyles（デザイントークン・テーマを型安全に管理）
  - アイコン: lucide-react-native（`src/components/ui/icon/Icon.tsx` を単一入口とし、他から直接 import しない）
  - SVG描画: react-native-svg（`MapPin` のピン形状描画等。lucide-react-native の内部依存でもある）
  - ジェスチャ/アニメーション: react-native-gesture-handler / react-native-reanimated
    （`BottomSheet` のドラッグ・スナップ、`Switch` のノブ移動アニメーションの基盤）
- 状態管理:
  - サーバー状態: TanStack Query（Orval生成物と組み合わせる）
  - クライアント状態: Zustand（少量のグローバル状態）
- 地図: react-native-maps（Android=Google Maps / iOS=Apple Maps）
- APIクライアント生成: Orval（backendのOpenAPIから生成）+ MSWモック（HTTPクライアントは fetch/customFetch）
- デザイントークンcodegen: tsx（`scripts/generate-tokens.ts` を実行するランタイム。詳細は
  [design-tokens.md](./design-tokens.md) を参照）
- ユニットテスト: Vitest
- E2Eテスト: Maestro
- Lint: oxlint
- Formatter: oxfmt
