---
name: project_ss29_route_as_composition_root
description: restricted import 対象の feature（features/walk・features/history）が認証情報を必要とする場合、app/ ルートがストアからプリミティブを読んで props 注入する合成パターン。SS-29で確立、ADR-009 SS-29追補が正本
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md
---

SS-29（`features/history/data/profile.ts` の手書き `STUB_USER_PROFILE` 廃止 + `authApi` 単体テスト追加）の
レビューで確立したパターン。**決定の正本は ADR-009 の「SS-29 追補」**（却下した代替案2件もそちらに記載）。

**パターン**: `app/(tabs)/history.tsx` が `useAuthSessionStore((state) => state.user?.displayName ?? null)`
でプリミティブだけを selector で読み、`HistoryView` props → `useHistorySummary` 引数へ渡す。
文言組み立ては `features/history/lib/greeting.ts`（純粋関数）に閉じる。
`features/history/**` から `@/services/auth` / `@/store/useAuthSessionStore` への import は
`.oxlintrc.json` の `no-restricted-imports`（ADR-009 決定8）で禁止されているため、
認証×機能の合成をルート側で行う。

**Why:** ADR-009 決定8 を覆す変更ではなく、決定8 が「移行・対応が必要な事項」として想定していた
延長線上の具体化である。`features/settings` は override の対象外なので `useAuthSessionStore` を直接
参照でき、`app/settings.tsx` は `<SettingsView />` を返すだけで済む——この非対称性は意図的。

**How to apply:**
- restricted な feature が認証情報を必要とする PR を見たら、**ストアやユーザーオブジェクトごと渡さず
  必要な最小のプリミティブに落として渡しているか**を確認する。
- **横断 hook（例 `useSessionDisplayName`）を挟んで `no-restricted-imports` を形式的に通す実装を見たら
  指摘する。** import パスの検査は通るが依存関係を隠すだけで、決定8 が守ろうとしている性質は失われる。
  ADR-009 SS-29 追補で明示的に却下済みの代替案である。
- 同じ selector が `app/` の2箇所以上に重複したら `src/hooks/` への切り出しを検討してよい（SS-29 時点では
  1箇所のみ）。ただし切り出す動機は「重複の排除」でなければならない。

**関連メモリ**: [[project_ss13_auth_session_gate]]（ADR-009 決定8の原設計・store配置の例外規定）
