---
name: feedback-mobile-ecosystem-detection
description: detect-ecosystem.sh は packages/mobile の更新を frontend と誤判定するので mobile 用手順で作業する
metadata:
  type: feedback
  scope: durable
---

`detect-ecosystem.sh`（dependabot-update-workflow skill から呼ばれる）は
`packages/mobile`（React Native / Expo, pnpm workspace）の変更を `frontend` と誤判定することがある。

**Why:** 判定スクリプトが frontend/backend の2値判定のみで、mobile パッケージを区別するロジックを
持っていない。PR #67 (`dependabot/npm_and_yarn/mobile-dependencies-73e755b956`) で発覚。

**How to apply:** 呼び出し元から「ecosystem判定はfrontendだが実体はmobile」という指示が来た場合、
`packages/mobile/package.json` の scripts を実行対象として扱う。具体的な確認手順:

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter mobile orval`（`src/api/generated/` は gitignore 対象で毎回ローカル生成が必要。
   これをせずに `typecheck` すると `Cannot find module '@/api/generated/...'` で大量に失敗する）
3. `pnpm --filter mobile exec expo customize tsconfig.json`（Expo Router の型付きルート生成。
   CI の `mobile-ci.yml` もこの順序で実行している）
4. `pnpm --filter mobile typecheck / lint / format:check / test`

判定スクリプト自体の修正は本エージェントのスコープ外。
