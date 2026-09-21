import { createHash } from "node:crypto";

import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";
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

  it("エラー応答が JSON なら ApiError.body に保持する（PR #93 T15）", async () => {
    server.use(
      http.post(
        "http://localhost:8000/spots",
        () =>
          new HttpResponse(JSON.stringify({ detail: "Storage quota exceeded", code: "x" }), {
            status: 409,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const error = await customFetch("/spots", { method: "POST" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).body).toEqual({ detail: "Storage quota exceeded", code: "x" });
    // 既定メッセージは変わらない（既存の呼び出し側の挙動を壊さない）。
    expect((error as ApiError).message).toBe("HTTP error! status: 409");
  });

  it("エラー応答が JSON でない場合は body が undefined", async () => {
    server.use(
      http.get("http://localhost:8000/spots", () => new HttpResponse("not json", { status: 500 })),
    );

    const error = await customFetch("/spots", { method: "GET" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).body).toBeUndefined();
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

  it("GET が 429 → 200 で成功する（一時障害の再送）", async () => {
    let callCount = 0;
    server.use(
      http.get("http://localhost:8000/spots", () => {
        callCount += 1;
        if (callCount === 1) {
          return new HttpResponse(null, { status: 429 });
        }
        return HttpResponse.json([{ id: 1, name: "公園" }]);
      }),
    );

    const result = await customFetch<{
      status: number;
      data: { id: number; name: string }[];
      headers: Headers;
    }>("/spots", { method: "GET" });

    expect(callCount).toBe(2);
    expect(result.data).toEqual([{ id: 1, name: "公園" }]);
  });

  it("GET が 429 を返し続けると3回で諦めて ApiError を投げる", async () => {
    let callCount = 0;
    server.use(
      http.get("http://localhost:8000/spots", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 429 });
      }),
    );

    await expect(customFetch("/spots", { method: "GET" })).rejects.toThrow("status: 429");
    expect(callCount).toBe(3);
  });

  it("GET の 504 は2回で諦める（オリジン待ち30秒のコストを踏まえた上限）", async () => {
    let callCount = 0;
    server.use(
      http.get("http://localhost:8000/spots", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 504 });
      }),
    );

    await expect(customFetch("/spots", { method: "GET" })).rejects.toThrow("status: 504");
    expect(callCount).toBe(2);
  });

  it("POST の 429 は再送しない（副作用があるため）", async () => {
    let callCount = 0;
    server.use(
      http.post("http://localhost:8000/spots", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 429 });
      }),
    );

    await expect(customFetch("/spots", { method: "POST" })).rejects.toThrow("status: 429");
    expect(callCount).toBe(1);
  });

  it("GET の 500 は再送しない（既存の「エラーステータスは例外を投げる」の補強）", async () => {
    let callCount = 0;
    server.use(
      http.get("http://localhost:8000/spots", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(customFetch("/spots", { method: "GET" })).rejects.toThrow("status: 500");
    expect(callCount).toBe(1);
  });

  it("再送後のリクエストにも X-App-Authorization が付く", async () => {
    const provider: AuthTokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("token-1"),
      refreshAccessToken: vi.fn().mockResolvedValue("token-2"),
    };
    setAuthTokenProvider(provider);

    let callCount = 0;
    const authHeaders: (string | null)[] = [];
    server.use(
      http.get("http://localhost:8000/spots", ({ request }) => {
        callCount += 1;
        authHeaders.push(request.headers.get("X-App-Authorization"));
        if (callCount === 1) {
          return new HttpResponse(null, { status: 429 });
        }
        return HttpResponse.json([]);
      }),
    );

    await customFetch("/spots", { method: "GET" });

    expect(callCount).toBe(2);
    expect(authHeaders).toEqual(["Bearer token-1", "Bearer token-1"]);
  });

  it("401 → refresh → 429 でも、refresh 後の再送で1回成功する（両方のリトライ軸の組み合わせ）", async () => {
    const provider: AuthTokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("expired-token"),
      refreshAccessToken: vi.fn().mockResolvedValue("new-token"),
    };
    setAuthTokenProvider(provider);

    let callCount = 0;
    server.use(
      http.get("http://localhost:8000/spots", ({ request }) => {
        callCount += 1;
        if (callCount === 1) {
          expect(request.headers.get("X-App-Authorization")).toBe("Bearer expired-token");
          return new HttpResponse(null, { status: 401 });
        }
        expect(request.headers.get("X-App-Authorization")).toBe("Bearer new-token");
        if (callCount === 2) {
          // refresh 後の1回目が一時障害（429）を踏む。再送は1回で成功させ、テスト時間を抑える。
          return new HttpResponse(null, { status: 429 });
        }
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
    expect(callCount).toBe(3);
  });
});
