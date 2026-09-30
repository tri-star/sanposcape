import { readFileSync } from "node:fs";
import path from "node:path";

import type { ConfigContext } from "expo/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import appConfig from "../../app.config";
import {
  PRODUCTION_UPDATES_CHANNEL,
  isDevToolsAllowed,
  parseAppVariant,
  type AppVariant,
} from "./appVariant";

describe("parseAppVariant", () => {
  it.each([
    ["production", "production"],
    ["development", "development"],
    ["Production", null],
    [" production ", null],
    ["prod", null],
    ["", null],
    [undefined, null],
    [null, null],
    [1, null],
    [{}, null],
  ])("%j -> %j", (raw, expected) => {
    expect(parseAppVariant(raw)).toBe(expected);
  });
});

describe("isDevToolsAllowed", () => {
  it.each<{
    isDev: boolean;
    appVariant: AppVariant | null;
    updatesChannel: string | null;
    expected: boolean;
    intent: string;
  }>([
    {
      isDev: true,
      appVariant: null,
      updatesChannel: null,
      expected: true,
      intent: "Metro 開発バンドル",
    },
    {
      isDev: true,
      appVariant: "production",
      updatesChannel: "production",
      expected: true,
      intent: "開発バンドルが最優先",
    },
    {
      isDev: false,
      appVariant: "development",
      updatesChannel: null,
      expected: true,
      intent: "channel の無い release ビルド",
    },
    {
      isDev: false,
      appVariant: "development",
      updatesChannel: "preview",
      expected: true,
      intent: "E2E",
    },
    {
      isDev: false,
      appVariant: "development",
      updatesChannel: "staging",
      expected: true,
      intent: "TestFlight / staging-apk / staging-ios",
    },
    {
      isDev: false,
      appVariant: "production",
      updatesChannel: "production",
      expected: false,
      intent: "本番",
    },
    {
      isDev: false,
      appVariant: "production",
      updatesChannel: null,
      expected: false,
      intent: "本番で channel が取れない",
    },
    {
      isDev: false,
      appVariant: "development",
      updatesChannel: "production",
      expected: false,
      intent: "本番端末に APP_VARIANT 無しの OTA が載った",
    },
    {
      isDev: false,
      appVariant: null,
      updatesChannel: "staging",
      expected: false,
      intent: "extra 欠落は fail-closed",
    },
    {
      isDev: false,
      appVariant: null,
      updatesChannel: null,
      expected: false,
      intent: "extra 欠落は fail-closed",
    },
  ])(
    "isDev=$isDev appVariant=$appVariant channel=$updatesChannel -> $expected ($intent)",
    ({ isDev, appVariant, updatesChannel, expected }) => {
      expect(isDevToolsAllowed({ isDev, appVariant, updatesChannel })).toBe(expected);
    },
  );
});

type EasProfile = { channel?: string; env?: Record<string, string> };

describe("ビルド設定との契約", () => {
  const easJson = JSON.parse(readFileSync(path.resolve(__dirname, "../../eas.json"), "utf8")) as {
    build: Record<string, EasProfile>;
  };
  const others = Object.entries(easJson.build).filter(([name]) => name !== "production");

  describe("eas.json", () => {
    it("production は APP_VARIANT=production を持つ", () => {
      expect(easJson.build.production?.env?.APP_VARIANT).toBe("production");
    });

    it("production の channel が PRODUCTION_UPDATES_CHANNEL と一致する", () => {
      expect(easJson.build.production?.channel).toBe(PRODUCTION_UPDATES_CHANNEL);
    });

    it("production 以外で channel を明示するプロファイルは production チャネルと一致しない", () => {
      for (const [name, profile] of others) {
        if (profile.channel !== undefined) {
          expect(profile.channel, name).not.toBe(PRODUCTION_UPDATES_CHANNEL);
        }
      }
    });

    it("production 以外のプロファイルは APP_VARIANT を持たない", () => {
      for (const [name, profile] of others) {
        expect(profile.env?.APP_VARIANT, name).toBeUndefined();
      }
    });
  });

  describe("app.config.ts の extra.appVariant", () => {
    const appJson = JSON.parse(readFileSync(path.resolve(__dirname, "../../app.json"), "utf8")) as {
      expo: ConfigContext["config"];
    };
    const evaluate = () =>
      appConfig({
        config: appJson.expo,
        projectRoot: "",
        staticConfigPath: null,
        packageJsonPath: null,
      } as unknown as ConfigContext);

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("APP_VARIANT 未設定なら development で、extra.eas / extra.router が残る", () => {
      vi.stubEnv("APP_VARIANT", "");
      const result = evaluate();
      expect(result.extra?.appVariant).toBe("development");
      expect(parseAppVariant(result.extra?.appVariant)).not.toBeNull();
      expect(result.extra?.eas?.projectId).toBe(appJson.expo.extra?.eas?.projectId);
      expect(result.extra?.router).toEqual(appJson.expo.extra?.router);
    });

    it("APP_VARIANT=production なら production で、本番の scheme になる", () => {
      vi.stubEnv("APP_VARIANT", "production");
      const result = evaluate();
      expect(result.extra?.appVariant).toBe("production");
      expect(parseAppVariant(result.extra?.appVariant)).not.toBeNull();
      expect(result.scheme).toBe("sanposcape");
      expect(result.extra?.eas?.projectId).toBe(appJson.expo.extra?.eas?.projectId);
    });

    it("未知の APP_VARIANT は例外", () => {
      vi.stubEnv("APP_VARIANT", "prod");
      expect(evaluate).toThrow(/Unknown APP_VARIANT/);
    });
  });
});
