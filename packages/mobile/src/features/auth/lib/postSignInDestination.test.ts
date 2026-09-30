import { describe, expect, it } from "vitest";

import {
  getGuestEntryDestination,
  getPostSignInDestination,
} from "@/features/auth/lib/postSignInDestination";

describe("getPostSignInDestination", () => {
  it("進行中の散歩・保存意思表示のいずれも無ければピンタブへ replace する（SS-145）", () => {
    expect(
      getPostSignInDestination({
        hasActiveWalk: false,
        wantsToSaveFinishedWalk: false,
        canGoBack: false,
      }),
    ).toEqual({ type: "replace", href: "/(tabs)/pins" });
  });

  it("進行中の散歩があれば ナビタブ（/(tabs)）へ replace する（無警告での上書きを防ぐ。SS-57 ローカルレビュー対応）", () => {
    expect(
      getPostSignInDestination({
        hasActiveWalk: true,
        wantsToSaveFinishedWalk: false,
        canGoBack: false,
      }),
    ).toEqual({ type: "replace", href: "/(tabs)" });
  });

  it("サマリの CTA から来た保存意思表示があればサマリ画面へ dismissTo する（SS-37）", () => {
    expect(
      getPostSignInDestination({
        hasActiveWalk: false,
        wantsToSaveFinishedWalk: true,
        canGoBack: false,
      }),
    ).toEqual({ type: "dismissTo", href: "/walk-summary" });
  });

  it("進行中の散歩と保存意思表示が両方あれば進行中の散歩を優先する", () => {
    expect(
      getPostSignInDestination({
        hasActiveWalk: true,
        wantsToSaveFinishedWalk: true,
        canGoBack: false,
      }),
    ).toEqual({ type: "replace", href: "/(tabs)" });
  });

  it("保存意思表示が無ければ、保存待ちドラフトの有無にかかわらずサマリへは連れて行かない（SS-37 ローカルレビュー Security High 対応）", () => {
    // 共有端末で無関係な導線（設定画面など）からサインインしたケースを表す。
    // `wantsToSaveFinishedWalk` は「保存待ちドラフトがある」だけでなく「CTA 経由の意思表示がある」
    // ことも含む値なので、意思表示が無い場合は false として渡ってくる想定。
    expect(
      getPostSignInDestination({
        hasActiveWalk: false,
        wantsToSaveFinishedWalk: false,
        canGoBack: false,
      }),
    ).toEqual({ type: "replace", href: "/(tabs)/pins" });
  });
});

describe("canGoBack（サインイン画面の下に (tabs) 等がある場合。SS-146）", () => {
  it("戻れるなら ピンタブへ dismissTo する（(tabs) を二重に積まない）", () => {
    expect(
      getPostSignInDestination({
        hasActiveWalk: false,
        wantsToSaveFinishedWalk: false,
        canGoBack: true,
      }),
    ).toEqual({ type: "dismissTo", href: "/(tabs)/pins" });
  });

  it("戻れて進行中の散歩があれば ナビタブへ dismissTo する", () => {
    expect(
      getPostSignInDestination({
        hasActiveWalk: true,
        wantsToSaveFinishedWalk: false,
        canGoBack: true,
      }),
    ).toEqual({ type: "dismissTo", href: "/(tabs)" });
  });

  it("保存意思表示があればサマリへの dismissTo は canGoBack に依らない", () => {
    expect(
      getPostSignInDestination({
        hasActiveWalk: false,
        wantsToSaveFinishedWalk: true,
        canGoBack: true,
      }),
    ).toEqual({ type: "dismissTo", href: "/walk-summary" });
  });
});

describe("getGuestEntryDestination", () => {
  it("進行中の散歩が無ければピンタブへ replace（戻れない場合）", () => {
    expect(getGuestEntryDestination({ hasActiveWalk: false, canGoBack: false })).toEqual({
      type: "replace",
      href: "/(tabs)/pins",
    });
  });

  it("進行中の散歩があればナビタブへ replace（戻れない場合）", () => {
    expect(getGuestEntryDestination({ hasActiveWalk: true, canGoBack: false })).toEqual({
      type: "replace",
      href: "/(tabs)",
    });
  });

  it("戻れる場合は dismissTo（(tabs) の二重化を防ぐ）", () => {
    expect(getGuestEntryDestination({ hasActiveWalk: false, canGoBack: true })).toEqual({
      type: "dismissTo",
      href: "/(tabs)/pins",
    });
    expect(getGuestEntryDestination({ hasActiveWalk: true, canGoBack: true })).toEqual({
      type: "dismissTo",
      href: "/(tabs)",
    });
  });
});

describe("着地点の回帰防止", () => {
  it("どの入力でも /walk-start を返さない", () => {
    for (const hasActiveWalk of [false, true]) {
      for (const wantsToSaveFinishedWalk of [false, true]) {
        expect(
          getPostSignInDestination({ hasActiveWalk, wantsToSaveFinishedWalk, canGoBack: false })
            .href,
        ).not.toBe("/walk-start");
      }
      expect(getGuestEntryDestination({ hasActiveWalk, canGoBack: false }).href).not.toBe(
        "/walk-start",
      );
    }
  });
});
