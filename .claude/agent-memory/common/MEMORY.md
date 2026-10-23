# common memory index

領域（backend / mobile）に属さない、git・ドキュメント作業の落とし穴。

- [検証で壊したソースを git checkout で戻さない](verification-revert-without-git-checkout.md) — 未コミットの修正ごと消える。手で戻すか、壊す前に WIP コミット。stash は使わない
- [ADR 改番の一括 sed の落とし穴](adr-renumber-sed-pitfall.md) — 番号だけの置換はスラッグの変更を見落とす。旧パス全体→新パス全体で置換し、置換後に grep で確認
- [指摘単位のコミット分割の手順](commit-splitting.md) — printf で git add -p に答える / 隣接 hunk は並べ替えか patch 抽出 / 最後にバックアップと diff で照合
- [ADR の「決定N」の番号の衝突](adr-decision-number-collision.md) — 既存 ADR への追補の決定番号も並行 worktree と衝突する。git log --all -S と各 worktree の grep で空きを確かめ、コメントに書く前に確定
- [sandbox が置く追跡外ファイル](sandbox-placeholder-untracked-files.md) — git status の .bashrc・.gitconfig・.claude/hooks 等は sandbox の /dev/null（文字デバイス 1,3）。add はパスを名指し
- [astro check が黙って素通りする](astro-check-silent-skip-missing-dep.md) — @napi-rs/wasm-runtime の欠けで「@astrojs/check を入れるか」を聞き、stdin 無しだと exit 0 で検査しない。出力の 0 errors で判断し、install --force で直す
- [文書の節名はコードのコメントから引かれている](doc-section-quoted-by-code-comments.md) — CI は節名・文言の引用を検査しない。文書を削る・見出しを変える前に文書名で grep し、削る規則に一次記録があるか確かめる
- [Orca の管理外の worktree が消えた](worktree-outside-orca-gets-removed.md) — worktree は orca-ide で作り、既存ブランチは改名して base にする。区切りごとにすぐコミット。メインの外は sandbox から書けない
- [長い規約ページは curl で読む](fetch-long-legal-pages-with-curl.md) — WebFetch は本文を切り捨てる。curl + HTML 除去 + スライスで条項を抜き、「Last modified」とアーカイブで版を確かめる
