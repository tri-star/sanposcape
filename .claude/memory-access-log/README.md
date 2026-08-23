# agent-memory アクセスログ

`.claude/agent-memory/` 配下のメモリ**本文**が読まれた記録。
「そのメモリが実際に役に立ったか」を感覚ではなく数値で判断するための計測データ。

- 記録するのは `scripts/knowledge/record-memory-access.sh`（PreToolUse フック / Read）
- 集計するのは `scripts/knowledge/memory-access-report.py`
- 保存先は `<YYYY-MM>/<session-id>.jsonl`

セッションごとに別ファイルへ追記するため、**複数人がそれぞれのログをコミットしても衝突しない**。
集計時は全ファイルを合算する。手で編集しないこと。

古い月のディレクトリは棚卸しのタイミングで削除してよい（削除すると、その期間の
「読まれていない」判定の根拠も失われる点に注意）。
