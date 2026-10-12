# common memory index

領域（backend / mobile）に属さない、git・ドキュメント作業の落とし穴。

- [検証で壊したソースを git checkout で戻さない](verification-revert-without-git-checkout.md) — 未コミットの修正ごと消える。手で戻すか、壊す前に WIP コミット。stash は使わない
- [ADR 改番の一括 sed の落とし穴](adr-renumber-sed-pitfall.md) — 番号だけの置換はスラッグの変更を見落とす。旧パス全体→新パス全体で置換し、置換後に grep で確認
- [指摘単位のコミット分割の手順](commit-splitting.md) — printf で git add -p に答える / 隣接 hunk は並べ替えか patch 抽出 / 最後にバックアップと diff で照合
