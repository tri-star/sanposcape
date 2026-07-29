import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthTokenProvider } from "@/api/authTokenProvider";
import { setAuthTokenProvider } from "@/api/authTokenProvider";
import { customFetch } from "@/api/client";
import { server } from "@/test/setup";

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

  it("provider 未登録なら Authorization ヘッダが付かず、401 でもリトライせず ApiError を投げる", async () => {
    server.use(
      http.get("http://localhost:8000/spots", ({ request }) => {
        expect(request.headers.get("Authorization")).toBeNull();
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(customFetch("/spots", { method: "GET" })).rejects.toThrow("status: 401");
  });

  it("provider 登録済み・トークンありならリクエストに Bearer が付く", async () => {
    const provider: AuthTokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("token-1"),
      refreshAccessToken: vi.fn().mockResolvedValue("token-2"),
    };
    setAuthTokenProvider(provider);

    server.use(
      http.get("http://localhost:8000/spots", ({ request }) => {
        expect(request.headers.get("Authorization")).toBe("Bearer token-1");
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
          expect(request.headers.get("Authorization")).toBe("Bearer expired-token");
          return new HttpResponse(null, { status: 401 });
        }
        expect(request.headers.get("Authorization")).toBe("Bearer new-token");
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
});
