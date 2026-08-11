import { HttpResponse, delay, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  getCreateSessionAuthSessionPostMockHandler,
  getLogoutAuthLogoutPostMockHandler,
  getRefreshSessionAuthRefreshPostMockHandler,
} from "@/api/generated/endpoints/auth/auth.msw";
import type { SessionRead } from "@/api/generated/model";
import { createAuthApi } from "@/services/auth/authApi";
import { server } from "@/test/setup";

/**
 * `createAuthApi()` は意図的に生成クライアント（`customFetch`）を使わない（401 → refresh の再帰を避けるため）。
 * それでもレスポンスのモックには Orval 生成 MSW ハンドラを流用できる（プラン §4.8 参照）。
 * `@/services/auth`（バレル）は import しない（`getAuthMode()` 経由でネイティブ依存に到達するため）。
 */

const SESSION: SessionRead = {
  access_token: "access-1",
  expires_in: 900,
  refresh_token: "refresh-1",
  user: { id: "user-1", email: "user@example.com", display_name: "田中 太郎", photo_url: null },
};

describe("createAuthApi().createSession", () => {
  it("200 でレスポンス JSON がそのまま返る", async () => {
    server.use(getCreateSessionAuthSessionPostMockHandler(SESSION));

    const authApi = createAuthApi();
    const result = await authApi.createSession({ provider: "google", idToken: "id-token-1" });

    expect(result).toEqual(SESSION);
  });

  it("送信ボディが snake_case で送られる（idToken が漏れていない）", async () => {
    let receivedBody: unknown;
    server.use(
      getCreateSessionAuthSessionPostMockHandler(async (info) => {
        receivedBody = await info.request.json();
        return SESSION;
      }),
    );

    const authApi = createAuthApi();
    await authApi.createSession({ provider: "google", idToken: "id-token-1" });

    expect(receivedBody).toEqual({ provider: "google", id_token: "id-token-1" });
  });

  it("Content-Type: application/json が付く", async () => {
    let contentType: string | null = null;
    server.use(
      getCreateSessionAuthSessionPostMockHandler(async (info) => {
        contentType = info.request.headers.get("Content-Type");
        return SESSION;
      }),
    );

    const authApi = createAuthApi();
    await authApi.createSession({ provider: "google", idToken: "id-token-1" });

    expect(contentType).toBe("application/json");
  });

  it("Authorization ヘッダが付かない（client.ts を経由しないため、401→refresh の再帰が起きない）", async () => {
    let authorization: string | null | undefined;
    server.use(
      getCreateSessionAuthSessionPostMockHandler(async (info) => {
        authorization = info.request.headers.get("Authorization");
        return SESSION;
      }),
    );

    const authApi = createAuthApi();
    await authApi.createSession({ provider: "google", idToken: "id-token-1" });

    expect(authorization).toBeNull();
  });

  it("401 で ApiError(401) が throw される", async () => {
    server.use(http.post("*/auth/session", () => new HttpResponse(null, { status: 401 })));

    const authApi = createAuthApi();
    await expect(
      authApi.createSession({ provider: "google", idToken: "id-token-1" }),
    ).rejects.toSatisfy((error: unknown) => error instanceof ApiError && error.status === 401);
  });
});

describe("createAuthApi().refresh", () => {
  it("200 で JSON が返り、送信ボディが refresh_token である", async () => {
    let receivedBody: unknown;
    server.use(
      getRefreshSessionAuthRefreshPostMockHandler(async (info) => {
        receivedBody = await info.request.json();
        return SESSION;
      }),
    );

    const authApi = createAuthApi();
    const result = await authApi.refresh("refresh-1");

    expect(result).toEqual(SESSION);
    expect(receivedBody).toEqual({ refresh_token: "refresh-1" });
  });

  it("401 で ApiError(401)（createSessionAuthService がこれを見てセッションを破棄する契約の土台）", async () => {
    server.use(http.post("*/auth/refresh", () => new HttpResponse(null, { status: 401 })));

    const authApi = createAuthApi();
    await expect(authApi.refresh("refresh-1")).rejects.toSatisfy(
      (error: unknown) => error instanceof ApiError && error.status === 401,
    );
  });

  it("signal を渡して abort() すると reject する（restoreSession のタイムアウト経路の前提）", async () => {
    server.use(
      http.post("*/auth/refresh", async () => {
        await delay("infinite");
        return HttpResponse.json(SESSION);
      }),
    );

    const authApi = createAuthApi();
    const controller = new AbortController();
    const promise = authApi.refresh("refresh-1", { signal: controller.signal });

    controller.abort();

    await expect(promise).rejects.toThrow();
    expect(controller.signal.aborted).toBe(true);
  });
});

describe("createAuthApi().logout", () => {
  it("204（body 無し）でも resolve する", async () => {
    server.use(getLogoutAuthLogoutPostMockHandler());

    const authApi = createAuthApi();
    await expect(authApi.logout("refresh-1")).resolves.toBeUndefined();
  });

  it("送信ボディが refresh_token である", async () => {
    let receivedBody: unknown;
    server.use(
      getLogoutAuthLogoutPostMockHandler(async (info) => {
        receivedBody = await info.request.json();
      }),
    );

    const authApi = createAuthApi();
    await authApi.logout("refresh-1");

    expect(receivedBody).toEqual({ refresh_token: "refresh-1" });
  });

  it("500 で ApiError(500)（signOut() 側がこれを握りつぶす前提の確認）", async () => {
    server.use(http.post("*/auth/logout", () => new HttpResponse(null, { status: 500 })));

    const authApi = createAuthApi();
    await expect(authApi.logout("refresh-1")).rejects.toSatisfy(
      (error: unknown) => error instanceof ApiError && error.status === 500,
    );
  });
});

describe("createAuthApi().createDevSession", () => {
  it("送信ボディが user_key で、/auth/dev-session に飛ぶ（OpenAPI 未掲載の恒久的な例外）", async () => {
    let receivedBody: unknown;
    server.use(
      http.post("*/auth/dev-session", async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json(SESSION);
      }),
    );

    const authApi = createAuthApi();
    await authApi.createDevSession({ userKey: "dev-user-1" });

    expect(receivedBody).toEqual({ user_key: "dev-user-1" });
  });
});

describe("baseUrl の注入", () => {
  it("createAuthApi({ baseUrl }) で指定した絶対 URL に飛ぶ", async () => {
    let called = false;
    server.use(
      http.post("http://api.test/auth/session", async () => {
        called = true;
        return HttpResponse.json(SESSION);
      }),
    );

    const authApi = createAuthApi({ baseUrl: () => "http://api.test" });
    await authApi.createSession({ provider: "google", idToken: "id-token-1" });

    expect(called).toBe(true);
  });
});
