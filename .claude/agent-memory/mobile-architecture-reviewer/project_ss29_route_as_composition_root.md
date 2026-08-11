---
name: project_ss29_route_as_composition_root
description: SS-29（data/手書きスタブ全廃+authApi単体テスト）レビュー所見。app/ルートが認証ストアを読みpropsでfeatureへ注入する新パターンの妥当性と、その設計判断がgitignore対象のtmp/にしか残っていないというドキュメント化の残課題
type: project
---

SS-29（ブランチ `tri-star/ss-29`）は2つの残作業に絞られた小粒な課題だった:
(1) `features/history/data/profile.ts`（手書き `STUB_USER_PROFILE`）を認証セッションストアの
`displayName` に差し替え、(2) `services/auth/authApi.ts` に Orval 生成 MSW ハンドラを使った単体テストを新規追加。
実装はプラン（`tmp/SS-29/mobile-plan.md`）に忠実で、チェックリスト（`STUB_USER_PROFILE`/`UserProfile` 0件、
`features/history/**` に auth import 0件、`data/` 残置3ファイルのみ）をすべて確認済み。

**新パターン**: `app/(tabs)/history.tsx` が `useAuthSessionStore` からプリミティブ（`displayName: string | null`）
を selector で読み、`HistoryView` props → `useHistorySummary` 引数へ渡す。文言組み立ては
`features/history/lib/greeting.ts`（純粋関数、7ケースで単体テスト済み）に閉じる。
`features/history/**` から `@/services/auth`・`@/store/useAuthSessionStore` への import は
`.oxlintrc.json` の `no-restricted-imports`（SS-13 / [[project_ss13_auth_session_gate]] ADR-009 決定8）
で禁止されているため、認証×機能の合成をルート側で行う設計判断。

**妥当性の裏付け（コードで確認）**:
- ADR-009 決定8の「移行・対応が必要な事項」は既に「（将来 features/walk が認証状態を見る必要が出たら）
  ゲスト可否を props/引数で受け取る形に寄せること」と明記しており、SS-29 のプロップ注入はこの想定と
  同じ形。ADR の決定を「覆す」変更ではなく、想定済みの延長線上。
- 却下した代替案（`GET /auth/me` を features/history/api から叩く／横断 hook `useSessionDisplayName`
  で lint を形式的に回避する）は、ADR-009 決定8の趣旨（探索・散歩・履歴ロジックを認証状態に
  依存させない）と一貫して不採用。判断はプランでなく `tmp/SS-29/handover-notes.md` §2 に記録。
- 既存の `features/settings/components/SettingsView.tsx` は `useAuthSessionStore` を直接 import
  している（`features/settings` は restricted import の対象外）ため、`app/settings.tsx` は
  `<SettingsView />` を返すだけで済んでいる。対して `features/history` は restricted 対象のため
  ルートでの注入が必要という非対称性は正しく理解されている。

**残課題（指摘済み）**:
- この「app/ ルートが認証ストアを読み、restricted な feature へ props 注入する」という設計判断の
  根拠（却下した代替案含む）が `tmp/SS-29/handover-notes.md` にしか書かれておらず、`tmp/` は
  リポジトリ全体で `.gitignore` 対象（確認済み）。`docs/architecture-guideline.md`「認証の扱い」や
  `docs/folder-structure.md`「app/」節、ADR-009 のいずれにも1行も残っていないため、
  将来同種の合成（例: walk 機能で表示名が必要になる等）が発生した際に、この判断を再発見できず
  やり直し議論になるか、却下済みの代替案（横断 hook での形式的回避）を再選択してしまうリスクがある。
  ADR-009 を「覆す」変更ではないので追補は必須ではないが、`architecture-guideline.md` の「認証の扱い」
  節か `folder-structure.md` の `app/` 節に2〜3行の実例（`app/(tabs)/history.tsx` → `HistoryView`）を
  足すことを提案した。
- 軽微: `useAuthSessionStore((state) => state.user?.displayName ?? null)` という selector は
  現状 `app/(tabs)/history.tsx` の1箇所のみだが、同種の合成が増えると `app/` の複数ルートに
  同じ selector が重複しうる。1箇所のうちは問題ないため優先度は低い（Suggestion）。

**関連メモリ**: [[project_ss13_auth_session_gate]]（ADR-009 決定8の原設計・store配置の例外規定）
