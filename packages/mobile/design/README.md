# design/

Claude Design プロジェクト「Sanpo Design System」(`ea6ab024-4c09-45b2-94f5-0a6a0315a88d`) から
DesignSync 経由で取得した**生スナップショット**を置くディレクトリ。

## 手編集禁止

`design/tokens/*.css` は **一切加工せずそのまま取得したファイル**であり、手で編集しない。
`pnpm --filter mobile design:tokens` の入力(codegen の唯一のソース)であり、
CI の drift check(`design:tokens:check`)がこのディレクトリと生成物の整合性を機械的に検証する。

デザインを直したい場合は、Claude Design 側を更新してから再取得する。逆方向(このリポジトリから
DesignSync へ書き込む)は行わない。

## 更新手順

1. DesignSync で `tokens/colors.css` / `typography.css` / `spacing.css` / `effects.css` / `fonts.css` の
   5ファイルを再取得し、加工せずに `design/tokens/` へ上書き保存する。
2. `pnpm --filter mobile design:tokens` を実行し、`src/theme/generated/tokens.generated.ts` を再生成する。
3. 取得した CSS の差分と、再生成された TypeScript の差分を**両方まとめて1コミット**する。
   (デザイン変更が PR の diff として両方の形で見えることが目的。生の CSS だけ・生成物だけの
   コミットは避ける)

## なぜ `base.css` を取得しないのか

`base.css` はトークンではなくリセット/ベーススタイル(Web 向け)であり、RN に持ち込む意味が
ないため取得対象に含めない。フォントスタックの定義は `fonts.css` / `typography.css` 側にある。

## 同期の方向

**Design → コードの一方向。** コード側の実装(`src/theme/`, `src/components/ui/` 等)を
DesignSync へ push することはしない。詳細な運用は
[`docs/design-tokens.md`](../docs/design-tokens.md) を参照。
