import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { customFetch } from "@/api/client";
import { server } from "@/test/setup";

describe("customFetch", () => {
  it("成功時は JSON をパースして返す", async () => {
    server.use(
      http.get("http://localhost:8000/spots", () => HttpResponse.json([{ id: 1, name: "公園" }])),
    );

    const data = await customFetch<{ id: number; name: string }[]>("/spots", { method: "GET" });
    expect(data).toEqual([{ id: 1, name: "公園" }]);
  });

  it("エラーステータスは例外を投げる", async () => {
    server.use(
      http.get("http://localhost:8000/spots", () => new HttpResponse(null, { status: 500 })),
    );

    await expect(customFetch("/spots", { method: "GET" })).rejects.toThrow("status: 500");
  });
});
