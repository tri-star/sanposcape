import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CONTENT_SHA256_HEADER,
  EMPTY_BODY_SHA256,
  contentHashTarget,
  withContentHashHeader,
} from "@/api/contentHash";

/**
 * 注意（テストの限界）: vitest 上では `expo-crypto` が node:crypto ベースのモックに差し替わる
 * （`src/test/mocks/expo-crypto.ts` + `vitest.config.ts` のエイリアス）。
 * これらのテストが保証するのは「どの文字列をハッシュ対象に選ぶか」「ヘッダー名・形式・不変条件」であって、
 * ネイティブ実装の digest の正しさではない。ネイティブ側の実挙動は E2E（実機/エミュレータ + 実 backend）で担保する。
 */

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe("EMPTY_BODY_SHA256", () => {
  it(
    "空文字列の SHA-256 と独立に一致する（自己参照テストにしない）。" +
      "この定数が壊れると DELETE 系（/walks/{id}, /users/me）が CloudFront 経由で" +
      "一斉に 403 になるが、他の手段ではローカルで検知できないため必ず値そのものを検証する",
    () => {
      expect(EMPTY_BODY_SHA256).toBe(sha256Hex(""));
    },
  );
});

describe("contentHashTarget", () => {
  it("GET は null（ボディを持てないため CloudFront 側で完結する）", () => {
    expect(contentHashTarget({ method: "GET" })).toBeNull();
  });

  it("HEAD は null", () => {
    expect(contentHashTarget({ method: "HEAD" })).toBeNull();
  });

  it("method が小文字でも大文字化して判定する", () => {
    expect(contentHashTarget({ method: "get" })).toBeNull();
  });

  it("method 省略時は既定の GET として扱う", () => {
    expect(contentHashTarget({})).toBeNull();
  });

  it("POST + string body はその文字列を返す", () => {
    expect(contentHashTarget({ method: "POST", body: '{"a":1}' })).toBe('{"a":1}');
  });

  it("POST + body 無しは空文字列を返す", () => {
    expect(contentHashTarget({ method: "POST" })).toBe("");
  });

  it("DELETE（body 無し）は空文字列を返す", () => {
    expect(contentHashTarget({ method: "DELETE" })).toBe("");
  });

  it("string 以外の body（FormData 等）は TypeError を投げる", () => {
    expect(() => contentHashTarget({ method: "POST", body: new FormData() })).toThrow(TypeError);
  });
});

describe("withContentHashHeader", () => {
  it("GET は引数と同一参照を返し、ヘッダーが増えない", async () => {
    const options: RequestInit = { method: "GET", headers: { "Content-Type": "application/json" } };

    const result = await withContentHashHeader(options);

    expect(result).toBe(options);
  });

  it("POST + body ありは body の SHA-256 が付く", async () => {
    const body = '{"a":1}';

    const result = await withContentHashHeader({ method: "POST", body });

    const headers = new Headers(result.headers);
    expect(headers.get(CONTENT_SHA256_HEADER)).toBe(sha256Hex(body));
  });

  it("POST + body 無しは空文字列の SHA-256 定数が付く", async () => {
    const result = await withContentHashHeader({ method: "POST" });

    const headers = new Headers(result.headers);
    expect(headers.get(CONTENT_SHA256_HEADER)).toBe(EMPTY_BODY_SHA256);
  });

  it("日本語を含むボディでも UTF-8 のハッシュと一致する（マルチバイトの取りこぼしが無いことの確認）", async () => {
    const body = '{"name":"代々木公園"}';

    const result = await withContentHashHeader({ method: "POST", body });

    const headers = new Headers(result.headers);
    expect(headers.get(CONTENT_SHA256_HEADER)).toBe(sha256Hex(body));
  });

  it("既存の Content-Type ヘッダ（素オブジェクト）が保持される", async () => {
    const result = await withContentHashHeader({
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });

    const headers = new Headers(result.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get(CONTENT_SHA256_HEADER)).toBe(sha256Hex("{}"));
  });

  it("既存の Content-Type ヘッダ（Headers インスタンス）が保持される", async () => {
    const result = await withContentHashHeader({
      method: "POST",
      body: "{}",
      headers: new Headers({ "Content-Type": "application/json" }),
    });

    const headers = new Headers(result.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get(CONTENT_SHA256_HEADER)).toBe(sha256Hex("{}"));
  });

  it("元の options オブジェクトが変更されていない", async () => {
    const options: RequestInit = {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    };

    await withContentHashHeader(options);

    expect(options.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("出力は小文字16進64文字である", async () => {
    const result = await withContentHashHeader({ method: "POST", body: "{}" });

    const headers = new Headers(result.headers);
    expect(headers.get(CONTENT_SHA256_HEADER)).toMatch(/^[0-9a-f]{64}$/);
  });
});
