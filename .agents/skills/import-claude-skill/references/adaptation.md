# 適応方針と決定記録

## 比較対象

sourceは `.claude/skills/`（scripts・references・assetsを含む）、`.claude/agents/`、ルートとpackages配下のCLAUDE.md。targetは `.agents/skills/`、`.codex/agents/`、`.codex/config.toml`、ルートとpackages配下のAGENTS.md、`docs/codex-harness.md`。

共有の設計文書・ADR・アプリ用scriptsはコピーしない。変更された指示の参照先として実物を確認する。メモリや認証設定は包括的にsnapshotへ追加しない。

Claudeの技能をCodexの役職に直訳しない。計画/実装は領域別skillへ、レビュー観点はchange-reviewの参照へ、課題操作はissue-trackerへ、機械的な処理はscriptへ整理する。新規Subagentは独立性やコンテキスト分離が必要な場合だけ検討する。

例: mobileのplannerと3 reviewerの規約更新は、mobile-developmentとchange-review/references/mobile.mdに統合できる。既存のCodex向け修正は維持し、双方で要求が変わった場合に根拠を照合する。暗黙のメモリ読込、Claude用ツール/権限、全件並列レビュー、固定モデル対応表は引き継がない。

## 記録形式

planを保存したときのSHA256を使う。キーはplanの `units` と完全一致させ、未処理はdeferにする。targetはディレクトリでなく正確なファイルパス。削除対象は前回基準かplanに存在するパスを指定できる。

```json
{
  "plan_sha256": "<plan出力のSHA256>",
  "validation": ["実行した検証コマンド: 実際の結果"],
  "reviewed_target_drift": ["<plan.target_changesの全path>"],
  "codex_only_targets": ["<sourceに対応しないCodex固有の追加/変更パス>"],
  "units": {
    ".claude/skills/mobile-workflow": {
      "action": "adapt",
      "targets": [".agents/skills/mobile-development/SKILL.md"],
      "reason": "新しい端末検証手順をメインの開発skillに統合"
    },
    ".claude/agents/mobile-planner.md": {
      "action": "retain",
      "targets": [".agents/skills/mobile-development/SKILL.md"],
      "reason": "計画時に該当ADRを確認する要件は既に充足"
    },
    ".claude/skills/review-tour": {
      "action": "defer",
      "targets": [],
      "reason": "今回は対話型ツアーを移植しない"
    }
  }
}
```

omit/deferはtargetsを空にする。adapt/retainは対応先を必須とする。`reviewed_target_drift` は計画時に存在したCodex独自変更を確認した記録であり、自動で基準へ反映する指定ではない。実際に基準へ進めるtargetは処理済みunitのtargetsとcodex_only_targetsだけ。

共有targetへ一部のsourceだけ取り込む場合、処理したsourceのみacceptし、残りはdeferにする。次回は古いsourceとの差分と最新のtargetを再照合する。削除は利用箇所を確認し、残存機能を失わないことを検証してから行う。

初回には未追跡の新規Codexファイルもtargetに現れる。全てを無条件に受け入れず、今回作成/確認したものだけ対応付ける。基準は過去に取り込みが完了した状態を表し、単なる観測・計画で更新しない。
