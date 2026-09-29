import { describe, expect, it } from "vitest";

import {
  getGuestEntryDestination,
  getPostSignInDestination,
} from "@/features/auth/lib/postSignInDestination";

describe("getPostSignInDestination", () => {
  it("進行中の散歩・保存意思表示のいずれも無ければピンタブへ replace する（SS-145）", () => {
    expect(
      getPostSignInDestination({ hasActiveWalk: false, wantsToSaveFinishedWalk: false }),
    ).toEqual({ type: "replace", href: "/(tabs)/pins" });
  });

  it("進行中の散歩があれば ナビタブ（/(tabs)）へ replace する（無警告での上書きを防ぐ。SS-57 ローカルレビュー対応）", () => {
    expect(
      getPostSignInDestination({ hasActiveWalk: true, wantsToSaveFinishedWalk: false }),
    ).toEqual({ type: "replace", href: "/(tabs)" });
  });

  it("サマリの CTA から来た保存意思表示があればサマリ画面へ dismissTo する（SS-37）", () => {
    expect(
      getPostSignInDestination({ hasActiveWalk: false, wantsToSaveFinishedWalk: true }),
    ).toEqual({ type: "dismissTo", href: "/walk-summary" });
  });

  it("進行中の散歩と保存意思表示が両方あれば進行中の散歩を優先する", () => {
    expect(
      getPostSignInDestination({ hasActiveWalk: true, wantsToSaveFinishedWalk: true }),
    ).toEqual({ type: "replace", href: "/(tabs)" });
  });

  it("保存意思表示が無ければ、保存待ちドラフトの有無にかかわらずサマリへは連れて行かない（SS-37 ローカルレビュー Security High 対応）", () => {
    // 共有端末で無関係な導線（設定画面など）からサインインしたケースを表す。
    // `wantsToSaveFinishedWalk` は「保存待ちドラフトがある」だけでなく「CTA 経由の意思表示がある」
    // ことも含む値なので、意思表示が無い場合は false として渡ってくる想定。
    expect(
      getPostSignInDestination({ hasActiveWalk: false, wantsToSaveFinishedWalk: false }),
    ).toEqual({ type: "replace", href: "/(tabs)/pins" });
  });
});

describe("getGuestEntryDestination", () => {
  it("進行中の散歩が無ければピンタブ", () => {
    expect(getGuestEntryDestination({ hasActiveWalk: false })).toBe("/(tabs)/pins");
  });

  it("進行中の散歩があればナビタブ", () => {
    expect(getGuestEntryDestination({ hasActiveWalk: true })).toBe("/(tabs)");
  });
});

describe("着地点の回帰防止", () => {
  it("どの入力でも /walk-start を返さない", () => {
    for (const hasActiveWalk of [false, true]) {
      for (const wantsToSaveFinishedWalk of [false, true]) {
        expect(getPostSignInDestination({ hasActiveWalk, wantsToSaveFinishedWalk }).href).not.toBe(
          "/walk-start",
        );
      }
      expect(getGuestEntryDestination({ hasActiveWalk })).not.toBe("/walk-start");
    }
  });
});
