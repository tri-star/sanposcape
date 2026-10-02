---
name: partial-save-baseline-not-rebased
description: 差分PATCH方式の編集画面で、段階保存が部分成功した後に基準値(baseline)を更新しないと「元に戻した編集」が差分ゼロになりサーバーに反映されない（SS-119 usePinEdit/usePinEditSave）
metadata:
  type: feedback
  scope: durable
---

編集画面が「基準値との差分だけ送る」設計で、保存が複数段（PATCH→写真削除→写真追加）かつ途中失敗で画面に留まれる場合、PATCH成功後に baseline を新サーバー値へ rebase しないと、ユーザーが下書きを元の値へ戻したとき差分ゼロ→サーバーは変更後のまま、というサイレント不整合になる。

**Why:** SS-119 レビューで発見（修正済み。`lib/pinEditSync.ts` の `rebaseBaselineAfterUpdate`、ADR-M-017 D11）。当初は `updatePin` が新しい PinDetail を返すのに runner が `Promise<unknown>` で捨てており、baseline は「最初に1回だけ確定」(render中setState) のため以後更新されなかった。

**How to apply:** 差分方式+部分保存+再試行のレビューでは、(1) 成功した段の結果で baseline を更新しているか、(2) 「A→B保存済み→Aへ戻す」シナリオのテストがあるか、(3) 基準値確定時に invalidated/fetching 中のキャッシュを掴んでいないか、を必ず確認する。
