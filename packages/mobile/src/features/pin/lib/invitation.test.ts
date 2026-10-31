import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  formatInvitationExpiry,
  invitationAcceptPath,
  invitationInviterLabel,
  invitationShareMessage,
  invitationVisibleNameNote,
  isRetriableInvitationError,
  parseInvitationLink,
  toInvitationErrorCode,
} from "@/features/pin/lib/invitation";

const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456";

describe("parseInvitationLink", () => {
  it("本番・開発用の招待リンクの fragment からトークンを取り出す", () => {
    expect(parseInvitationLink(`https://sanposcape.com/i/#${TOKEN}`)).toBe(TOKEN);
    expect(parseInvitationLink(`https://dev.sanposcape.com/i#${TOKEN}`)).toBe(TOKEN);
    expect(parseInvitationLink(`  https://sanposcape.com/i/#${TOKEN}\n`)).toBe(TOKEN);
  });

  it("LP の「アプリで開く」の custom scheme と、トークンそのものも受け付ける", () => {
    expect(parseInvitationLink(`sanposcape://invite?t=${TOKEN}`)).toBe(TOKEN);
    expect(parseInvitationLink(`sanposcape-dev://invite?t=${TOKEN}`)).toBe(TOKEN);
    expect(parseInvitationLink(TOKEN)).toBe(TOKEN);
  });

  it("別のホスト・別のパス・トークンの形でないものは読み取らない", () => {
    expect(parseInvitationLink(`https://example.com/i/#${TOKEN}`)).toBeNull();
    expect(parseInvitationLink(`https://sanposcape.com/privacy/#${TOKEN}`)).toBeNull();
    expect(parseInvitationLink("https://sanposcape.com/i/#short")).toBeNull();
    expect(parseInvitationLink(`https://sanposcape.com/i/#${TOKEN}%3Cx`)).toBeNull();
    expect(parseInvitationLink(`sanposcape://other?t=${TOKEN}`)).toBeNull();
    expect(parseInvitationLink("こんにちは")).toBeNull();
  });
});

describe("invitationAcceptPath", () => {
  it("受諾画面のパスにトークンを載せる", () => {
    expect(invitationAcceptPath(TOKEN)).toBe(`/invitations/accept?token=${TOKEN}`);
  });
});

describe("toInvitationErrorCode", () => {
  it("本文の code で 403・409 を分ける", () => {
    expect(toInvitationErrorCode(new ApiError(403, undefined, { code: "feature_disabled" }))).toBe(
      "disabled",
    );
    expect(toInvitationErrorCode(new ApiError(403))).toBe("forbidden");
    expect(
      toInvitationErrorCode(new ApiError(409, undefined, { code: "invitation_limit_exceeded" })),
    ).toBe("invitation_limit");
    expect(
      toInvitationErrorCode(new ApiError(409, undefined, { code: "member_limit_reached" })),
    ).toBe("member_limit");
  });

  it("使えないリンク・レート制限・通信の失敗を分類する", () => {
    expect(toInvitationErrorCode(new ApiError(404))).toBe("not_found");
    expect(toInvitationErrorCode(new ApiError(429))).toBe("rate_limited");
    expect(toInvitationErrorCode(new ApiError(503))).toBe("server");
    expect(toInvitationErrorCode(new TypeError("x"))).toBe("network");
    expect(isRetriableInvitationError("not_found")).toBe(false);
    expect(isRetriableInvitationError("network")).toBe(true);
  });
});

describe("文言", () => {
  it("共有の本文に地図の名前と URL を入れる", () => {
    expect(
      invitationShareMessage({
        sanpoMapName: "おすすめランチ",
        url: "https://sanposcape.com/i/#x",
      }),
    ).toBe(
      "「おすすめランチ」の地図に招待します。Sanposcape のアプリで開いてください。\nhttps://sanposcape.com/i/#x",
    );
  });

  it("表示名が無いときは「メンバー」にする", () => {
    expect(invitationInviterLabel(null)).toBe("メンバーさんが地図に招待しています");
    expect(invitationInviterLabel("山田")).toBe("山田さんが地図に招待しています");
    expect(invitationVisibleNameNote(null)).toContain("「メンバー」");
    expect(invitationVisibleNameNote("山田 太郎")).toContain("「山田 太郎」");
  });

  it("期限を月日で出し、読めない値は空にする", () => {
    expect(formatInvitationExpiry("2026-11-07T03:00:00Z")).toMatch(/^11月7日 まで有効$/);
    expect(formatInvitationExpiry("not-a-date")).toBe("");
  });
});
