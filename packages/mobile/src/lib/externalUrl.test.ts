import { describe, expect, it, vi } from "vitest";

import {
  externalUrlOpenFailedMessage,
  isOpenableExternalUrl,
  openExternalUrl,
} from "@/lib/externalUrl";

const URL_OK = "https://sanposcape.com/privacy/";

function makeOpeners(overrides?: {
  inApp?: () => Promise<string>;
  system?: () => Promise<unknown>;
}) {
  const openInAppBrowser = vi.fn(overrides?.inApp ?? (async () => "opened"));
  const openWithSystem = vi.fn(overrides?.system ?? (async () => true));
  return { openInAppBrowser, openWithSystem };
}

describe("isOpenableExternalUrl", () => {
  it("https の URL は true", () => {
    expect(isOpenableExternalUrl(URL_OK)).toBe(true);
  });

  it.each([
    "http://sanposcape.com/privacy/",
    "javascript:alert(1)",
    "file:///etc/hosts",
    "sanposcape.com/privacy/",
    "",
    "https://",
    "not a url",
  ])("%j は false", (url) => {
    expect(isOpenableExternalUrl(url)).toBe(false);
  });
});

describe("openExternalUrl", () => {
  it("不正な URL は invalid_url で、どちらの opener も呼ばない", async () => {
    const openers = makeOpeners();
    const result = await openExternalUrl("javascript:alert(1)", openers);
    expect(result).toEqual({ kind: "failed", reason: "invalid_url" });
    expect(openers.openInAppBrowser).not.toHaveBeenCalled();
    expect(openers.openWithSystem).not.toHaveBeenCalled();
  });

  it("アプリ内ブラウザが opened を返したら in-app で開けた扱い", async () => {
    const openers = makeOpeners();
    const result = await openExternalUrl(URL_OK, openers);
    expect(result).toEqual({ kind: "opened", via: "in-app" });
    expect(openers.openInAppBrowser).toHaveBeenCalledWith(URL_OK);
    expect(openers.openWithSystem).not.toHaveBeenCalled();
  });

  it.each(["cancel", "dismiss", "something-new"])(
    "アプリ内ブラウザが %s を返しても in-app で開けた扱い",
    async (type) => {
      const openers = makeOpeners({ inApp: async () => type });
      const result = await openExternalUrl(URL_OK, openers);
      expect(result).toEqual({ kind: "opened", via: "in-app" });
      expect(openers.openWithSystem).not.toHaveBeenCalled();
    },
  );

  it("locked は busy で、OS ブラウザへフォールバックしない", async () => {
    const openers = makeOpeners({ inApp: async () => "locked" });
    const result = await openExternalUrl(URL_OK, openers);
    expect(result).toEqual({ kind: "busy" });
    expect(openers.openWithSystem).not.toHaveBeenCalled();
  });

  it("アプリ内ブラウザが reject したら OS ブラウザで開く", async () => {
    const inAppError = new Error("no custom tabs");
    const openers = makeOpeners({ inApp: () => Promise.reject(inAppError) });
    const result = await openExternalUrl(URL_OK, openers);
    expect(result).toEqual({ kind: "opened", via: "system", inAppError });
    expect(openers.openWithSystem).toHaveBeenCalledTimes(1);
    expect(openers.openWithSystem).toHaveBeenCalledWith(URL_OK);
  });

  it("アプリ内ブラウザが同期 throw しても OS ブラウザで開く", async () => {
    const inAppError = new Error("sync throw");
    const openers = makeOpeners({
      inApp: () => {
        throw inAppError;
      },
    });
    const result = await openExternalUrl(URL_OK, openers);
    expect(result).toEqual({ kind: "opened", via: "system", inAppError });
    expect(openers.openWithSystem).toHaveBeenCalledWith(URL_OK);
  });

  it("両方失敗したら open_error で、それぞれのエラーを返す", async () => {
    const inAppError = new Error("in-app");
    const systemError = new Error("system");
    const openers = makeOpeners({
      inApp: () => Promise.reject(inAppError),
      system: () => Promise.reject(systemError),
    });
    const result = await openExternalUrl(URL_OK, openers);
    expect(result).toEqual({ kind: "failed", reason: "open_error", inAppError, systemError });
  });
});

describe("externalUrlOpenFailedMessage", () => {
  it("URL を含む空でない文言を返す", () => {
    const message = externalUrlOpenFailedMessage(URL_OK);
    expect(message).not.toBe("");
    expect(message).toContain(URL_OK);
  });
});
