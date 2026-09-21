---
name: summarize-pr-comments
description: GitHub PRのレビューコメントを取得して対応方針を整理する。返信・resolveは依頼された場合に行う。
---

# PR コメント

`gh auth status` と対象PRを確認し、`bash .agents/skills/summarize-pr-comments/get-pr-comments.sh <PR番号>` で取得する。スクリプトのページング・件数を確認し、取得上限に達する場合は残りも取得する。

スレッドID、file:line、指摘内容、議論の結論、対応方針、resolved/outdated/minimizedを整理する。hideされているだけで解決済みと扱わない。保存する場合は現在の課題の作業フォルダを使う。

要約だけの依頼では返信・resolveを行わない。指摘対応と返信まで依頼された場合は承認済みの範囲で進め、同じ返信を重複投稿しない。

`reply-resolve.sh <thread-id> <本文> [--resolve]` はこのskill内のスクリプト。対応済みは変更の根拠を返信してresolve、別課題化は課題URLと判断、見送りは理由を返信して未解決のままにする。本文をシェルのコードとして解釈させず安全に渡す。

投稿後は返信URLとisResolvedを確認する。タイムアウト時は再取得してから再試行し、部分成功を記録する。依頼されていない外部投稿は、本文と対象を具体化してから確認する。
