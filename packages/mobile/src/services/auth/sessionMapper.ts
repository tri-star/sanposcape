import { AuthError } from "@/services/auth/authError";
import { toExpiresAt } from "@/services/auth/tokenExpiry";
import type { AccessToken, AuthUser } from "@/services/auth/types";

export type MappedSession = { user: AuthUser; accessToken: AccessToken; refreshToken: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * backend のレスポンス(unknown・snake_case) を検証しつつ camelCase のドメイン表現へ変換する。
 * 不正なら AuthError("unknown") を投げる。
 * snake_case → camelCase の変換を担う唯一の場所。汎用のキー変換ユーティリティは作らない
 * （対象が2型だけであり、明示的なフィールド対応のほうが型安全でテストしやすいため）。
 */
export function toSession(raw: unknown, now: number): MappedSession {
  if (!isRecord(raw)) {
    throw new AuthError("unknown", "invalid session response: not an object");
  }

  const accessTokenValue = raw.access_token;
  const expiresIn = raw.expires_in;
  const refreshTokenValue = raw.refresh_token;

  if (typeof accessTokenValue !== "string" || accessTokenValue.length === 0) {
    throw new AuthError("unknown", "invalid session response: access_token is missing");
  }
  if (typeof expiresIn !== "number" || !(expiresIn > 0)) {
    throw new AuthError("unknown", "invalid session response: expires_in is invalid");
  }
  if (typeof refreshTokenValue !== "string" || refreshTokenValue.length === 0) {
    throw new AuthError("unknown", "invalid session response: refresh_token is missing");
  }

  const user = toAuthUser(raw.user);

  return {
    user,
    accessToken: { value: accessTokenValue, expiresAt: toExpiresAt(expiresIn, now) },
    refreshToken: refreshTokenValue,
  };
}

/** ユーザー部分のみの変換（GET /auth/me を将来使う場合や、テストからの再利用のため公開する）。 */
export function toAuthUser(raw: unknown): AuthUser {
  if (!isRecord(raw)) {
    throw new AuthError("unknown", "invalid user response: not an object");
  }

  const id = raw.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new AuthError("unknown", "invalid user response: id is missing");
  }

  return {
    id,
    email: normalizeNullableString(raw.email),
    displayName: normalizeNullableString(raw.display_name),
    photoUrl: normalizeNullableString(raw.photo_url),
  };
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
