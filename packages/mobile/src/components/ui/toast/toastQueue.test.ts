import { describe, expect, it } from "vitest";

import {
  dequeueToast,
  enqueueToast,
  type ToastItem,
  type ToastQueueState,
} from "@/components/ui/toast/toastQueue";

function makeItem(overrides: Partial<ToastItem> = {}): ToastItem {
  return {
    id: overrides.id ?? "toast-1",
    message: overrides.message ?? "保存しました",
    variant: overrides.variant ?? "info",
    durationMs: overrides.durationMs ?? 3000,
  };
}

describe("enqueueToast", () => {
  it("空の状態に追加できる", () => {
    const state: ToastQueueState = { items: [] };
    const next = enqueueToast(state, makeItem());
    expect(next.items).toHaveLength(1);
    expect(next.items[0]?.id).toBe("toast-1");
  });

  it("上限(maxVisible)を超えたら最古のトーストが落ちる", () => {
    const state: ToastQueueState = { items: [] };
    const withOne = enqueueToast(state, makeItem({ id: "1", message: "a" }), 2);
    const withTwo = enqueueToast(withOne, makeItem({ id: "2", message: "b" }), 2);
    const withThree = enqueueToast(withTwo, makeItem({ id: "3", message: "c" }), 2);

    expect(withThree.items.map((item) => item.id)).toEqual(["2", "3"]);
  });

  it("既定の maxVisible は3", () => {
    let state: ToastQueueState = { items: [] };
    for (const label of ["a", "b", "c", "d"]) {
      state = enqueueToast(state, makeItem({ id: label, message: label }));
    }
    expect(state.items).toHaveLength(3);
    expect(state.items.map((item) => item.id)).toEqual(["b", "c", "d"]);
  });

  it("直前と同一メッセージの連続追加は重複しない", () => {
    const state: ToastQueueState = { items: [] };
    const first = enqueueToast(state, makeItem({ id: "1", message: "同じメッセージ" }));
    const second = enqueueToast(first, makeItem({ id: "2", message: "同じメッセージ" }));

    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.id).toBe("1");
  });

  it("間に別メッセージが挟まれば同一メッセージでも追加される", () => {
    const state: ToastQueueState = { items: [] };
    const first = enqueueToast(state, makeItem({ id: "1", message: "A" }));
    const second = enqueueToast(first, makeItem({ id: "2", message: "B" }));
    const third = enqueueToast(second, makeItem({ id: "3", message: "A" }));

    expect(third.items.map((item) => item.id)).toEqual(["1", "2", "3"]);
  });

  it("元の state を破壊しない(イミュータブル)", () => {
    const state: ToastQueueState = { items: [makeItem({ id: "1", message: "a" })] };
    const originalItems = state.items;
    enqueueToast(state, makeItem({ id: "2", message: "b" }));

    expect(state.items).toBe(originalItems);
    expect(state.items).toHaveLength(1);
  });
});

describe("dequeueToast", () => {
  it("指定 id のトーストを取り除く", () => {
    const state: ToastQueueState = {
      items: [makeItem({ id: "1", message: "a" }), makeItem({ id: "2", message: "b" })],
    };
    const next = dequeueToast(state, "1");
    expect(next.items.map((item) => item.id)).toEqual(["2"]);
  });

  it("存在しない id の削除は状態を変えない(例外にしない)", () => {
    const state: ToastQueueState = { items: [makeItem({ id: "1", message: "a" })] };
    const next = dequeueToast(state, "does-not-exist");
    expect(next).toBe(state);
  });

  it("元の state を破壊しない(イミュータブル)", () => {
    const state: ToastQueueState = {
      items: [makeItem({ id: "1", message: "a" }), makeItem({ id: "2", message: "b" })],
    };
    const originalItems = state.items;
    dequeueToast(state, "1");

    expect(state.items).toBe(originalItems);
    expect(state.items).toHaveLength(2);
  });
});
