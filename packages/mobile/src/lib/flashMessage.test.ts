import { beforeEach, describe, expect, it } from "vitest";

import { consumeFlashMessage, resetFlashMessageForTest, setFlashMessage } from "@/lib/flashMessage";

describe("flashMessage", () => {
  beforeEach(() => {
    resetFlashMessageForTest();
  });

  it("set した文言を1回だけ consume できる", () => {
    setFlashMessage("ピンを保存しました");

    expect(consumeFlashMessage()).toBe("ピンを保存しました");
    expect(consumeFlashMessage()).toBeNull();
  });

  it("何も set していなければ null", () => {
    expect(consumeFlashMessage()).toBeNull();
  });

  it("複数回 set すると後勝ち", () => {
    setFlashMessage("最初");
    setFlashMessage("あと");

    expect(consumeFlashMessage()).toBe("あと");
  });

  it("空文字は無視される（直前の値を保持する）", () => {
    setFlashMessage("保持される");
    setFlashMessage("");

    expect(consumeFlashMessage()).toBe("保持される");
  });
});
