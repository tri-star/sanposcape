---
name: no-bash-tool-review-approach
description: このレビューエージェントのツールセットに Bash が無いセッションでは git diff が取れない。Glob+Read で計画書のファイル一覧を突き合わせて最終状態をレビューする
metadata:
  type: feedback
---

SS-10（認証 real/dev/mock 実装）のレビューでは、割り当てられたツールセットに Bash が含まれておらず、
`git diff --cached` を直接実行できなかった（Read/Write/Edit/Glob/Grep/WebFetch/WebSearch のみ）。

**Why:** ユーザー依頼文は「`git diff --cached` で差分取得できる」前提で書かれていたが、実際にそのコマンドを
実行する手段がなかった。実装プラン（`tmp/SS-10/mobile-plan.md` のような詳細仕様書）がある場合、そこに
新規/編集対象ファイルの一覧が明記されていることが多い。

**How to apply:** Bash が無い場合は、(1) 実装プラン/PR説明にあるファイルツリーを基に `Glob` で対象ファイルの
実在を確認し、(2) 各ファイルを `Read` で全文読み、計画の仕様（振る舞い表・テストケース一覧）と突き合わせる
「最終状態レビュー」に切り替えてよい。本タスクの前提「oxlint/oxfmt/tsc strict は通過済み」であれば、
整形・構文レベルの差分は気にする必要がなく、最終状態の読解で実質的にコードレビューが成立する。
diff が取れないこと自体は都度ユーザーに一言断ってから進めてよい（[[review-scope-verify-git-state]] と
同様、レビュー実行前提のズレは早めに表明して吸収する）。
