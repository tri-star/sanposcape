/**
 * 招待シート（Dialog = RN の Modal）が閉じ終えてから OS の共有シートを開くための、本文の預かり（SS-264）。
 *
 * iOS は、閉じている途中の Modal の上に共有シート（`UIActivityViewController`）を出そうとすると、
 * 警告をログに出すだけで何も表示しない。そこで本文を預けて Dialog を閉じ、Modal の `onDismiss`
 * （iOS でだけ発火する）で開く。`onDismiss` が来ない場合に備え、`fallbackMs` 経っても来なければ開く。
 * 開くのは先に来た方の1回だけで、開いたら（または捨てたら）本文を持たない（台帳 3.8）。
 */
export type PendingShare = {
  /** 本文を預ける。すでに預けた本文があれば置き換える。 */
  hold: (message: string) => void;
  /** Dialog が閉じ終えた。預けた本文があれば開く。 */
  flush: () => void;
  /** 開かずに捨てる（画面を離れたとき）。 */
  discard: () => void;
};

/** `onDismiss` を待つ上限。Dialog の fade（約 300ms）が終わる時間に余裕を足した値。 */
export const PENDING_SHARE_FALLBACK_MS = 1000;

export function createPendingShare(
  open: (message: string) => void,
  fallbackMs: number = PENDING_SHARE_FALLBACK_MS,
): PendingShare {
  let message: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    message = null;
  };

  const flush = () => {
    const held = message;
    clear();
    if (held !== null) open(held);
  };

  return {
    hold: (next) => {
      clear();
      message = next;
      timer = setTimeout(flush, fallbackMs);
    },
    flush,
    discard: clear,
  };
}
