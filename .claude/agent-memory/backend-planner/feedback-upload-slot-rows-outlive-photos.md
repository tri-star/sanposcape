---
name: feedback-upload-slot-rows-outlive-photos
description: pin_photo_uploads の attached 行は写真・ピンを削除しても残る（消えるのはアカウント削除の CASCADE だけ）。枠に写真ごとの個人データを持たせるなら、紐付け時に写して枠の側は消す
metadata:
  type: feedback
  scope: durable
---

アップロード枠（`pin_photo_uploads`）は、紐付け後に `status="attached"` へ変わるだけで行は残る。写真の削除・ピンの削除・地図の削除は
`pin_photos` 側だけを消し、取り消し API（DELETE）は `pending` しか物理削除しない。BK-3 の掃除の対象も期限切れの `pending` だけ。
つまり枠に載せた値は、写真を消した後もアカウント削除まで残り続ける。

**Why:** SS-163（撮影日時 `taken_at`）で、枠の発行時に受け取った値を紐付け時に `pin_photos` へ写す設計にしたとき、
撮影日時（行動の履歴に当たる）が写真を消した後も枠に残ることに気付いた。コードを読めば分かるが、「枠は一時的なもの」という
思い込みで見落としやすい。

**How to apply:** 枠発行のリクエストに写真ごとのメタデータ（日時・位置・キャプションなど）を足すプランでは、
`mark_attached()` で写すと同時に枠の側を NULL に戻す設計を入れる（SS-163、ADR-009 決定34）。
期限切れの `pending` 枠には BK-3 が入るまで残る点もリスクとして書く。

関連: [[feedback-existing-table-column-add-deploy-window]]
