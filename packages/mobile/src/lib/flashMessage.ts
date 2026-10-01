/**
 * 画面をまたぐ1回限りのトースト文言。
 *
 * 用途: ピン登録画面（`/pins/new`）が保存成功後に閉じた先（ナビタブ・ピンタブ（SS-145）。散歩中・散歩していないときの
 * どちらも。SS-124）で「ピンを保存しました」を出すため。`useToast()` は画面ローカルなので、閉じる画面では
 * 表示できない。`features/pin` → `features/walk` の直接 import を作らないため、
 * `src/lib/sessionCleanup.ts` と同じくモジュールレベルの状態をここに置く。
 *
 * SS-119 で用途を加えた: ピン詳細の削除後に戻る先（ピンタブ・散歩中のナビタブ・地図詳細）の「ピンを削除しました」、
 * 編集の保存後に戻る先（ピン詳細）の「ピンを更新しました」。消費する画面は `WalkActiveView`・`PinTabView`・
 * `SanpoMapDetailView`・`PinDetailView`（フォーカス時に `consumeFlashMessage()` を呼ぶ）。消費しない戻り先があると、
 * 文言が残って後で別の画面に遅れて出る。
 *
 * 非永続（メモリのみ）。アプリを再起動すると消える。
 */
let pendingMessage: string | null = null;

/** 次に `consumeFlashMessage()` が呼ばれたときに返す文言を設定する。後勝ち。空文字は無視する。 */
export function setFlashMessage(message: string): void {
  if (message === "") return;
  pendingMessage = message;
}

/** 設定済みの文言を取り出して消す。無ければ null。 */
export function consumeFlashMessage(): string | null {
  const message = pendingMessage;
  pendingMessage = null;
  return message;
}

/** @internal テスト間で状態を隔離する。 */
export function resetFlashMessageForTest(): void {
  pendingMessage = null;
}
