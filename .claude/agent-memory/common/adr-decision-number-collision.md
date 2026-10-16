---
name: adr-decision-number-collision
description: 既存 ADR に追補する「決定N」の番号も、並行する worktree の未マージのブランチと衝突する。git log --all -S と各 worktree の grep で空きを確かめてから振る
metadata:
  type: feedback
  scope: durable
  source_issue: SS-109
---

SS-109 で ADR-009 に「決定35」を追補しかけたが、並行する SS-116（別 worktree・未マージ）が既に ADR-009 の決定35 を使っていた。
コード・テンプレート・テストのコメントにも「決定35」を書いた後だったため、10 ファイル余りを書き換えることになった。

**Why:** adr-writing skill は ADR ファイルの連番（`ADR-M-019` など）の衝突を他の worktree で確かめるよう求めているが、
長い ADR の中の「決定N」の連番も同じく衝突する。main だけを見ると空いて見える。

**How to apply:**
- 既存 ADR に決定を追補する前に、次の両方で番号の空きを確かめる。
  - `git log --all --oneline -S"決定<N>" -- docs/adr/<対象 ADR>`（push 済みのブランチ）
  - `for w in $(git worktree list | awk '{print $1}'); do grep -l "決定<N>" $w/docs/adr/<対象 ADR>; done`（未 push の worktree）
- 番号はコードのコメントに書く前に確定させる。衝突が見つかったら PR の申し送りに「マージ順で番号がずれたら揃える」と書く。

関連: [[adr-renumber-sed-pitfall]]
