---
name: cross-feature-cleanup-registry
description: features間の直接importを避けるための後始末レジストリパターン（sessionCleanup/walkDeletionCleanup）
metadata:
  type: project
---

`docs/folder-structure.md` は「その機能の外から import されるものは置かない」（feature間の
直接依存禁止）を定めている。ある feature のアクション（サインアウト・散歩削除など）が別の
feature の store をクリアする必要がある場合、このコードベースでは **`src/lib/` に
Set ベースの後始末レジストリ**を置き、クリアされる側の store が自分の後始末をモジュール読み込み時に
`register〜Cleanup(fn)` で登録し、クリアする側は import した store を直接触らず
`run〜Cleanup(...)` を呼ぶ、という向きで解決する。

先行例:
- `src/lib/sessionCleanup.ts` — サインアウト/セッション失効時。`useAuthSessionStore` から呼ぶ。
- `src/lib/walkDeletionCleanup.ts`（SS-60） — 散歩削除時。`features/history` から
  `features/walk/store/useFinishedWalkStore` を直接 import せずに済ませるために新設。

実装の型は毎回同じ: `Set<Cleanup>` + `register`/`run`（`try/catch` で1つの失敗が他を止めない）+
`reset〜ForTest`（テスト間の隔離用）。

**Why**: feature を `src/store/` へ昇格させる（横断ストア化）と ADR の配置理由を覆すことになり
ADR 追補が必要になるため、そこまでの変更をせずに済む最小の解決策としてこのパターンが採用されている
（ADR-008 決定4/決定6 を参照）。

**How to apply**: 新しい feature 間の「片方のアクションでもう片方の状態をクリアしたい」という
要求が出てきたら、まずこのレジストリパターンが使えないか確認する。feature 間の直接 import を
提案しない。逆に、このパターンを使っている実装（例: `registerWalkDeletionCleanup` の使用）を
「なぜ直接 import しないのか」と的外れに指摘しない。
