import { describe, expect, it } from "vitest";

import { APP_CONFIG_QUERY_KEY, isAppConfigQueryKey } from "@/api/appConfigQueryKey";

describe("APP_CONFIG_QUERY_KEY", () => {
  it("['app-config'] である", () => {
    expect(APP_CONFIG_QUERY_KEY).toEqual(["app-config"]);
  });
});

describe("isAppConfigQueryKey", () => {
  it("['app-config'] は true", () => {
    expect(isAppConfigQueryKey(["app-config"])).toBe(true);
  });

  it("['app-config','x'] のような前方一致も true", () => {
    expect(isAppConfigQueryKey(["app-config", "x"])).toBe(true);
  });

  it("['walks'] は false", () => {
    expect(isAppConfigQueryKey(["walks"])).toBe(false);
  });

  it("[] は false", () => {
    expect(isAppConfigQueryKey([])).toBe(false);
  });

  it("['appconfig']（ハイフン無し）は false", () => {
    expect(isAppConfigQueryKey(["appconfig"])).toBe(false);
  });
});
