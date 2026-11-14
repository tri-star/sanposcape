import { describe, expect, it } from "vitest";

import type { SettingsDialogBackInput } from "@/features/settings/lib/settingsDialogBack";
import { resolveSettingsDialogBack } from "@/features/settings/lib/settingsDialogBack";

const closed: SettingsDialogBackInput = {
  logoutDialogOpen: false,
  isSigningOut: false,
  accountDeleteDialogOpen: false,
  accountDeleteBusy: false,
};

describe("resolveSettingsDialogBack", () => {
  it("ダイアログが開いていなければ none（画面ごと戻る）", () => {
    expect(resolveSettingsDialogBack(closed)).toBe("none");
  });

  it("ログアウトのダイアログが開いていれば、そのダイアログだけを閉じる", () => {
    expect(resolveSettingsDialogBack({ ...closed, logoutDialogOpen: true })).toBe("close-logout");
  });

  it("ログアウト中は閉じず、戻る操作だけを消費する", () => {
    expect(
      resolveSettingsDialogBack({ ...closed, logoutDialogOpen: true, isSigningOut: true }),
    ).toBe("consume");
  });

  it("アカウント削除のダイアログが開いていれば、そのダイアログだけを閉じる", () => {
    expect(resolveSettingsDialogBack({ ...closed, accountDeleteDialogOpen: true })).toBe(
      "close-account-delete",
    );
  });

  it("削除中（deleting / deleted）は閉じず、戻る操作だけを消費する", () => {
    expect(
      resolveSettingsDialogBack({
        ...closed,
        accountDeleteDialogOpen: true,
        accountDeleteBusy: true,
      }),
    ).toBe("consume");
  });

  it("ダイアログが閉じていれば、ログアウト中・削除中の値が残っていても none", () => {
    expect(
      resolveSettingsDialogBack({ ...closed, isSigningOut: true, accountDeleteBusy: true }),
    ).toBe("none");
  });
});
