# agent-memory アクセスログ

`.claude/agent-memory/` 配下のメモリ**本文**が読まれた記録。
「そのメモリが実際に役に立ったか」を感覚ではなく数値で判断するための計測データ。

- 記録するのは `scripts/knowledge/record-memory-access.sh`（PreToolUse フック / Read・Bash）。
  フックは作業ツリーの外（`<git-common-dir>/memory-access-log/`）に記録する
- ここへ移すのは `scripts/knowledge/flush-memory-access-log.sh`。PR を作るとき（knowledge-harvest のコミット）に実行し、
  移した分をコミットする。人が手で PR を作るときも PR 前に実行する
- 集計するのは `scripts/knowledge/memory-access-report.py`（ここと手元の両方を読む）
- 保存先は `<YYYY-MM>/<session-id>.<移した時刻>-<乱数>.jsonl`（移すたびに一意な名前にする）

移すたびに別ファイルを作るため、**別マシン・複数人がそれぞれのログをコミットしても、同じセッションの分を別々の PR に移しても衝突しない**。
集計時は全ファイルを合算する。手で編集しないこと。

古い月のディレクトリは棚卸しのタイミングで削除してよい（削除すると、その期間の
「読まれていない」判定の根拠も失われる点に注意）。

SS-202（2026-10）でメモリを agent 名ごとから領域ごと（`backend/`・`mobile/`・`common/`）に再編したため、
それ以前の記録は旧ディレクトリ名（`backend-planner` など）で残っている。集計では「削除済みだが読まれた記録が残るメモリ」として出る。
