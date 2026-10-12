import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { APPLE_NONCE_BYTES, bytesToHex, createAppleNonce } from "@/services/auth/appleNonce";

describe("bytesToHex", () => {
  it("0 埋めの小文字 hex を返す", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
  });
});

describe("createAppleNonce", () => {
  it("注入した固定バイトから raw が 64 文字の hex になる", async () => {
    const nonce = await createAppleNonce({
      randomBytes: (n) => new Uint8Array(n).fill(171),
    });

    expect(nonce.raw).toBe("ab".repeat(APPLE_NONCE_BYTES));
    expect(nonce.raw).toHaveLength(64);
  });

  it("hashed が sha256(raw) の hex と一致する", async () => {
    const nonce = await createAppleNonce();

    expect(nonce.hashed).toBe(createHash("sha256").update(nonce.raw, "utf8").digest("hex"));
  });

  it("sha256Hex が大文字を返しても hashed は小文字", async () => {
    const nonce = await createAppleNonce({ sha256Hex: async () => "ABCDEF" });

    expect(nonce.hashed).toBe("abcdef");
  });

  it("既定の deps で2回作ると raw が異なる", async () => {
    const a = await createAppleNonce();
    const b = await createAppleNonce();

    expect(a.raw).not.toBe(b.raw);
  });

  it("raw の長さが backend の制約 16〜256 に収まる", async () => {
    const { raw } = await createAppleNonce();

    expect(raw.length).toBeGreaterThanOrEqual(16);
    expect(raw.length).toBeLessThanOrEqual(256);
  });
});
