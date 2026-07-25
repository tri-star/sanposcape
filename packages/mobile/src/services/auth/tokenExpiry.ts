import type { AccessToken } from "@/services/auth/types";

/** 時計ずれ・通信遅延を見込んだ前倒し（ms）。 */
export const ACCESS_TOKEN_EXPIRY_SKEW_MS = 30_000;

/** token が null、または (expiresAt - skew) <= now なら期限切れ扱い。 */
export function isAccessTokenExpired(
  token: AccessToken | null,
  now: number,
  skewMs: number = ACCESS_TOKEN_EXPIRY_SKEW_MS,
): boolean {
  if (token === null) {
    return true;
  }
  return token.expiresAt - skewMs <= now;
}

/** expiresIn(秒) と現在時刻(ms) から失効時刻(epoch ms)を求める。 */
export function toExpiresAt(expiresInSec: number, now: number): number {
  return now + expiresInSec * 1000;
}
