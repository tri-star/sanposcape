import { describe, expect, it } from "vitest";

import { toAuthUser, toSession } from "@/services/auth/sessionMapper";

const validRaw = {
  access_token: "access-1",
  expires_in: 900,
  refresh_token: "refresh-1",
  user: {
    id: "user-1",
    email: "user@example.com",
    display_name: "Taro",
    photo_url: "https://example.com/photo.png",
  },
};

describe("toSession", () => {
  const now = 1_000_000;

  it("snake_case → camelCase 変換が正しく行われる", () => {
    const result = toSession(validRaw, now);

    expect(result.accessToken.value).toBe("access-1");
    expect(result.refreshToken).toBe("refresh-1");
    expect(result.user.displayName).toBe("Taro");
    expect(result.user.photoUrl).toBe("https://example.com/photo.png");
  });

  it("expiresAt = now + expires_in * 1000", () => {
    const result = toSession(validRaw, now);
    expect(result.accessToken.expiresAt).toBe(now + 900 * 1000);
  });

  it("camelCase のキーで渡しても受け付けない（throw する）", () => {
    const camelCaseRaw = {
      accessToken: "access-1",
      expiresIn: 900,
      refreshToken: "refresh-1",
      user: { id: "user-1", email: null, displayName: null, photoUrl: null },
    };

    expect(() => toSession(camelCaseRaw, now)).toThrow();
  });

  it("user.email が undefined なら null に正規化する", () => {
    const raw = { ...validRaw, user: { ...validRaw.user, email: undefined } };
    const result = toSession(raw, now);
    expect(result.user.email).toBeNull();
  });

  it("access_token 欠落は throw する", () => {
    const raw = { ...validRaw, access_token: undefined };
    expect(() => toSession(raw, now)).toThrow();
  });

  it("refresh_token 空文字は throw する", () => {
    const raw = { ...validRaw, refresh_token: "" };
    expect(() => toSession(raw, now)).toThrow();
  });

  it("expires_in: 0 は throw する", () => {
    const raw = { ...validRaw, expires_in: 0 };
    expect(() => toSession(raw, now)).toThrow();
  });

  it("user.id 欠落は throw する", () => {
    const raw = { ...validRaw, user: { ...validRaw.user, id: undefined } };
    expect(() => toSession(raw, now)).toThrow();
  });

  it("object でない入力は throw する", () => {
    expect(() => toSession(null, now)).toThrow();
    expect(() => toSession("string", now)).toThrow();
  });
});

describe("toAuthUser", () => {
  it("snake_case のユーザー情報を camelCase へ変換する", () => {
    const result = toAuthUser(validRaw.user);
    expect(result).toEqual({
      id: "user-1",
      email: "user@example.com",
      displayName: "Taro",
      photoUrl: "https://example.com/photo.png",
    });
  });

  it("null 許容フィールドが null のまま保持される", () => {
    const result = toAuthUser({ id: "user-1", email: null, display_name: null, photo_url: null });
    expect(result).toEqual({ id: "user-1", email: null, displayName: null, photoUrl: null });
  });

  it("id 欠落は throw する", () => {
    expect(() => toAuthUser({ email: null })).toThrow();
  });

  it("object でない入力は throw する", () => {
    expect(() => toAuthUser(null)).toThrow();
  });
});
