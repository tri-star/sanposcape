/**
 * vitest(node環境) 用の expo-crypto モック。ネイティブモジュールが存在しないため node:crypto で代替する。
 * ダミー値ではなく実際の SHA-256 を返す（x-amz-content-sha256 の値そのものをテストで検証するため）。
 */
import { createHash } from "node:crypto";

export const CryptoDigestAlgorithm = {
  SHA1: "SHA-1",
  SHA256: "SHA-256",
  SHA384: "SHA-384",
  SHA512: "SHA-512",
} as const;

export async function digestStringAsync(algorithm: string, data: string): Promise<string> {
  if (algorithm !== CryptoDigestAlgorithm.SHA256) {
    throw new Error(`未対応のアルゴリズムです: ${algorithm}`);
  }
  return createHash("sha256").update(data, "utf8").digest("hex");
}
