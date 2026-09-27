---
name: feedback-openapi-change-triggers-mobile-ci
description: backend の openapi.yaml 変更は mobile CI（Orval 再生成→typecheck）を起動する。クエリの無い GET にクエリを足す・応答に required フィールドを足すと backend PR で mobile CI が落ちる
metadata:
  type: feedback
  scope: durable
---

`.github/workflows/mobile-ci.yml` は `packages/backend/openapi.yaml` の変更でも起動し、`pnpm --filter mobile orval`
→ typecheck → test を走らせる（SS-113 のプラン作成時に確認）。Orval 生成物は gitignore なので、backend PR だけで
mobile の型が変わる。

壊れる典型:
- **クエリパラメータが1つも無い GET にクエリを足す**と、Orval の fetch クライアントのシグネチャが
  `fn(options?)` → `fn(params?, options?)` に変わる。mobile が `fn({ signal })` と呼んでいると型エラー
  （実行時は signal がクエリ扱い）。例: `sanpoMapApi.ts` の `listSanpoMapsRequest({ signal })`。
  既にクエリがある GET（`listWalksWalksGet(params, { signal })`）は影響なし。
- **応答スキーマに required フィールドを足す**と、mobile の手書き型付きテストフィクスチャ（`const RESPONSE: XxxRead = {...}`）が落ちる。

**Why:** 「mobile の Orval 再生成は後続チケットの範囲」と切り分けても、CI は backend PR の時点で mobile を検証する。
**How to apply:** API 変更を含む backend プランでは (1) 追加フィールドは optional にできないか検討し、(2) 既存の
呼び出しシグネチャが変わる場合は mobile の最小修正を同じ PR に含める手順と、ローカルでの
`pnpm --filter mobile orval && typecheck && test` を完了条件に入れる。[[feedback-settled-design-and-api-conventions]] の
「backend の完了条件に mobile の typecheck を入れない」はこのケースでは例外になる（CI が要求するため）。
