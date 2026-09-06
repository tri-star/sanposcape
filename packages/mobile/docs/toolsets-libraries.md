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
- 位置情報: expo-location（現在地取得。`src/services/location` で real/mock を切り替える。詳細は [ADR-006](../adr/ADR-006-location-service-real-mock.md)）
- スライダー: @react-native-community/slider（往復時間の指定UI）
- 認証: react-native-nitro-google-signin（Google サインイン。[ADR-002](../../../docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md) で採用決定）+ expo-secure-store（refresh token の永続化）
- APIクライアント生成: Orval（backendのOpenAPIから生成）+ MSWモック（HTTPクライアントは fetch/customFetch）
- 暗号ハッシュ: expo-crypto（CloudFront(OAC) 向けの `x-amz-content-sha256` 計算。実装は
  `src/api/contentHash.ts`。判断の記録は
  [docs/adr/ADR-005](../../../docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md) 決定4）
- ユニットテスト: Vitest
- E2Eテスト: Maestro
- Lint: oxlint
- Formatter: oxfmt

## 依存を増やさずに自前実装しているもの

依存追加には `minimumReleaseAge`（2日）というコストがある。なお ADR-004 は
2026-08-14 追補で「ネイティブモジュールが増えると `@expo/fingerprint` が変化し E2E APK
キャッシュを1回ミスさせる」という当初の前提を撤回済みで、現在のキャッシュキーは
`packages/mobile` のソース全体ハッシュ（`.maestro/` / `docs/` / `adr/` を除く）に変わっている
（[ADR-004](../adr/ADR-004-e2e-build-ci-strategy.md)）。そのため依存追加時の
APK キャッシュミスは論点にならない。用途が小さく、暗号強度や外部仕様への追従が
不要なもの、または既存実装の置き換えコストに見合わないものは自前実装に倒している。

| 対象 | 実装 | ライブラリを入れない理由 |
|---|---|---|
| UUID v4 生成 | `src/lib/uuid.ts` の `randomUuidV4()` | Expo SDK 57 / RN 0.86 の実行時に `crypto.randomUUID` / `crypto.getRandomValues` が存在しない。`expo-crypto` は SS-70 で `src/api/contentHash.ts`（`x-amz-content-sha256` の計算）用に既に導入済みだが、UUID生成の用途は保存の冪等キー（`client_walk_id`）で**暗号強度を要さない**上、既存の `Math.random` ベース実装を `expo-crypto` へ置き換えるコストに見合わないため、自前実装のまま維持する（乱数生成器はテストのため注入可能）。 |

- **暗号鍵・トークン・推測されると危険な識別子には `Math.random` ベースの実装を使わないこと。**
  そうした用途が出てきた場合は `expo-crypto` の追加を検討し、ADR で判断を残す。
- 自前実装を選んだ場合は、理由を実装ファイルの JSDoc とこの表の両方に残す
  （コードコメントだけだと依存追加の判断時に見つからないため）。
