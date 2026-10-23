import { describe, expect, it } from "vitest";

import {
  APP_VERSION_UNKNOWN,
  type AppVersionInfo,
  formatAppVersion,
} from "@/features/settings/lib/appVersionLabel";

const EMPTY: AppVersionInfo = {
  version: null,
  buildNumber: null,
  channel: null,
  otaUpdateId: null,
};
const UPDATE_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("formatAppVersion", () => {
  it("バージョンをそのまま出す（接頭辞を付けない）", () => {
    expect(formatAppVersion({ ...EMPTY, version: "1.0.0" })).toBe("1.0.0");
  });

  it("null は「不明」", () => {
    expect(formatAppVersion(EMPTY)).toBe(APP_VERSION_UNKNOWN);
  });

  it("空・空白だけは「不明」、前後の空白は落とす", () => {
    expect(formatAppVersion({ ...EMPTY, version: "" })).toBe(APP_VERSION_UNKNOWN);
    expect(formatAppVersion({ ...EMPTY, version: "  " })).toBe(APP_VERSION_UNKNOWN);
    expect(formatAppVersion({ ...EMPTY, version: " 1.2.3 " })).toBe("1.2.3");
  });

  it("本番のストアのバイナリはビルド番号だけを付ける", () => {
    expect(
      formatAppVersion({ ...EMPTY, version: "1.0.0", buildNumber: "57", channel: "production" }),
    ).toBe("1.0.0 (57)");
  });

  it("OTA で起動しているときは update ID の先頭8文字を付ける", () => {
    expect(
      formatAppVersion({
        version: "1.0.0",
        buildNumber: "57",
        channel: "production",
        otaUpdateId: UPDATE_ID,
      }),
    ).toBe("1.0.0 (57) · OTA a1b2c3d4");
  });

  it("本番以外のチャネルは名前を付ける", () => {
    expect(
      formatAppVersion({ ...EMPTY, version: "1.0.0", buildNumber: "57", channel: "staging" }),
    ).toBe("1.0.0 (57) · staging");
  });

  it("チャネルと OTA の両方を付けるときはチャネルが先", () => {
    expect(
      formatAppVersion({
        version: "1.0.0",
        buildNumber: "57",
        channel: "staging",
        otaUpdateId: UPDATE_ID,
      }),
    ).toBe("1.0.0 (57) · staging · OTA a1b2c3d4");
  });

  it("バージョンが読めなくても付記は出す", () => {
    expect(formatAppVersion({ ...EMPTY, buildNumber: "57", channel: "staging" })).toBe(
      `${APP_VERSION_UNKNOWN} (57) · staging`,
    );
  });

  it("空・空白だけの付記は出さない", () => {
    expect(
      formatAppVersion({ version: "1.0.0", buildNumber: " ", channel: "", otaUpdateId: "  " }),
    ).toBe("1.0.0");
  });
});
