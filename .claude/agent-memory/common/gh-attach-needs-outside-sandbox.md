---
name: gh-attach-needs-outside-sandbox
description: gh pr comment / pr create の --attach は、sandbox が uploads.github.com を拒むので失敗する（コメントは作られない）。sandbox の外で再実行する。画像の参照は --attach と同じ絶対パスに
metadata:
  type: feedback
  scope: durable
  source_issue: SS-263
---

`gh pr comment <PR> --body-file <本文> --attach <画像>` を Claude Code の sandbox の中で実行すると、画像のアップロード先
`https://uploads.github.com/user-attachments/assets?...` がネットワークの拒否リストに入っていて失敗する。
出力は `failed to upload ...: host is on the deny list` と `no comment was posted` で、コメントは作られない（gh 2.99.0 で確認）。
本文だけの `gh pr comment`・`gh pr create` は sandbox の中で通る。

- 同じコマンドを sandbox の外（`dangerouslyDisableSandbox: true`）で1回だけ再実行する。コメントが作られていないので重複しない。
- 本文の `![alt](<パス>)` は `--attach` と一字一句同じ絶対パスにする。worktree の下（`tmp/<issue-id>/`）のパスなら sandbox の内外で同じファイルを指す。
  `$TMPDIR` は内外で違う（内は `/tmp/claude-1000`、外は `/tmp`）ので、添付する画像を置かない。
- 投稿後は `gh api repos/<owner>/<repo>/issues/comments/<id> -q .body` で、ローカルのパスが残っていない（すべて `user-attachments` に置き換わった）ことを確かめる。

**How to apply:** PR に画像を添付する skill（`mobile-pr-verification`・`lp-pr-verification`）を動かすときは、`--attach` 付きの gh を最初から sandbox の外で実行してよい。
