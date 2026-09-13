import { describe, expect, it } from "vitest";

import {
  parseRetryAfterMs,
  shouldRetryTransient,
  transientRetryDelayMs,
} from "@/api/transientRetry";

describe("shouldRetryTransient", () => {
  it.each([1, 2])("GET / 429 / attempts=%i は再送する", (attempts) => {
    expect(
      shouldRetryTransient({ method: "GET", failure: { kind: "status", status: 429 }, attempts }),
    ).toBe(true);
  });

  it("GET / 429 / attempts=3 は上限で再送しない", () => {
    expect(
      shouldRetryTransient({
        method: "GET",
        failure: { kind: "status", status: 429 },
        attempts: 3,
      }),
    ).toBe(false);
  });

  it("GET / 504 / attempts=1 は再送する", () => {
    expect(
      shouldRetryTransient({
        method: "GET",
        failure: { kind: "status", status: 504 },
        attempts: 1,
      }),
    ).toBe(true);
  });

  it("GET / 504 / attempts=2 は高コストなので再送しない", () => {
    expect(
      shouldRetryTransient({
        method: "GET",
        failure: { kind: "status", status: 504 },
        attempts: 2,
      }),
    ).toBe(false);
  });

  it.each([502, 503])("GET / %i / attempts=1 は再送する", (status) => {
    expect(
      shouldRetryTransient({ method: "GET", failure: { kind: "status", status }, attempts: 1 }),
    ).toBe(true);
  });

  it("GET / 500 は再送しない（アプリ層の決定的なエラー）", () => {
    expect(
      shouldRetryTransient({
        method: "GET",
        failure: { kind: "status", status: 500 },
        attempts: 1,
      }),
    ).toBe(false);
  });

  it.each([401, 403, 404, 413, 422])("GET / %i は再送しない", (status) => {
    expect(
      shouldRetryTransient({ method: "GET", failure: { kind: "status", status }, attempts: 1 }),
    ).toBe(false);
  });

  it.each([1, 2])("GET / network / attempts=%i は再送する", (attempts) => {
    expect(shouldRetryTransient({ method: "GET", failure: { kind: "network" }, attempts })).toBe(
      true,
    );
  });

  it("HEAD / 429 は再送する", () => {
    expect(
      shouldRetryTransient({
        method: "HEAD",
        failure: { kind: "status", status: 429 },
        attempts: 1,
      }),
    ).toBe(true);
  });

  it("POST / 429 は再送しない（副作用があるため）", () => {
    expect(
      shouldRetryTransient({
        method: "POST",
        failure: { kind: "status", status: 429 },
        attempts: 1,
      }),
    ).toBe(false);
  });

  it.each([{ kind: "status", status: 503 } as const, { kind: "network" } as const])(
    "POST / %o は再送しない",
    (failure) => {
      expect(shouldRetryTransient({ method: "POST", failure, attempts: 1 })).toBe(false);
    },
  );

  it.each(["PUT", "PATCH", "DELETE"])("%s / 429・504・network は再送しない", (method) => {
    expect(
      shouldRetryTransient({ method, failure: { kind: "status", status: 429 }, attempts: 1 }),
    ).toBe(false);
    expect(
      shouldRetryTransient({ method, failure: { kind: "status", status: 504 }, attempts: 1 }),
    ).toBe(false);
    expect(shouldRetryTransient({ method, failure: { kind: "network" }, attempts: 1 })).toBe(false);
  });

  it("method 未指定は GET 扱いで再送する", () => {
    expect(
      shouldRetryTransient({
        method: undefined,
        failure: { kind: "status", status: 429 },
        attempts: 1,
      }),
    ).toBe(true);
  });

  it("小文字 'get' も大文字化されて再送する", () => {
    expect(
      shouldRetryTransient({
        method: "get",
        failure: { kind: "status", status: 429 },
        attempts: 1,
      }),
    ).toBe(true);
  });
});

describe("parseRetryAfterMs", () => {
  it("'2' は 2000ms", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
  });

  it("'0' は 0ms", () => {
    expect(parseRetryAfterMs("0")).toBe(0);
  });

  it("'999' は上限 10000ms にクランプされる", () => {
    expect(parseRetryAfterMs("999")).toBe(10_000);
  });

  it.each(["Wed, 21 Oct 2015 07:28:00 GMT", "-1", "abc", "", null, undefined])(
    "%p は解釈できず null",
    (value) => {
      expect(parseRetryAfterMs(value)).toBeNull();
    },
  );
});

describe("transientRetryDelayMs", () => {
  it("attempts=1 / random=0 は 250ms", () => {
    expect(transientRetryDelayMs(1, { random: () => 0 })).toBe(250);
  });

  it("attempts=1 / random=1 は 500ms", () => {
    expect(transientRetryDelayMs(1, { random: () => 1 })).toBe(500);
  });

  it("attempts=2 / random=1 は 1000ms", () => {
    expect(transientRetryDelayMs(2, { random: () => 1 })).toBe(1000);
  });

  it("attempts=10 / random=1 は上限 4000ms（MAX_DELAY_MS）", () => {
    expect(transientRetryDelayMs(10, { random: () => 1 })).toBe(4000);
  });

  it("retryAfter が解釈できればバックオフより優先する", () => {
    expect(transientRetryDelayMs(1, { retryAfter: "2" })).toBe(2000);
  });

  it("retryAfter が解釈できなければバックオフにフォールバックする", () => {
    expect(transientRetryDelayMs(1, { retryAfter: "abc", random: () => 1 })).toBe(500);
  });
});
