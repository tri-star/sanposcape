import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPendingShare } from "@/features/pin/lib/invitation/pendingShare";

describe("createPendingShare", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("預けただけでは開かず、閉じ終えた（flush）ときに1回だけ開く", () => {
    const open = vi.fn();
    const pending = createPendingShare(open, 1000);

    pending.hold("招待の本文");
    expect(open).not.toHaveBeenCalled();

    pending.flush();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("招待の本文");

    // 予備のタイマーも、2回目の flush も開き直さない（本文を持たない）。
    vi.advanceTimersByTime(1000);
    pending.flush();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("閉じ終えた知らせが来なければ、予備の時間が経ったときに開く", () => {
    const open = vi.fn();
    const pending = createPendingShare(open, 1000);

    pending.hold("招待の本文");
    vi.advanceTimersByTime(999);
    expect(open).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("招待の本文");

    // 後から来た onDismiss では開き直さない。
    pending.flush();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("預けていなければ、閉じ終えても開かない（キャンセルで閉じたとき）", () => {
    const open = vi.fn();
    const pending = createPendingShare(open, 1000);

    pending.flush();
    vi.advanceTimersByTime(1000);
    expect(open).not.toHaveBeenCalled();
  });

  it("捨てたら、閉じ終えても予備の時間が経っても開かない", () => {
    const open = vi.fn();
    const pending = createPendingShare(open, 1000);

    pending.hold("招待の本文");
    pending.discard();
    pending.flush();
    vi.advanceTimersByTime(1000);
    expect(open).not.toHaveBeenCalled();
  });

  it("預け直したら、新しい本文だけを開く", () => {
    const open = vi.fn();
    const pending = createPendingShare(open, 1000);

    pending.hold("古い本文");
    vi.advanceTimersByTime(500);
    pending.hold("新しい本文");
    vi.advanceTimersByTime(999);
    expect(open).not.toHaveBeenCalled();

    pending.flush();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("新しい本文");
  });
});
