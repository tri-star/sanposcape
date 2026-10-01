import { describe, expect, it, vi } from "vitest";

import {
  createAppPreferencesService,
  DEFAULT_APP_PREFERENCES,
  parseAppPreferences,
  serializeAppPreferences,
} from "@/services/preferences/appPreferences";
import { createMemoryPreferenceStorage } from "@/services/preferences/preferenceStorage.memory";
import type { PreferenceStorage } from "@/services/preferences/types";

const FIXED_NOW = new Date("2026-10-01T12:34:56.000Z");

describe("parseAppPreferences", () => {
  it.each([null, ""])("%j は既定値", (raw) => {
    expect(parseAppPreferences(raw)).toEqual(DEFAULT_APP_PREFERENCES);
  });

  it("不正な JSON は既定値", () => {
    expect(parseAppPreferences("{")).toEqual(DEFAULT_APP_PREFERENCES);
  });

  it.each(["[]", "1", "null"])("オブジェクト以外 (%s) は既定値", (raw) => {
    expect(parseAppPreferences(raw)).toEqual(DEFAULT_APP_PREFERENCES);
  });

  it("themeMode 欠落は system / updatedAt null", () => {
    expect(parseAppPreferences('{"version":1}')).toEqual({
      themeMode: "system",
      themeModeUpdatedAt: null,
    });
  });

  it("未知の themeMode は system にし、時刻も信用しない", () => {
    const raw = '{"version":1,"themeMode":"sepia","themeModeUpdatedAt":"2026-10-01T00:00:00.000Z"}';
    expect(parseAppPreferences(raw)).toEqual({ themeMode: "system", themeModeUpdatedAt: null });
  });

  it("正常な保存値はそのまま読む", () => {
    const raw = '{"version":1,"themeMode":"dark","themeModeUpdatedAt":"2026-10-01T00:00:00.000Z"}';
    expect(parseAppPreferences(raw)).toEqual({
      themeMode: "dark",
      themeModeUpdatedAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("未知の version でも知っているキーだけ読む（未知キーは無視）", () => {
    const raw =
      '{"version":99,"themeMode":"light","themeModeUpdatedAt":"2026-10-01T00:00:00.000Z","future":true}';
    expect(parseAppPreferences(raw)).toEqual({
      themeMode: "light",
      themeModeUpdatedAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("themeModeUpdatedAt が文字列以外なら null", () => {
    expect(parseAppPreferences('{"themeMode":"dark","themeModeUpdatedAt":123}')).toEqual({
      themeMode: "dark",
      themeModeUpdatedAt: null,
    });
  });

  it("serialize → parse で往復でき、version: 1 が含まれる", () => {
    const prefs = { themeMode: "dark" as const, themeModeUpdatedAt: "2026-10-01T00:00:00.000Z" };
    const raw = serializeAppPreferences(prefs);
    expect(JSON.parse(raw).version).toBe(1);
    expect(parseAppPreferences(raw)).toEqual(prefs);
  });
});

describe("createAppPreferencesService", () => {
  it("未保存なら loadThemeMode は system", () => {
    const service = createAppPreferencesService(createMemoryPreferenceStorage());
    expect(service.loadThemeMode()).toBe("system");
  });

  it("saveThemeMode → loadThemeMode で値が戻り、時刻は注入した now になる", () => {
    const storage = createMemoryPreferenceStorage();
    const service = createAppPreferencesService(storage, { now: () => FIXED_NOW });
    service.saveThemeMode("dark");
    expect(service.loadThemeMode()).toBe("dark");
    expect(JSON.parse(storage.peek() ?? "").themeModeUpdatedAt).toBe("2026-10-01T12:34:56.000Z");
  });

  it("未知キーを持つ保存値は、保存後も未知キーが残り、既知キーと version が更新される", () => {
    const storage = createMemoryPreferenceStorage('{"version":99,"themeMode":"light","future":1}');
    const service = createAppPreferencesService(storage, { now: () => FIXED_NOW });
    service.saveThemeMode("dark");
    expect(JSON.parse(storage.peek() ?? "")).toEqual({
      version: 1,
      themeMode: "dark",
      themeModeUpdatedAt: "2026-10-01T12:34:56.000Z",
      future: 1,
    });
  });

  it.each(["{", "[]", "null", "1"])(
    "壊れた保存値 (%s) は既知フィールドのみで書き直される",
    (raw) => {
      const storage = createMemoryPreferenceStorage(raw);
      const service = createAppPreferencesService(storage, { now: () => FIXED_NOW });
      service.saveThemeMode("dark");
      expect(JSON.parse(storage.peek() ?? "")).toEqual({
        version: 1,
        themeMode: "dark",
        themeModeUpdatedAt: "2026-10-01T12:34:56.000Z",
      });
    },
  );

  it("read が throw しても loadThemeMode は system を返し onError を1回呼ぶ", () => {
    const error = new Error("read boom");
    const storage: PreferenceStorage = {
      read: () => {
        throw error;
      },
      write: () => {},
    };
    const onError = vi.fn();
    const service = createAppPreferencesService(storage, { onError });
    expect(service.loadThemeMode()).toBe("system");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("preferences_read_failed", error);
  });

  it("write が throw しても saveThemeMode は throw せず onError を呼ぶ", () => {
    const error = new Error("write boom");
    const storage: PreferenceStorage = {
      read: () => null,
      write: () => {
        throw error;
      },
    };
    const onError = vi.fn();
    const service = createAppPreferencesService(storage, { onError });
    expect(() => service.saveThemeMode("dark")).not.toThrow();
    expect(onError).toHaveBeenCalledWith("preferences_write_failed", error);
  });

  it("save 時に read が throw しても既定値を土台に書き込みは行われる", () => {
    const written: string[] = [];
    const storage: PreferenceStorage = {
      read: () => {
        throw new Error("read boom");
      },
      write: (raw) => {
        written.push(raw);
      },
    };
    const onError = vi.fn();
    const service = createAppPreferencesService(storage, { now: () => FIXED_NOW, onError });
    service.saveThemeMode("light");
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0] ?? "")).toEqual({
      version: 1,
      themeMode: "light",
      themeModeUpdatedAt: "2026-10-01T12:34:56.000Z",
    });
    expect(onError).toHaveBeenCalledWith("preferences_read_failed", expect.any(Error));
  });

  it("メソッドを取り出して呼んでも動く（this に依存しない）", () => {
    const service = createAppPreferencesService(createMemoryPreferenceStorage(), {
      now: () => FIXED_NOW,
    });
    const { saveThemeMode, loadThemeMode } = service;
    saveThemeMode("dark");
    expect(loadThemeMode()).toBe("dark");
  });
});
