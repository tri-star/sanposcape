import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ConfigContext } from "expo/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import appConfig from "../../app.config";

// 位置情報プラグインの契約テスト（SS-156 / SS-157 / ADR-M-018）。
// ネイティブ設定は E2E でも単体テストでも動かないので、「常に」権限を誤って宣言する・
// background mode を落とす、といった事故をここで防ぐ。
// 利用目的文言（Info.plist）については、文言の欠落・既定文言への逆戻り・`false` によるキー削除を防ぐ。
type LocationPluginOptions = Record<string, unknown>;
type ExpoConfig = ConfigContext["config"];

const appJson = JSON.parse(readFileSync(path.resolve(__dirname, "../../app.json"), "utf8")) as {
  expo: ExpoConfig;
};

const LOCATION_PERMISSION_KEYS = [
  "locationWhenInUsePermission",
  "locationAlwaysAndWhenInUsePermission",
  "locationAlwaysPermission",
] as const;
const PURPOSE_STRING_KEYS = [...LOCATION_PERMISSION_KEYS, "motionUsagePermission"] as const;
// 背景取得の説明（ガイドライン 2.5.4 / 5.1.5）として使用中の文言に必要な断片。文言を変えたらここも直す。
const BACKGROUND_DISCLOSURE_FRAGMENTS = [
  "散歩の記録中",
  "画面のロック中",
  "散歩を終了すると",
] as const;
// 日本語（ひらがな・カタカナ・漢字）を含むか。
const JAPANESE_PATTERN = /[぀-ヿ一-鿿]/;
const PURPOSE_INFO_PLIST_KEYS = [
  "NSLocationWhenInUseUsageDescription",
  "NSLocationAlwaysAndWhenInUseUsageDescription",
  "NSLocationAlwaysUsageDescription",
  "NSMotionUsageDescription",
] as const;

function findLocationOptions(config: ExpoConfig): LocationPluginOptions {
  const entry = (config.plugins ?? []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-location",
  );
  if (!Array.isArray(entry)) throw new Error("expo-location プラグインがオプション付きで無い");
  return entry[1] as LocationPluginOptions;
}

function evaluateAppConfig(): ExpoConfig {
  return appConfig({
    config: appJson.expo,
    projectRoot: "",
    staticConfigPath: null,
    packageJsonPath: null,
  } as unknown as ConfigContext) as ExpoConfig;
}

describe("expo-location プラグインの設定", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function expectBackgroundContract(options: LocationPluginOptions) {
    // iOS: UIBackgroundModes に location が入る
    expect(options.isIosBackgroundLocationEnabled).toBe(true);
    // Android: フォアグラウンドサービス（FGS_LOCATION）が入る
    expect(options.isAndroidForegroundServiceEnabled).toBe(true);
    // 「常に許可」（ACCESS_BACKGROUND_LOCATION）は宣言しない
    expect(options.isAndroidBackgroundLocationEnabled).not.toBe(true);
  }

  it("app.json: iOS の background mode と Android の FGS が有効", () => {
    const options = findLocationOptions(appJson.expo);
    expect(options.isIosBackgroundLocationEnabled).toBe(true);
    expect(options.isAndroidForegroundServiceEnabled).toBe(true);
  });

  it("app.json: ACCESS_BACKGROUND_LOCATION を宣言しない", () => {
    expect(findLocationOptions(appJson.expo).isAndroidBackgroundLocationEnabled).not.toBe(true);
  });

  it.each(PURPOSE_STRING_KEYS)("app.json: %s は日本語の具体的な文言で、既定文言ではない", (key) => {
    // 未指定だとプラグインの英語の既定文言（Allow $(PRODUCT_NAME) to ...）になる。曖昧な文言は App Review 5.1.1 のリジェクト対象。
    // false でキーごと消すと ITMS-90683 のおそれがある（ADR-M-018 SS-157 追補）。
    const value = findLocationOptions(appJson.expo)[key];
    expect(typeof value).toBe("string");
    expect(value as string).toMatch(JAPANESE_PATTERN);
    expect(value).not.toContain("$(PRODUCT_NAME)");
  });

  it("app.json: 使用中の文言にバックグラウンドでの取得と止まる条件が書かれている", () => {
    // SS-156 で背景記録を入れた。背景での取得の説明（ガイドライン 2.5.4 / 5.1.5）を落とさない。
    const value = findLocationOptions(appJson.expo).locationWhenInUsePermission as string;
    for (const fragment of BACKGROUND_DISCLOSURE_FRAGMENTS) {
      expect(value).toContain(fragment);
    }
  });

  it("app.json: 「常に」系の文言は削除せず、使用中と同じ文言にする", () => {
    // undefined だと英語の既定文言が入る。false だとキーが消え、ITMS-90683 で提出が止まるおそれがある
    // （ADR-M-018 SS-157 追補）。「常に」を求めないことは requestBackgroundPermissionsAsync を呼ばないことで担保する（決定2）。
    const options = findLocationOptions(appJson.expo);
    expect(options.locationAlwaysAndWhenInUsePermission).toBe(options.locationWhenInUsePermission);
    expect(options.locationAlwaysPermission).toBe(options.locationWhenInUsePermission);
  });

  it.each(PURPOSE_STRING_KEYS)('app.json: %s に " と \\ を含めない', (key) => {
    // 将来 locales で InfoPlist.strings を書き出すとき、Expo はエスケープせずに書く。
    const value = findLocationOptions(appJson.expo)[key];
    expect(typeof value).toBe("string");
    expect(value).not.toContain('"');
    expect(value).not.toContain("\\");
  });

  it("app.json: ios.infoPlist に位置情報・モーションの利用目的を直書きしない", () => {
    // 置き場をプラグインのオプションに一本化する（直書きは「オプション未指定のときだけ効く」ので二重管理になる）。
    const infoPlist = (appJson.expo.ios?.infoPlist ?? {}) as Record<string, unknown>;
    for (const key of PURPOSE_INFO_PLIST_KEYS) {
      expect(infoPlist).not.toHaveProperty(key);
    }
  });

  it("app.json: androidForegroundServiceIcon のファイルが存在する", () => {
    const icon = findLocationOptions(appJson.expo).androidForegroundServiceIcon;
    expect(typeof icon).toBe("string");
    expect(existsSync(path.resolve(__dirname, "../..", icon as string))).toBe(true);
  });

  it("APP_VARIANT=production で app.config を評価しても同じ契約を保つ", () => {
    vi.stubEnv("APP_VARIANT", "production");
    const options = findLocationOptions(evaluateAppConfig());
    expectBackgroundContract(options);
    expect(options).toEqual(findLocationOptions(appJson.expo));
  });
});
