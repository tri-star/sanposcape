## ツール・ライブラリ

- 開発言語: TypeScript
- パッケージ管理: pnpm（`minimumReleaseAge` を設定し、公開から2日以上経過したバージョンのみ利用）
- フレームワーク: ReactNative(expo)
- ルーティング: Expo Router（ファイルベース）
- スタイル: react-native-unistyles（デザイントークン・テーマを型安全に管理）
- 状態管理:
  - サーバー状態: TanStack Query（Orval生成物と組み合わせる）
  - クライアント状態: Zustand（少量のグローバル状態）
- 地図: react-native-maps（Android=Google Maps / iOS=Apple Maps）
- APIクライアント生成: Orval（backendのOpenAPIから生成）+ MSWモック（HTTPクライアントは fetch/customFetch）
- ユニットテスト: Vitest
- E2Eテスト: Maestro
- Lint: oxlint
- Formatter: oxfmt
