export type ToastVariant = "info" | "success" | "warning" | "danger";

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
};

export type ToastQueueState = { items: ToastItem[] };

const DEFAULT_MAX_VISIBLE = 3;

/**
 * トーストをキューへ追加する純粋関数。
 * - `maxVisible`(既定3)を超えたら最古のトーストを捨てる。
 * - 直前のトーストと同一 `message` の場合は重複追加しない(状態をそのまま返す)。
 * - 引数の `state` を破壊しない(新しいオブジェクトを返す。変化が無い場合は同じ参照を返す)。
 */
export function enqueueToast(
  state: ToastQueueState,
  item: ToastItem,
  maxVisible: number = DEFAULT_MAX_VISIBLE,
): ToastQueueState {
  const lastItem = state.items.at(-1);
  if (lastItem !== undefined && lastItem.message === item.message) {
    return state;
  }

  const nextItems = [...state.items, item];
  const overflowCount = nextItems.length - maxVisible;
  return {
    items: overflowCount > 0 ? nextItems.slice(overflowCount) : nextItems,
  };
}

/**
 * 指定 id のトーストをキューから取り除く純粋関数。
 * 存在しない id を渡した場合は何もせず(例外にせず)同じ状態を返す。
 */
export function dequeueToast(state: ToastQueueState, id: string): ToastQueueState {
  const nextItems = state.items.filter((item) => item.id !== id);
  if (nextItems.length === state.items.length) {
    return state;
  }
  return { items: nextItems };
}
