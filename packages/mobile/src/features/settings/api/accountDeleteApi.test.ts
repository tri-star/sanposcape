import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { getDeleteMeUsersMeDeleteMockHandler } from "@/api/generated/endpoints/users/users.msw";
import { deleteAccount } from "@/features/settings/api/accountDeleteApi";
import { server } from "@/test/setup";

describe("deleteAccount", () => {
  it("204 で resolve する（DELETE メソッド・正しいパス）", async () => {
    let method: string | undefined;
    let pathname: string | undefined;
    server.use(
      http.delete("*/users/me", (info) => {
        method = info.request.method;
        pathname = new URL(info.request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(deleteAccount()).resolves.toBeUndefined();
    expect(method).toBe("DELETE");
    expect(pathname).toBe("/users/me");
  });

  it("401 では ApiError(401) で reject する（404 への読み替えはしない）", async () => {
    server.use(http.delete("*/users/me", () => new HttpResponse(null, { status: 401 })));

    try {
      await deleteAccount();
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
    }
  });

  it("500 では ApiError(500) で reject する", async () => {
    server.use(http.delete("*/users/me", () => new HttpResponse(null, { status: 500 })));

    try {
      await deleteAccount();
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(500);
    }
  });

  it("401のとき呼び出し回数は1", async () => {
    let callCount = 0;
    server.use(
      http.delete("*/users/me", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(deleteAccount()).rejects.toThrow(ApiError);
    expect(callCount).toBe(1);
  });

  it("Orval 生成の msw ハンドラでも通る", async () => {
    server.use(getDeleteMeUsersMeDeleteMockHandler());

    await expect(deleteAccount()).resolves.toBeUndefined();
  });
});
