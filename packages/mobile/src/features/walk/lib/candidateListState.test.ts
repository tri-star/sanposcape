import { describe, expect, it } from "vitest";

import { isCandidateListLoading } from "@/features/walk/lib/candidateListState";

describe("isCandidateListLoading", () => {
  it("測位中（現在地未確定・位置情報エラーなし）はローディングにする", () => {
    // 回帰: ここを false にすると探索前に「見つかりませんでした」の空状態が出てしまう。
    expect(
      isCandidateListLoading({
        isExploreLoading: false,
        hasOrigin: false,
        hasLocationError: false,
      }),
    ).toBe(true);
  });

  it("位置情報エラー時はローディングにしない（権限通知UIに委ねる）", () => {
    expect(
      isCandidateListLoading({
        isExploreLoading: false,
        hasOrigin: false,
        hasLocationError: true,
      }),
    ).toBe(false);
  });

  it("探索の初回取得中はローディングにする", () => {
    expect(
      isCandidateListLoading({
        isExploreLoading: true,
        hasOrigin: true,
        hasLocationError: false,
      }),
    ).toBe(true);
  });

  it("現在地が確定し探索も終わっていればローディングにしない（空状態や一覧を出す）", () => {
    expect(
      isCandidateListLoading({
        isExploreLoading: false,
        hasOrigin: true,
        hasLocationError: false,
      }),
    ).toBe(false);
  });

  it("探索中は位置情報エラーの有無に関わらずローディングを優先する", () => {
    expect(
      isCandidateListLoading({
        isExploreLoading: true,
        hasOrigin: false,
        hasLocationError: true,
      }),
    ).toBe(true);
  });
});
