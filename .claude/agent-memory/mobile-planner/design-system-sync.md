---
name: design-system-sync
description: デザイントークンの値の SSoT は Claude Design、実装はリポジトリ（tokens.ts 手書き）。同期は Design → コードの一方向。MCP は CI から呼べないので codegen は fetch と transform を分離する
metadata:
  type: reference
  scope: durable
  adr: packages/mobile/adr/ADR-M-005-styling-without-unistyles.md
---

SS-1 で決めた Claude Design と mobile リポジトリの切り分け（スタイリングの決定は ADR-M-005）。

## SSoT と同期方向

- トークンの**値**の SSoT は Claude Design プロジェクト `ea6ab024-4c09-45b2-94f5-0a6a0315a88d`「Sanpo Design System」。
  コンポーネントの**実装**の SSoT はリポジトリ（手書き）。同期は **Design → コードの一方向**で、DesignSync への push はしない。
- mobile のトークンは `src/theme/tokens.ts` が手書き（生成ディレクトリは無い）。「Design で値を決め、tokens.ts に手で写す」運用。
- プランでは**既存トークン名で表現できるか**を先に確認し（例: danger / dangerTint / dangerPress / borderSubtle は既にある）、
  足りないときだけ Design 側への提案を書く。生の色値のハードコードは禁止。

**Why:** 今後も画面デザインは Claude Design で行う前提。コード側をトークンの SSoT にすると両方が正しいと主張する状態になる。
RN は Web と primitive が違うので、Web の JSX からコンポーネントを生成する意味もない。

## MCP を入力源にした自動化は CI で動かない

DesignSync・Plane・Pencil などの MCP ツールはエージェントの実行環境にしか無く、GitHub Actions からは呼べない。
CI で drift check をしたいなら、fetch（エージェントが手動実行し生のままコミット）と transform（ネットワーク非依存のスクリプト）を
分離し、CI では transform の再実行 + `git diff --exit-code` にする。

**How to apply:** トークン値の変更提案は Design 側から始める前提で書く。MCP を入力源とする自動化をプランに入れるときは、
CI で実行可能かを先に検討する。

Related: [[reference_mock_and_prop_divergence]]
