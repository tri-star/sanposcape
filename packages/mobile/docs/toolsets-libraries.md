## ツール・ライブラリ

- 開発言語: TypeScript
- パッケージ管理: pnpm（`minimumReleaseAge` を設定し、公開から2日以上経過したバージョンのみ利用）
- フレームワーク: ReactNative(expo)
- ルーティング: Expo Router（ファイルベース）
- スタイル: React Native 標準の `StyleSheet` + テーマ Context（`src/theme`。トークンは Claude Design から取り込み、ライト/ダークを切り替える。詳細は [ADR-005](../adr/ADR-005-styling-without-unistyles.md)）
- アイコン: lucide-react-native（描画に react-native-svg を利用）
- 状態管理:
  - サーバー状態: TanStack Query（Orval生成物と組み合わせる）
  - クライアント状態: Zustand（少量のグローバル状態）
- 地図: react-native-maps（Android=Google Maps / iOS=Apple Maps）
- 認証: react-native-nitro-google-signin（Google サインイン。[ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) で採用決定）+ expo-secure-store（refresh token の永続化）
- APIクライアント生成: Orval（backendのOpenAPIから生成）+ MSWモック（HTTPクライアントは fetch/customFetch）
- ユニットテスト: Vitest
- E2Eテスト: Maestro
- Lint: oxlint
- Formatter: oxfmt
