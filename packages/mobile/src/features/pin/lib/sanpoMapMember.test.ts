import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  SANPO_MAP_MEMBER_AVATAR_MAX,
  canRemoveSanpoMapMember,
  canRetrySanpoMapMemberRemove,
  canShowSanpoMapMembers,
  formatSanpoMapMemberCount,
  sanpoMapMemberDisplayName,
  sanpoMapMemberInitial,
  sanpoMapMemberRemoveDialogCopy,
  sanpoMapMemberRoleLabel,
  splitSanpoMapMemberAvatars,
  toSanpoMapMemberRemoveErrorCode,
} from "@/features/pin/lib/sanpoMapMember";

describe("sanpoMapMemberDisplayName", () => {
  it("表示名があればそのまま、未設定・空白だけなら「メンバー」にする", () => {
    expect(sanpoMapMemberDisplayName({ displayName: "山田 太郎" })).toBe("山田 太郎");
    expect(sanpoMapMemberDisplayName({ displayName: null })).toBe("メンバー");
    expect(sanpoMapMemberDisplayName({ displayName: "  " })).toBe("メンバー");
  });
});

describe("sanpoMapMemberInitial", () => {
  it("先頭の1文字を返し、サロゲートペアを割らない", () => {
    expect(sanpoMapMemberInitial({ displayName: "山田" })).toBe("山");
    expect(sanpoMapMemberInitial({ displayName: "𠮷田" })).toBe("𠮷");
    expect(sanpoMapMemberInitial({ displayName: null })).toBe("メ");
  });
});

describe("sanpoMapMemberRoleLabel / formatSanpoMapMemberCount", () => {
  it("役割と人数を画面の表記にする", () => {
    expect(sanpoMapMemberRoleLabel("owner")).toBe("オーナー");
    expect(sanpoMapMemberRoleLabel("editor")).toBe("メンバー");
    expect(formatSanpoMapMemberCount(3)).toBe("メンバー 3人");
  });
});

describe("splitSanpoMapMemberAvatars", () => {
  it("上限までを並べ、超えた人数を overflow にする", () => {
    const members = Array.from({ length: SANPO_MAP_MEMBER_AVATAR_MAX + 2 }, (_, i) => i);
    expect(splitSanpoMapMemberAvatars(members)).toEqual({
      shown: members.slice(0, SANPO_MAP_MEMBER_AVATAR_MAX),
      overflow: 2,
    });
    expect(splitSanpoMapMemberAvatars([1, 2])).toEqual({ shown: [1, 2], overflow: 0 });
  });
});

describe("canShowSanpoMapMembers", () => {
  it("フラグが ON なら役割に関係なく出す", () => {
    expect(canShowSanpoMapMembers({ mapInvitationEnabled: true, role: "owner" })).toBe(true);
  });

  it("フラグが OFF でも、自分が editor の地図なら抜けられるように出す", () => {
    expect(canShowSanpoMapMembers({ mapInvitationEnabled: false, role: "editor" })).toBe(true);
    expect(canShowSanpoMapMembers({ mapInvitationEnabled: false, role: "owner" })).toBe(false);
  });
});

describe("canRemoveSanpoMapMember", () => {
  it("owner が見ている自分以外の行だけに「外す」を出す", () => {
    const base = { viewerUserId: "me", member: { userId: "other" } };
    expect(canRemoveSanpoMapMember({ ...base, viewerRole: "owner" })).toBe(true);
    expect(canRemoveSanpoMapMember({ ...base, viewerRole: "editor" })).toBe(false);
    expect(
      canRemoveSanpoMapMember({
        viewerRole: "owner",
        viewerUserId: "me",
        member: { userId: "me" },
      }),
    ).toBe(false);
    expect(canRemoveSanpoMapMember({ ...base, viewerRole: "owner", viewerUserId: null })).toBe(
      false,
    );
  });
});

describe("toSanpoMapMemberRemoveErrorCode", () => {
  it("HTTP の状態と通信の失敗を分類する", () => {
    expect(toSanpoMapMemberRemoveErrorCode(new ApiError(401))).toBe("unauthorized");
    expect(toSanpoMapMemberRemoveErrorCode(new ApiError(403))).toBe("forbidden");
    expect(toSanpoMapMemberRemoveErrorCode(new ApiError(409))).toBe("owner_cannot_leave");
    expect(toSanpoMapMemberRemoveErrorCode(new ApiError(422))).toBe("invalid_request");
    expect(toSanpoMapMemberRemoveErrorCode(new ApiError(503))).toBe("server");
    expect(toSanpoMapMemberRemoveErrorCode(new TypeError("network"))).toBe("network");
    expect(toSanpoMapMemberRemoveErrorCode(new Error("x"))).toBe("unknown");
  });

  it("再試行して意味がある失敗のときだけ実行ボタンを残す", () => {
    expect(canRetrySanpoMapMemberRemove(null)).toBe(true);
    expect(canRetrySanpoMapMemberRemove("network")).toBe(true);
    expect(canRetrySanpoMapMemberRemove("forbidden")).toBe(false);
  });
});

describe("sanpoMapMemberRemoveDialogCopy", () => {
  it("抜けるときは、追加したものが地図に残ることを伝える", () => {
    const copy = sanpoMapMemberRemoveDialogCopy({
      mode: "leave",
      sanpoMapName: "おすすめランチ",
      memberName: "自分",
    });
    expect(copy.title).toBe("「おすすめランチ」から抜けますか？");
    expect(copy.description).toContain("地図に残ります");
    expect(copy.confirmLabel).toBe("抜ける");
  });

  it("外すときは相手の名前を出す", () => {
    const copy = sanpoMapMemberRemoveDialogCopy({
      mode: "remove",
      sanpoMapName: "おすすめランチ",
      memberName: "山田",
    });
    expect(copy.title).toBe("山田さんを外しますか？");
    expect(copy.confirmLabel).toBe("外す");
  });
});
