# Codex ハーネス

Claude Code側のskill・agent・CLAUDE.mdを主な編集元とし、Codexは差分の意図を読み取ってAstra向けに適応する。設計文書・ADR・アプリ用scriptsは共有の正本。Codex側の定義を毎回1:1で作り直さない。

## 配置と責任

| 配置 | 責任 |
| --- | --- |
| ルート/各packageのAGENTS.md | 共通の運用と正本への導線 |
| task-workflow | 課題取得、計画、実装、検証、レビュー、進捗反映 |
| issue-tracker + references/plane.md | 課題操作の共通契約とprovider別手順 |
| backend/frontend/mobile-development | メインによる領域別の計画・実装・検証 |
| change-review + references | 変更全体・文書・条件付きsecurityを独立した文脈で確認 |
| .codex/agents/adversarial_reviewer.toml | 1種類の型をfocus別に逐次起動。結果を返し、編集や外部更新はしない |
| import-claude-skill | 差分の評価・適応と取り込み基準の更新 |

通常の計画・実装・課題操作ではSubagentを起動しない。実装後は同じreviewer型を、focus=change（変更全体）・docs（文書）・条件付きsecurityの新しい文脈で逐次使う。通常2回、securityに触れる変更は3回、同時実行は1体まで。前のreviewerの結論を次へ渡さず、各観点の確認場所と根拠を必須にする。定型文言・書式だけならメイン確認でよい。修正はメイン、再確認は該当focusの変更箇所に絞る。利用環境の上位制約とユーザーの指定を優先する。

mainモデルは実行環境の選択に従い、取り込みでユーザー設定を上書きしない。独立reviewerの定義はgpt-6-astraのhighを使う。役職ごとの固定モデル変換は行わない。実際のクライアントで新しい定義が読み込まれたことを確認し、未登録なら定義とfocusを明示した代行・未実施を区別して報告する。

## 利用例

- 「SS-123のプランだけ作って」: 取得と計画で終了。状態変更・実装なし。
- 「SS-123を実装して」: 対象領域で計画・実装・検証・独立レビュー。課題の進捗も反映。
- 「この差分をレビューして」: 指摘を返す。編集・外部投稿なし。
- 「PR作成まで進めて」: 作成の成功確認後に課題へURLとレビュー待ちを反映。
- 「Claude側の変更を取り込んで」: import-claude-skillで前回との差分を適応。

backendはDockerで開発し、mobileは必要な端末確認と依頼範囲内のPR証拠添付を行う。Webはpackages/lpのAstro静的サイト。React用テンプレートを既存構成として扱わない。対象のAGENTS.md・規約・ADRと指定された領域メモリを先に読み、規約をskillへ複製しない。

計画には「プライバシーへの影響」と、影響が無い場合も理由を書く。[データ取扱い台帳](privacy/data-inventory.md)の対象パスとデータの扱いの変更から判断し、影響があれば台帳・ポリシー本文/revisedOn・App Privacy申告を同じ変更で更新する。対象パスに触れる差分や、パス外でもデータの扱いを変える差分ではsecurityを起動し、6番目の観点で実装と台帳の整合を確認する。対象パスは台帳にだけ置く。

## 差分取り込み

[import-claude-skill](../.agents/skills/import-claude-skill/SKILL.md) が具体的なコマンドと判断手順を持つ。

基準は `.codex/claude-import/baseline.json`。前回処理済みのsource/targetの内容・hash・実行属性と、対応先・理由を保存する。sourceのgit SHAは来歴用で、未コミットの変更も表現できる内容snapshotを比較の正本とする。snapshotは実行指示でも自動読み込み対象でもない。

planは読み取り、diffは選んだファイルだけ表示、acceptは検証済みunitだけ基準更新する。adapt/retain/omit/deferを明示し、deferは次回差分に残す。両側変更は前回source・現在source・前回target・現在targetを比較する。削除・改名でCodex機能を自動削除しない。

基準と設定変更は一緒にコミットする。失敗・未適用の状態で元の基準を先に進めない。同時の基準更新はロックと古いplanの拒否で防ぐ。スクリプトはPOSIX環境とPython 3.11以上の標準ライブラリで動作し、LLM APIを呼ばない。

## 移行対応

| 旧構成 | 現在 |
| --- | --- |
| 領域別workflow、planner、developer | task-workflow + 領域別development skill |
| 9種類のreviewer + doc-maintainer | change-review + 1種類のadversarial_reviewerをfocus別に逐次実行 |
| plane-project-manager | issue-tracker |
| task-status-sync | issue-trackerへ接続する互換入口 |
| aws-env-inspector | task-workflowで対象構成をメインが調査 |
| Dependabot用2 agent | dependabot-update-workflowをメインで実行 |
| Claude mobile-local-verification | mobile-developmentの端末確認手順 |
| Claude knowledge-harvest | task-workflowの完了時参照へ統合。PR作成・修正後に知識・レビュー観点を整理し、共有ログの移し込みを行う。メモリ操作は実行環境の規則に従う |
| Claude review-tour | Codex向けの[review-tour](../.agents/skills/review-tour/SKILL.md)でPRを観点ごとに対話案内 |
| Claude knowledge-review | 専用skillは移植しない。完了時参照に、依頼された定期棚卸しでmain全体の文書乖離を確認する手順を持つ |
| Claude mobile-pr-verification | mobile-developmentのPR確認参照へ統合。端末確認と画像添付の成否を分け、外部投稿は依頼範囲に従う |

課題分割・日程整理・初期化・環境構築・エミュレータ・Git worktree・PRコメント機能は維持して呼び出しを整理した。Claude側の定義は変更しない。使われなくなった旧定義はGit履歴から復元できる。

## 検証と限界

`python3 .agents/skills/import-claude-skill/scripts/validate_harness.py` で形式と参照を検査する。`python3 -m unittest discover -s .agents/skills/import-claude-skill/tests -v` で取り込みの保護動作を検査する。いずれもアプリ依存を読み込まないハーネス専用の検証。

`python3 scripts/knowledge/check-doc-references.py` はCodex skillのMarkdownも検査する。launch-projectの雛形は生成先を前提とするので除外する。検査対象外の書き方や意味の乖離はdocsの独立レビューが補う。共有scripts・hooksはimporterのsnapshot対象外なので、変更された指示の参照先として別に確認する。

静的検査はskillの意味や全ての指示の整合性を証明しない。重要な変更は独立レビューと実際のタスクシナリオで検証する。外部課題更新は権限のある対象で確認し、未実施ならその限界を明示する。Subagent数・反復・検証範囲は記録できるが、トークン/時間の削減率は実測なしに断言しない。
