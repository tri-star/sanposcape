import { describe, expect, it } from "vitest";

import {
  WALK_DELETE_CANCEL_LABEL,
  WALK_DELETE_CLOSE_LABEL,
  WALK_DELETE_DIALOG_DESCRIPTION,
  WALK_DELETE_DIALOG_TITLE,
  WALK_DELETE_DONE_TITLE,
  walkDeleteConfirmLabel,
} from "@/features/history/lib/walkDeleteCopy";

describe("WALK_DELETE_DIALOG_DESCRIPTION", () => {
  it("取り消し不能であることを伝える文言を含む（受け入れ条件2）", () => {
    expect(WALK_DELETE_DIALOG_DESCRIPTION).toContain("元に戻せません");
  });
});

describe("walkDeleteConfirmLabel", () => {
  it("削除中とそうでないときでラベルが異なる", () => {
    expect(walkDeleteConfirmLabel(true)).not.toBe(walkDeleteConfirmLabel(false));
  });

  it("いずれも非空文字列を返す", () => {
    expect(walkDeleteConfirmLabel(true).length).toBeGreaterThan(0);
    expect(walkDeleteConfirmLabel(false).length).toBeGreaterThan(0);
  });
});

describe("定数の非空チェック", () => {
  it.each([
    ["WALK_DELETE_DIALOG_TITLE", WALK_DELETE_DIALOG_TITLE],
    ["WALK_DELETE_DIALOG_DESCRIPTION", WALK_DELETE_DIALOG_DESCRIPTION],
    ["WALK_DELETE_CANCEL_LABEL", WALK_DELETE_CANCEL_LABEL],
    ["WALK_DELETE_CLOSE_LABEL", WALK_DELETE_CLOSE_LABEL],
    ["WALK_DELETE_DONE_TITLE", WALK_DELETE_DONE_TITLE],
  ])("%s は非空文字列", (_name, value) => {
    expect(value.length).toBeGreaterThan(0);
  });

  it("キャンセルと閉じるは別の文言（削除できない状態では『閉じる』に切り替えるため）", () => {
    expect(WALK_DELETE_CANCEL_LABEL).not.toBe(WALK_DELETE_CLOSE_LABEL);
  });
});
