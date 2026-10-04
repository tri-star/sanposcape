---
name: mobile-dependency-verification-steps
description: packages/mobile の依存更新を検証するときの手順。typecheck の前に orval 生成と expo customize tsconfig.json が必要（mobile-ci.yml と同じ順序）
metadata:
  type: feedback
  scope: durable
---

`detect-ecosystem.sh` が `mobile` と判定した PR（`packages/mobile` の React Native / Expo、pnpm workspace）は、
`packages/mobile/package.json` の scripts を使って次の順で検証する。

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter mobile orval`
   - `src/api/generated/` は gitignore 対象で、毎回ローカルで生成する必要がある。
   - これを飛ばして typecheck すると、`Cannot find module '@/api/generated/...'` で大量に失敗する。
3. `pnpm --filter mobile exec expo customize tsconfig.json`（Expo Router の型付きルートを生成する）
4. `pnpm --filter mobile typecheck`、`lint`、`format:check`、`test`

**Why:** この順序は `.github/workflows/mobile-ci.yml` と同じで、agent 定義にも skill にも書かれていない。
PR #67（mobile-dependencies グループ）で、生成物が無いまま typecheck して大量に失敗した。
当時は判定スクリプトが mobile を frontend と誤判定していたが、現在は
ブランチ名・変更ファイルから `mobile` と判定できるよう修正されている。

**How to apply:** ecosystem が `mobile` のときは、frontend の手順を流用せず、上の順序で検証する。
CI の順序が変わっていないか、迷ったら `mobile-ci.yml` で確認する。
