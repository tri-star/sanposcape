import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  canRetrySanpoMapDelete,
  sanpoMapDeleteConfirmLabel,
  sanpoMapDeleteDescription,
  sanpoMapDeletedMessage,
  sanpoMapDeleteErrorMessage,
  toSanpoMapDeleteErrorCode,
} from "@/features/pin/lib/map-deletion/sanpoMapDelete";

describe("toSanpoMapDeleteErrorCode", () => {
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [413, "invalid_request"],
    [422, "invalid_request"],
    [500, "server"],
    [503, "server"],
    [409, "unknown"],
  ] as const)("ApiError(%i) は %s", (status, code) => {
    expect(toSanpoMapDeleteErrorCode(new ApiError(status))).toBe(code);
  });

  it("TypeError（通信の失敗）は network", () => {
    expect(toSanpoMapDeleteErrorCode(new TypeError("Network request failed"))).toBe("network");
  });

  it("それ以外は unknown", () => {
    expect(toSanpoMapDeleteErrorCode(new Error("x"))).toBe("unknown");
  });
});

describe("canRetrySanpoMapDelete", () => {
  it("まだ失敗していなければ削除ボタンを出す", () => {
    expect(canRetrySanpoMapDelete(null)).toBe(true);
  });

  it.each(["network", "server", "unknown"] as const)("%s は再試行できる", (code) => {
    expect(canRetrySanpoMapDelete(code)).toBe(true);
  });

  it.each(["unauthorized", "forbidden", "invalid_request"] as const)(
    "%s は何度押しても同じなので再試行させない",
    (code) => {
      expect(canRetrySanpoMapDelete(code)).toBe(false);
    },
  );
});

describe("sanpoMapDeleteErrorMessage", () => {
  it("権限の失敗は権限が無いことを伝える", () => {
    expect(sanpoMapDeleteErrorMessage("forbidden")).toBe("この地図を削除する権限がありません。");
  });
});

describe("sanpoMapDeleteConfirmLabel", () => {
  it("実行中は進行中の文言にする", () => {
    expect(sanpoMapDeleteConfirmLabel(true)).toBe("削除しています…");
    expect(sanpoMapDeleteConfirmLabel(false)).toBe("削除する");
  });
});

describe("sanpoMapDeleteDescription", () => {
  const base = { pinCount: 3, otherMemberCount: null, sharingEnabled: false };

  it("ピンの件数と、写真・タグも消えて戻せないことを書く", () => {
    expect(sanpoMapDeleteDescription(base)).toEqual([
      "この地図のピン3件と、その写真・タグもすべて削除され、元に戻せません。",
    ]);
  });

  it("ピンが無ければ件数を書かない", () => {
    expect(sanpoMapDeleteDescription({ ...base, pinCount: 0 })).toEqual([
      "この操作は元に戻せません。",
    ]);
  });

  it("件数が不明なら件数を書かずにピンも消えることを書く", () => {
    expect(sanpoMapDeleteDescription({ ...base, pinCount: null })[0]).toBe(
      "この地図のピンと、その写真・タグもすべて削除され、元に戻せません。",
    );
  });

  it("ほかのメンバーがいれば人数と、見られなくなることを書く", () => {
    expect(
      sanpoMapDeleteDescription({ ...base, otherMemberCount: 2, sharingEnabled: true }),
    ).toEqual([
      "この地図のピン3件と、その写真・タグもすべて削除され、元に戻せません。",
      "ほかのメンバー2人もこの地図を見られなくなり、メンバーが追加したピン・写真も削除されます。",
      "この地図の招待のリンクも使えなくなります。",
    ]);
  });

  it("共有が使えてメンバーが自分だけなら、メンバーの文は書かず招待の文だけ書く", () => {
    expect(
      sanpoMapDeleteDescription({ ...base, otherMemberCount: 0, sharingEnabled: true }),
    ).toEqual([
      "この地図のピン3件と、その写真・タグもすべて削除され、元に戻せません。",
      "この地図の招待のリンクも使えなくなります。",
    ]);
  });

  it("共有が使えて人数が不明なら、メンバーがいる場合の扱いを条件付きで書く", () => {
    expect(sanpoMapDeleteDescription({ ...base, sharingEnabled: true })[1]).toBe(
      "メンバーがいる場合は、メンバーもこの地図を見られなくなり、メンバーが追加したピン・写真も削除されます。",
    );
  });

  it("共有が使えず人数も不明なら、メンバー・招待の文を書かない", () => {
    expect(sanpoMapDeleteDescription(base)).toHaveLength(1);
  });
});

describe("sanpoMapDeletedMessage", () => {
  it("地図の名前を入れる", () => {
    expect(sanpoMapDeletedMessage("近所の地図")).toBe("「近所の地図」を削除しました");
  });

  it("名前が分からなければ名前を入れない", () => {
    expect(sanpoMapDeletedMessage("")).toBe("地図を削除しました");
  });
});
