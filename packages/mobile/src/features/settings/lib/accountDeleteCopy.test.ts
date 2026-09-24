import { describe, expect, it } from "vitest";

import {
  ACCOUNT_DELETE_BUTTON_LABEL,
  ACCOUNT_DELETE_CANCEL_LABEL,
  ACCOUNT_DELETE_CLOSE_LABEL,
  ACCOUNT_DELETE_DIALOG_DESCRIPTION,
  ACCOUNT_DELETE_DIALOG_TITLE,
  ACCOUNT_DELETE_SECTION_DESCRIPTION,
  ACCOUNT_DELETE_SECTION_TITLE,
  accountDeleteConfirmLabel,
} from "@/features/settings/lib/accountDeleteCopy";

describe("ACCOUNT_DELETE_DIALOG_DESCRIPTION", () => {
  it("取り消し不能であることを伝える文言を含む", () => {
    expect(ACCOUNT_DELETE_DIALOG_DESCRIPTION).toContain("元に戻せません");
  });

  it("再サインインしても以前の記録は復元できないことを伝える", () => {
    expect(ACCOUNT_DELETE_DIALOG_DESCRIPTION).toContain("復元できません");
  });
});

describe("ACCOUNT_DELETE_SECTION_DESCRIPTION", () => {
  it("取り消し不能であることを伝える文言を含む", () => {
    expect(ACCOUNT_DELETE_SECTION_DESCRIPTION).toContain("元に戻せません");
  });
});

describe("accountDeleteConfirmLabel", () => {
  it("削除中とそうでないときでラベルが異なる", () => {
    expect(accountDeleteConfirmLabel(true)).not.toBe(accountDeleteConfirmLabel(false));
  });

  it("いずれも非空文字列を返す", () => {
    expect(accountDeleteConfirmLabel(true).length).toBeGreaterThan(0);
    expect(accountDeleteConfirmLabel(false).length).toBeGreaterThan(0);
  });
});

describe("定数の非空チェック", () => {
  it.each([
    ["ACCOUNT_DELETE_SECTION_TITLE", ACCOUNT_DELETE_SECTION_TITLE],
    ["ACCOUNT_DELETE_SECTION_DESCRIPTION", ACCOUNT_DELETE_SECTION_DESCRIPTION],
    ["ACCOUNT_DELETE_BUTTON_LABEL", ACCOUNT_DELETE_BUTTON_LABEL],
    ["ACCOUNT_DELETE_DIALOG_TITLE", ACCOUNT_DELETE_DIALOG_TITLE],
    ["ACCOUNT_DELETE_DIALOG_DESCRIPTION", ACCOUNT_DELETE_DIALOG_DESCRIPTION],
    ["ACCOUNT_DELETE_CANCEL_LABEL", ACCOUNT_DELETE_CANCEL_LABEL],
    ["ACCOUNT_DELETE_CLOSE_LABEL", ACCOUNT_DELETE_CLOSE_LABEL],
  ])("%s は非空文字列", (_name, value) => {
    expect(value.length).toBeGreaterThan(0);
  });

  it("キャンセルと閉じるは別の文言", () => {
    expect(ACCOUNT_DELETE_CANCEL_LABEL).not.toBe(ACCOUNT_DELETE_CLOSE_LABEL);
  });
});

describe("誤操作防止（ログアウトとの文言差）", () => {
  it("ACCOUNT_DELETE_BUTTON_LABEL は「ログアウト」と一致しない", () => {
    expect(ACCOUNT_DELETE_BUTTON_LABEL).not.toBe("ログアウト");
  });

  it("ACCOUNT_DELETE_BUTTON_LABEL は「ログアウト」を含まない", () => {
    expect(ACCOUNT_DELETE_BUTTON_LABEL).not.toContain("ログアウト");
  });
});
