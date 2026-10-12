import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from "expo-crypto";

/** raw nonce のバイト数。hex で 64 文字（backend の制約 16〜256 文字に収まる）。 */
export const APPLE_NONCE_BYTES = 32;

export type AppleNonce = {
  /** backend に `nonce` として送る値。 */
  raw: string;
  /** Apple の `signInAsync({ nonce })` に渡す値（sha256(raw) の小文字 hex）。 */
  hashed: string;
};

/** バイト列を小文字 hex にする（純粋）。 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Sign in with Apple の nonce を作る。backend には raw を、Apple には sha256(raw) の小文字 hex を渡す
 * （raw をそのまま Apple に渡すと backend が 401、省くと 422。ADR-002 SS-197 追補）。
 * nonce は推測されると意味が無いので、暗号論的乱数（getRandomBytes）を使う。
 */
export async function createAppleNonce(deps?: {
  randomBytes?: (byteCount: number) => Uint8Array;
  sha256Hex?: (value: string) => Promise<string>;
}): Promise<AppleNonce> {
  const randomBytes = deps?.randomBytes ?? getRandomBytes;
  const sha256Hex =
    deps?.sha256Hex ?? ((value: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, value));
  const raw = bytesToHex(randomBytes(APPLE_NONCE_BYTES));
  // 大小文字は仕様で保証されないので小文字に揃える（contentHash.ts と同じ扱い）。
  const hashed = (await sha256Hex(raw)).toLowerCase();
  return { raw, hashed };
}
