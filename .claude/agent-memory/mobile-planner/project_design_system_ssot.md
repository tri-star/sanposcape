---
name: project_design_system_ssot
description: SS-1 で決めた Claude Design と mobile リポジトリ間の SSoT 切り分けと同期方向・トークン実体の置き場
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-005-styling-without-unistyles.md
---

デザイントークンの**値**の SSoT は Claude Design プロジェクト `ea6ab024-4c09-45b2-94f5-0a6a0315a88d`
「Sanpo Design System」。コンポーネント**実装**の SSoT はリポジトリ側(手書き)。
同期は **Design → コードの一方向**に固定し、DesignSync への push は行わない。

**Why:** 今後も画面デザインは Claude Design 側で行う前提。コード側をトークンの SSoT にすると
「両方が正しいと主張する」状態になる。一方 RN は Web と primitive が違うため、Web の JSX から
コンポーネントを生成する意味がない(21個中7個は作り替え/不採用の判断が入っている)。

**How to apply:** トークン値の変更提案は必ず Claude Design 側から始める前提で書く。
逆方向の同期(RN 実装を DS へ push)を提案しない。

**実体の置き場（2026-09 時点で確認）**: mobile のトークンは **`src/theme/tokens.ts` が手書き**で、
`src/theme/generated/` のような生成ディレクトリは存在しない（`src/theme/` は tokens/ThemeProvider/
makeStyles/useTheme/withAlpha のみ）。つまり「Design で値を決め、tokens.ts に手で写す」運用。
プランでは **既存トークン名で表現できるか**を先に確認し（例: danger / dangerTint / dangerPress /
borderSubtle は既にある）、足りない場合だけ Design 側への提案を書く。生の色値のハードコードは禁止
（SS-26 が「トークンに無い値の複製」を問題視）。

関連: [[mobile-codegen-ci-constraint]]
