/**
 * 画面をまたぐ1回限りのトースト文言。
 *
 * 用途: ピン登録画面（`/pins/new`）が保存成功後に閉じた先（ナビタブ。散歩中・散歩していないときの
 * どちらも。SS-124）で「ピンを保存しました」を出すため。`useToast()` は画面ローカルなので、閉じる画面では
 * 表示できない。`features/pin` → `features/walk` の直接 import を作らないため、
 * `src/lib/sessionCleanup.ts` と同じくモジュールレベルの状態をここに置く。
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
