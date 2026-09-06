import { createHash } from "node:crypto";

import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthTokenProvider } from "@/api/authTokenProvider";
import { setAuthTokenProvider } from "@/api/authTokenProvider";
import { CONTENT_SHA256_HEADER } from "@/api/contentHash";
import { customFetch } from "@/api/client";
import { server } from "@/test/setup";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe("customFetch", () => {
  afterEach(() => {
    setAuthTokenProvider(null);
  });

  it("成功時は { status, data, headers } を返す", async () => {
    server.use(
      http.get("http://localhost:8000/spots", () => HttpResponse.json([{ id: 1, name: "公園" }])),
    );

    const result = await customFetch<{
      status: number;
      data: { id: number; name: string }[];
      headers: Headers;
    }>("/spots", { method: "GET" });

    expect(result.status).toBe(200);
    expect(result.data).toEqual([{ id: 1, name: "公園" }]);
    expect(result.headers).toBeInstanceOf(Headers);
  });

  it("エラーステータスは例外を投げる", async () => {
    server.use(
      http.get("http://localhost:8000/spots", () => new HttpResponse(null, { status: 500 })),
    );

    await expect(customFetch("/spots", { method: "GET" })).rejects.toThrow("status: 500");
  });

  it("provider 未登録なら X-App-Authorization ヘッダが付かず、401 でもリトライせず ApiError を投げる", async () => {
    server.use(
      http.get("http://localhost:8000/spots", ({ request }) => {
        expect(request.headers.get("X-App-Authorization")).toBeNull();
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(customFetch("/spots", { method: "GET" })).rejects.toThrow("status: 401");
  });

  it("provider 登録済み・トークンありならリクエストに X-App-Authorization: Bearer が付く", async () => {
    const provider: AuthTokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("token-1"),
      refreshAccessToken: vi.fn().mockResolvedValue("token-2"),
    };
    setAuthTokenProvider(provider);

    server.use(
      http.get("http://localhost:8000/spots", ({ request }) => {
        expect(request.headers.get("X-App-Authorization")).toBe("Bearer token-1");
        return HttpResponse.json([]);
      }),
    );

    await customFetch("/spots", { method: "GET" });
  });

  it("401 → refresh 成功 → リトライ成功でデータが返る", async () => {
    let callCount = 0;
    const provider: AuthTokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("expired-token"),
      refreshAccessToken: vi.fn().mockResolvedValue("new-token"),
    };
    setAuthTokenProvider(provider);

    server.use(
      http.get("http://localhost:8000/spots", ({ request }) => {
        callCount += 1;
        if (callCount === 1) {
          expect(request.headers.get("X-App-Authorization")).toBe("Bearer expired-token");
          return new HttpResponse(null, { status: 401 });
        }
        expect(request.headers.get("X-App-Authorization")).toBe("Bearer new-token");
        return HttpResponse.json([{ id: 1, name: "公園" }]);
      }),
    );

    const result = await customFetch<{
      status: number;
      data: { id: number; name: string }[];
      headers: Headers;
    }>("/spots", { method: "GET" });

    expect(result.data).toEqual([{ id: 1, name: "公園" }]);
    expect(provider.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(2);
  });

  it("401 → refresh が null を返すときはリトライせず ApiError を投げる", async () => {
    const provider: AuthTokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("expired-token"),
      refreshAccessToken: vi.fn().mockResolvedValue(null),
    };
    setAuthTokenProvider(provider);

    let callCount = 0;
    server.use(
      http.get("http://localhost:8000/spots", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(customFetch("/spots", { method: "GET" })).rejects.toThrow("status: 401");
    expect(provider.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(1);
  });

  it("401 → refresh 後のリトライも 401 なら ApiError を投げる（無限ループしない）", async () => {
    const provider: AuthTokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("expired-token"),
      refreshAccessToken: vi.fn().mockResolvedValue("new-token"),
    };
    setAuthTokenProvider(provider);

    let callCount = 0;
    server.use(
      http.get("http://localhost:8000/spots", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(customFetch("/spots", { method: "GET" })).rejects.toThrow("status: 401");
    expect(provider.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(callCount).toBe(2);
  });

  it("POST に x-amz-content-sha256 が付き、値がボディの SHA-256 と一致する", async () => {
    const body = JSON.stringify({ name: "代々木公園" });
    let contentHash: string | null = null;
    server.use(
      http.post("http://localhost:8000/spots", ({ request }) => {
        contentHash = request.headers.get(CONTENT_SHA256_HEADER);
        return HttpResponse.json({ id: 1 });
      }),
    );

    await customFetch("/spots", { method: "POST", body });

    expect(contentHash).toBe(sha256Hex(body));
  });

  it("GET には x-amz-content-sha256 が付かない", async () => {
    let contentHash: string | null | undefined;
    server.use(
      http.get("http://localhost:8000/spots", ({ request }) => {
        contentHash = request.headers.get(CONTENT_SHA256_HEADER);
        return HttpResponse.json([]);
      }),
    );

    await customFetch("/spots", { method: "GET" });

    expect(contentHash).toBeNull();
  });

  it("401 → refresh → リトライした2回目のリクエストにも同じ x-amz-content-sha256 が付く", async () => {
    const body = JSON.stringify({ name: "代々木公園" });
    const provider: AuthTokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("expired-token"),
      refreshAccessToken: vi.fn().mockResolvedValue("new-token"),
    };
    setAuthTokenProvider(provider);

    let callCount = 0;
    const contentHashes: (string | null)[] = [];
    server.use(
      http.post("http://localhost:8000/spots", ({ request }) => {
        callCount += 1;
        contentHashes.push(request.headers.get(CONTENT_SHA256_HEADER));
        if (callCount === 1) {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ id: 1 });
      }),
    );

    await customFetch("/spots", { method: "POST", body });

    expect(callCount).toBe(2);
    expect(contentHashes).toEqual([sha256Hex(body), sha256Hex(body)]);
  });
});
