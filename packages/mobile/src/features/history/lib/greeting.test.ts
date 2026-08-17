import { describe, expect, it } from "vitest";

import { buildHistoryGreeting } from "@/features/history/lib/greeting";

describe("buildHistoryGreeting", () => {
  it("通常の表示名には敬称を付ける", () => {
    expect(buildHistoryGreeting("田中 太郎")).toBe("田中 太郎さん、今日も歩きましょう");
  });

  it("既に敬称付きの表示名は二重敬称にしない", () => {
    expect(buildHistoryGreeting("田中さん")).toBe("田中さん、今日も歩きましょう");
  });

  it("null（未サインイン/復元中）は名前部分を落とす", () => {
    expect(buildHistoryGreeting(null)).toBe("今日も歩きましょう");
  });

  it("undefined は名前部分を落とす", () => {
    expect(buildHistoryGreeting(undefined)).toBe("今日も歩きましょう");
  });

  it("空文字は名前部分を落とす", () => {
    expect(buildHistoryGreeting("")).toBe("今日も歩きましょう");
  });

  it("空白のみは名前部分を落とす", () => {
    expect(buildHistoryGreeting("   ")).toBe("今日も歩きましょう");
  });

  it("前後の空白を trim してから組み立てる", () => {
    expect(buildHistoryGreeting("  田中 太郎  ")).toBe("田中 太郎さん、今日も歩きましょう");
  });

  it("dev モードの表示名（user_key）にも敬称を付ける", () => {
    expect(buildHistoryGreeting("dev-user-1")).toBe("dev-user-1さん、今日も歩きましょう");
  });
});
