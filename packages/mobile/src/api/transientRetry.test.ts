import { describe, expect, it, vi } from "vitest";

import {
  parseRetryAfterMs,
  sendWithTransientRetry,
  shouldRetryTransient,
  transientRetryDelayMs,
} from "@/api/transientRetry";

/** テスト用の最小 Response もどき。`headers.get` と任意の `status` だけ持てば十分。 */
function fakeResponse(status: number, headers: Record<string, string> = {}): Response {
  return {
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    // body は意図的に持たせない（`response.body?.cancel()` が no-op になることを確認する）。
  } as unknown as Response;
}

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

describe("sendWithTransientRetry", () => {
  it("GET で TypeError が2回続いたあと成功すると、2回スリープして最後のレスポンスを返す", async () => {
    const send = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(fakeResponse(200));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await sendWithTransientRetry(send, { method: "GET", sleep });

    expect(result.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("GET で TypeError が上限回数まで続くと、最後は例外をそのまま投げる", async () => {
    const networkError = new TypeError("Network request failed");
    const send = vi.fn<() => Promise<Response>>().mockRejectedValue(networkError);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(sendWithTransientRetry(send, { method: "GET", sleep })).rejects.toBe(networkError);
    // MAX_ATTEMPTS_CHEAP = 3 回まで試行し、そのうち2回だけスリープを挟む。
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("AbortError（DOMException）は1回で投げ、再送もスリープもしない", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const send = vi.fn<() => Promise<Response>>().mockRejectedValue(abortError);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(sendWithTransientRetry(send, { method: "GET", sleep })).rejects.toBe(abortError);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("POST の 503 は再送しない（send は1回・sleep は0回）", async () => {
    const send = vi.fn<() => Promise<Response>>().mockResolvedValue(fakeResponse(503));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await sendWithTransientRetry(send, { method: "POST", sleep });

    expect(result.status).toBe(503);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
