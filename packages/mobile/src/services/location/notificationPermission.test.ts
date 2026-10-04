import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createNotificationPermissionRequester,
  type NotificationPermissionDeps,
  type NotificationPermissionResult,
} from "@/services/location/notificationPermission";

const check = vi.fn<() => Promise<boolean>>();
const request = vi.fn<() => Promise<NotificationPermissionResult>>();

function create(overrides: Partial<NotificationPermissionDeps> = {}) {
  return createNotificationPermissionRequester({
    os: "android",
    version: 34,
    check,
    request,
    ...overrides,
  });
}

beforeEach(() => {
  check.mockReset().mockResolvedValue(false);
  request.mockReset().mockResolvedValue("granted");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("createNotificationPermissionRequester", () => {
  it("Android 13 以上で未許可なら、OS のダイアログを出す", async () => {
    await create()();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("API 33 ちょうどでも求める", async () => {
    await create({ version: 33 })();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("すでに許可されていればダイアログを出さない", async () => {
    check.mockResolvedValue(true);
    await create()();
    expect(request).not.toHaveBeenCalled();
  });

  it("Android 12 以下では何もしない（実行時権限ではない）", async () => {
    await create({ version: 32 })();
    expect(check).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("iOS では何もしない", async () => {
    await create({ os: "ios", version: "17.0" })();
    expect(check).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("バージョンが数値にならなければ何もしない", async () => {
    await create({ version: "unknown" })();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["denied", "never_ask_again"] as const)(
    "%s でも throw せず完了し、診断ログを残す",
    async (result) => {
      request.mockResolvedValue(result);
      await expect(create()()).resolves.toBeUndefined();
      expect(console.warn).toHaveBeenCalledWith(
        "[sanposcape] walk_notification_permission_not_granted",
        { result },
      );
    },
  );

  it("要求が例外を投げても throw しない（記録を止めない）", async () => {
    request.mockRejectedValue(new Error("no activity"));
    await expect(create()()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      "[sanposcape] walk_notification_permission_request_failed",
      { errorName: "Error", errorMessage: "no activity" },
    );
  });

  it("拒否された後に何度呼んでも、ダイアログは再び出ない", async () => {
    request.mockResolvedValue("denied");
    const requestPermission = create();
    await requestPermission();
    await requestPermission();
    await requestPermission();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("ダイアログの表示中に再度呼ばれても、二重に出さない", async () => {
    let answer!: (value: NotificationPermissionResult) => void;
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const requestPermission = create();
    const first = requestPermission();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await requestPermission();
    answer("granted");
    await first;
    expect(request).toHaveBeenCalledTimes(1);
  });
});
