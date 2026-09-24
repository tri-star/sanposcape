---
name: project_ss100_app_config_flags
description: SS-100 の /app-config フィーチャーフラグ受け皿（mobile）のセキュリティレビュー結果
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md
---

SS-100（`GET /app-config` からフラグ・最低サポートバージョンを取得し UI 出し分けに使う mobile 実装）
をレビューした結果、Critical/High 指摘なし。設計・実装ともに fail-safe が徹底されていた。

**確認した主な設計判断（良好点）**:
- `isFeatureEnabled` は `flags[key] === true` の厳密比較のみで判定。`flags` が非オブジェクト
  （string/number/array/false 等）に汚染されてもクラッシュせず false に倒れる（`appConfigSnapshot.ts`）。
  prototype pollution 経路も無い（スプレッド/マージをせず参照代入のみ）。
- `queryClient.ts`: サインアウト時クリアを `clear()` → `removeQueries({ predicate: !isAppConfigQueryKey })`
  + `getMutationCache().clear()` に変更。除外は `/app-config` 1件のみ明示列挙、新規クエリは
  デフォルトでクリア対象（fail-closed な向きを維持）。ADR-009 に SS-100 追補として、
  「除外してよいのはユーザー非依存の設定に限る／ダークローンチ採用時は要再検討」まで明記されている。
- `config_source` は型 `AppConfigSnapshot` に存在せず、プロダクトコードから構造的に参照不能。
  `useAppConfigDiagnostics()`（診断専用）のみが読み、呼び出し元は `__DEV__` ガード付き
  `/dev-screens`（`app/dev-screens.tsx` が `if (!__DEV__) return <Redirect href="/" />`）経由のみ。
- 永続化なし（AsyncStorage/SecureStore への書き込みを全対象ファイルで grep して確認、ヒット無し）。
- FeatureGate/useFeatureFlag はこの PR 時点でまだ実画面から未使用（受け皿のみ）。将来
  認可の代替に誤用されていないかは、フラグを実際の機能で使い始める PR で再確認が必要。

**Why**: フラグ機構を今後 mobile-developer が実機能に適用していく際、同じ設計（===true 厳密比較、
predicate 除外の狭さ、config_source 非露出）を壊していないか差分ベースで確認すればよく、
ゼロから再監査する必要はない。

**How to apply**: 次に `/app-config` 関連ファイルや `queryClient.ts` の `registerSessionCleanup`
predicate に変更が入ったら、(1) 除外条件が「ユーザー非依存」のままか、(2) 新しい `FeatureGate` の
利用箇所が認可の代替になっていないか、(3) `config_source` 相当の診断値が非 `__DEV__` 経路に
露出していないか、の3点を優先的に確認する。
