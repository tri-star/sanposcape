# ADR-010: Astra向けハーネスとClaude定義の差分取り込み

## 日付

2026-09-15（ユーザーによる再編成方針の承認と差分取り込みの提案）

## ステータス

採用。適用・検証状況は変更のハンドオフで報告する。

**SS-129 で番号を振り直した**。当初は ADR-007 として追加したが、同じ日に別ブランチで追加された [ADR-007: 周回ルートの生成方式](./ADR-007-loop-route-generation.md) と番号が重複したため、他から参照されていなかった本 ADR を ADR-010 に変更した。内容は変えていない。

## コンテキスト

Claude用のskill/agentを1:1で移植した構成では、計画・実装・課題管理・複数レビューを細かく委譲し、重複した読込や固定の確認停止が発生する。読み取り専用の計画担当へのファイル保存指示や、Claude固有のメモリ自動読込の前提も残っていた。

Claude Code側で今後も主に定義を管理する。Codex側の最適化を残しながら、その後のClaude側の改善を取り込める必要がある。

## 決定

1. メインのAstraが計画・実装・課題操作を行い、独立レビューを1種類のSubagentに統合する。領域別の専門知識はskillと必要時に読む参照へ配置する。
2. 規約・ADR・アプリ用scriptsは共有の正本。課題操作はprovider共通の契約とPlane用参照へ分ける。
3. importerは機械的変換器から、比較・適応・検証・基準更新の支援へ変更する。適応の意味判断はCodexが行う。
4. 前回処理済みのClaude内容とCodex内容をGit管理のsnapshotに保存する。git SHAは来歴として併記するが、未コミットの変更も扱うため内容を正本とする。
5. sourceとtargetの対応は多対多。adapt/retain/omit/deferと理由を記録し、未処理sourceの基準は進めない。削除・改名・双方変更は自動上書きしない。
6. 基準更新前に変更を検証する。sourceまたは基準が計画後に変わった場合は古いplanを拒否する。設定とsnapshotは同じ変更単位でコミットする。

## 検討した選択肢

- 1:1の同期継続: 単純だがCodex向けの調整を失い、委譲の構造も引き継いでしまう。
- git SHAのみ: 小さいがdirty worktreeの内容を表せず、履歴の到達性にも依存する。
- source snapshotだけ: source差分は分かるが、Codexで独自修正された箇所を判断しづらい。
- 双方の内容snapshotと判断記録: データ量は増えるが、部分取り込み・独自調整・未コミット変更を表現できるため採用。

## 影響

定義の総数を削ること自体を目的にせず、繰り返しの委譲と矛盾する指示を減らす。独立レビューの費用は残る。snapshotは比較データとしてのみ読み、コンテキストへ丸ごと展開しない。

意味の適応は決定論的ではなく、validatorやテストだけでは品質を保証できない。レビューと具体的なタスクで確認する。実測前にコスト削減率を約束しない。旧agentの復元はGit履歴で可能。

## 関連情報

- [運用と移行対応](../codex-harness.md)
- [知識の置き場所](../knowledge-management.md)
- [取り込みskill](../../.agents/skills/import-claude-skill/SKILL.md)
- [Astra公式ガイド](https://developers.openai.com/api/docs/guides/latest-model)
- [Subagents](https://developers.openai.com/codex/subagents)
