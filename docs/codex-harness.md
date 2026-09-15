# Codex ハーネス

Claude Code側のskill・agent・CLAUDE.mdを主な編集元とし、Codexは差分の意図を読み取ってAstra向けに適応する。設計文書・ADR・アプリ用scriptsは共有の正本。Codex側の定義を毎回1:1で作り直さない。

## 配置と責任

| 配置 | 責任 |
| --- | --- |
| ルート/各packageのAGENTS.md | 共通の運用と正本への導線 |
| task-workflow | 課題取得、計画、実装、検証、レビュー、進捗反映 |
| issue-tracker + references/plane.md | 課題操作の共通契約とprovider別手順 |
| backend/frontend/mobile-development | メインによる領域別の計画・実装・検証 |
| change-review + references | 反例の確認と文書乖離。領域別観点を必要時に読む |
| .codex/agents/adversarial_reviewer.toml | 独立レビュー。結果を返し、編集や外部更新はしない |
| import-claude-skill | 差分の評価・適応と取り込み基準の更新 |

通常の計画・実装・課題操作ではSubagentを起動せず、実装後の独立レビューに1つ使う。定型文言・書式だけならメイン確認でよい。レビューの修正はメイン、再確認は変更箇所に絞る。利用環境の上位制約とユーザーの指定を優先する。

mainモデルはgpt-6-astra。独立reviewerは同モデルのhighを使う。役職ごとにSol/Terraへ自動変換する旧マッピングは廃止した。実際のクライアントで新しい設定が読み込まれたことを確認して使用する。

## 利用例

- 「SS-123のプランだけ作って」: 取得と計画で終了。状態変更・実装なし。
- 「SS-123を実装して」: 対象領域で計画・実装・検証・独立レビュー。課題の進捗も反映。
- 「この差分をレビューして」: 指摘を返す。編集・外部投稿なし。
- 「PR作成まで進めて」: 作成の成功確認後に課題へURLとレビュー待ちを反映。
- 「Claude側の変更を取り込んで」: import-claude-skillで前回との差分を適応。

backendはDockerで開発し、mobileは必要な端末確認を行う。frontendは現在アプリ未作成で、テンプレートを既存構成として扱わない。対象のAGENTS.md・規約・ADRを先に読み、内容をskillへ複製しない。

## 差分取り込み

[import-claude-skill](../.agents/skills/import-claude-skill/SKILL.md) が具体的なコマンドと判断手順を持つ。

基準は `.codex/claude-import/baseline.json`。前回処理済みのsource/targetの内容・hash・実行属性と、対応先・理由を保存する。sourceのgit SHAは来歴用で、未コミットの変更も表現できる内容snapshotを比較の正本とする。snapshotは実行指示でも自動読み込み対象でもない。

planは読み取り、diffは選んだファイルだけ表示、acceptは検証済みunitだけ基準更新する。adapt/retain/omit/deferを明示し、deferは次回差分に残す。両側変更は前回source・現在source・前回target・現在targetを比較する。削除・改名でCodex機能を自動削除しない。

基準と設定変更は一緒にコミットする。失敗・未適用の状態で元の基準を先に進めない。同時の基準更新はロックと古いplanの拒否で防ぐ。スクリプトはPOSIX環境とPython 3.11以上の標準ライブラリで動作し、LLM APIを呼ばない。

## 移行対応

| 旧構成 | 現在 |
| --- | --- |
| 領域別workflow、planner、developer | task-workflow + 領域別development skill |
| 9種類のreviewer + doc-maintainer | change-review + adversarial_reviewer |
| plane-project-manager | issue-tracker |
| task-status-sync | issue-trackerへ接続する互換入口 |
| aws-env-inspector | task-workflowで対象構成をメインが調査 |
| Dependabot用2 agent | dependabot-update-workflowをメインで実行 |
| Claude mobile-local-verification | mobile-developmentの端末確認手順 |
| Claude review-tour / knowledge-harvest / knowledge-review | 今回は専用skillを移植しない。設計判断の記録と知識規約は維持 |

課題分割・日程整理・初期化・環境構築・エミュレータ・Git worktree・PRコメント機能は維持して呼び出しを整理した。Claude側の定義は変更しない。使われなくなった旧定義はGit履歴から復元できる。

## 検証と限界

`python3 .agents/skills/import-claude-skill/scripts/validate_harness.py` で形式と参照を検査する。`python3 -m unittest discover -s .agents/skills/import-claude-skill/tests -v` で取り込みの保護動作を検査する。いずれもアプリ依存を読み込まないハーネス専用の検証。

静的検査はskillの意味や全ての指示の整合性を証明しない。重要な変更は独立レビューと実際のタスクシナリオで検証する。外部課題更新は権限のある対象で確認し、未実施ならその限界を明示する。Subagent数・反復・検証範囲は記録できるが、トークン/時間の削減率は実測なしに断言しない。
