---
name: review-preflight-git-state
description: レビュー開始時に、依頼文のブランチ名・コミット・「未コミット」の前提を実際の状態で確かめる。Bash が無い（git diff が取れない）ときは Glob+Read による最終状態レビューに切り替える
metadata:
  type: feedback
  scope: durable
---

このエージェントのツールセットには Bash が無く（Read/Glob/Grep/WebFetch/WebSearch のみ）、
`git status` も `git diff` も実行できない。依頼文の前提が実際の git 状態とずれていることもある。

**Why:**
- SS-8 では「ブランチ `feat/ss-8-mvp-screens` の未コミット変更」をレビューするよう依頼されたが、
  実際のブランチ名は `feat/ss-8-mvp-screens-routing` で、対象はすべてコミット済みだった。
  ローカルレビュー → 修正 → 即コミットのサイクルが速く、依頼文を書いた時点とレビュー時点で状態がずれる。
- SS-13 では、システムリマインダーの `gitStatus`（スナップショット）が別ブランチを示していたが、
  `.git/HEAD` は依頼対象のブランチを指しており、そちらが正しかった。
- SS-10 では依頼文が `git diff --cached` を前提にしていたが、実行手段が無かった。

**How to apply:**
1. レビュー開始時に `.git/HEAD`（`ref: refs/heads/<branch>`）を `Read` して、現在のブランチを確かめる。
   システムリマインダーの `gitStatus` を鵜呑みにしない。
2. diff が取れない場合は、実装プランや PR 説明のファイル一覧を基に `Glob` で実在を確認し、各ファイルを
   `Read` で全文読む。そのうえで、プランの仕様（振る舞い表・テストケース一覧）と突き合わせる
   「最終状態レビュー」に切り替えてよい。oxlint/oxfmt/tsc の通過が前提なら、整形レベルの差分は気にしなくてよい。
3. 依頼の前提と実際の状態が食い違うときは、サマリーの冒頭で一言触れてから、現在のコードを
   実質的な diff とみなしてレビューを進める（都度ユーザーに確認して止まる必要はない）。
