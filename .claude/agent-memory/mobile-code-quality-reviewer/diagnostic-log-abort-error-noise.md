---
name: diagnostic-log-abort-error-noise
description: 端末診断ログ(logDiagnostic)導入時、ユーザーの正常な中断操作(削除/画面離脱)由来のAbortErrorが「失敗」ログとして紛れ込みやすい
metadata:
  type: feedback
  scope: durable
---

SS-88（写真直送の実機不具合調査。`src/lib/diagnosticLog.ts` 新設）のレビューで発見し、
**2026-09-24 に対処済み**（`photoUploadError.ts` に `isAbortError()` を追加し、
`usePinPhotos.ts` の transfer 分岐と `presignedPostUpload.ts` の fetch 失敗ログで
中断を早期 return する。`pinSaveRunner.ts` は自前の AbortController しか持たず中断が
届かないため、その理由をコメントで残してガードは入れていない）。以下は発見時の記録で、
**同種の設計を次にレビューするときの観点**として残す。

`packages/mobile/src/features/pin/lib/photoUploadError.ts` の `toPhotoUploadErrorCode` は
JSDoc で「`AbortError` は呼び出し側で握りつぶすので渡さないこと（分類対象外）」と書いているが、
実際の呼び出し元（`usePinPhotos.ts` の `processWork` transfer 分岐、`pinSaveRunner.ts` の
`assembleReadyUploadIds`）はどちらも AbortError を事前に除外せず、そのまま
`toPhotoUploadErrorCode(error)` → `logDiagnostic("pin-photo.upload.failed", { code: "unknown",
errorName: "AbortError", ... })` を呼んでいた。

**Why:** ユーザーが「写真を削除する」「登録画面から戻る」といった *正常な操作* をするたびに
`AbortController.abort()` が発火し、進行中の `fetch` が reject される。これは何も壊れていないのに、
実機不具合調査のために追加した診断ログ（本来は「原因不明の直送失敗」を拾うためのもの）に
`code: "unknown"` の「失敗」として記録されてしまう。日常操作のたびに紛れ込むノイズが、
本当に調べたい珍しい失敗との判別を難しくし、ログ追加の目的そのものを弱める。

**How to apply:** hook/runner が例外を分類してログに残す設計（`describeError`/`logDiagnostic`
のような診断ログ、または `toXxxErrorCode` 系の分類関数）をレビューするときは、
(1) `AbortSignal` を能動的に abort する経路（削除・アンマウント・タイムアウト）が呼び出し元に
あるか探す、(2) その abort が「意図した中断」なのか「本当の失敗」なのかを、分類関数に渡す前に
呼び出し元が判定しているか確認する。JSDoc が「呼び出し側が握りつぶす」と書いているだけで
実装がそうなっていないケースがあるため、コメントを鵜呑みにせず実際の catch ブロックを読むこと。
Expo の `DOMException`（`node_modules/expo/src/winter/DOMException.ts`）は `class DOMException
extends Error` なので `error instanceof Error && error.name === "AbortError"` で判定できる
（ブラウザ仕様と異なりExpoは意図的にErrorのサブクラスにしている）。
