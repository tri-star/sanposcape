import { describe, expect, it } from "vitest";

import { withAuthHeader } from "@/api/authHeaders";

describe("withAuthHeader", () => {
  it("token が null なら Authorization が付かず headers はそのまま", () => {
    const options: RequestInit = { method: "GET", headers: { "Content-Type": "application/json" } };

    const result = withAuthHeader(options, null);

    expect(result).toBe(options);
  });

  it("token があれば Authorization: Bearer xxx が付く", () => {
    const options: RequestInit = { method: "GET" };

    const result = withAuthHeader(options, "abc123");

    const headers = new Headers(result.headers);
    expect(headers.get("Authorization")).toBe("Bearer abc123");
  });

  it("既存の Content-Type ヘッダ（素オブジェクト）が保持される", () => {
    const options: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };

    const result = withAuthHeader(options, "abc123");

    const headers = new Headers(result.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer abc123");
  });

  it("既存の Content-Type ヘッダ（Headers インスタンス）が保持される", () => {
    const options: RequestInit = {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
    };

    const result = withAuthHeader(options, "abc123");

    const headers = new Headers(result.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer abc123");
  });

  it("元の options オブジェクトが変更されていない", () => {
    const options: RequestInit = { method: "GET", headers: { "Content-Type": "application/json" } };

    withAuthHeader(options, "abc123");

    expect(options.headers).toEqual({ "Content-Type": "application/json" });
  });
});
