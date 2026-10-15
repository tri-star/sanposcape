import { describe, expect, it } from "vitest";

import {
  pinStatusAccessibilityLabels,
  registeredPinMarkerAccessibilityLabel,
  resolveInitialVisited,
  resolvePinStatusBadges,
} from "@/features/pin/lib/pinStatus";

const keysOf = (visited: boolean, archived: boolean, context: "detail" | "list") =>
  resolvePinStatusBadges({ visited, archived }, context).map((b) => b.key);

describe("resolvePinStatusBadges", () => {
  it("detail: 訪問状況は常に出し、アーカイブ済みなら後ろに足す", () => {
    expect(keysOf(false, false, "detail")).toEqual(["unvisited"]);
    expect(keysOf(true, false, "detail")).toEqual(["visited"]);
    expect(keysOf(false, true, "detail")).toEqual(["unvisited", "archived"]);
    expect(keysOf(true, true, "detail")).toEqual(["visited", "archived"]);
  });

  it("detail: tone は 訪問済み=success / 未訪問=neutral / アーカイブ済み=warning", () => {
    expect(resolvePinStatusBadges({ visited: false, archived: true }, "detail")).toEqual([
      { key: "unvisited", label: "未訪問", tone: "neutral" },
      { key: "archived", label: "アーカイブ済み", tone: "warning" },
    ]);
    expect(resolvePinStatusBadges({ visited: true, archived: false }, "detail")).toEqual([
      { key: "visited", label: "訪問済み", tone: "success" },
    ]);
  });

  it("list: 既定の状態（未訪問・未アーカイブ）は出さない", () => {
    expect(keysOf(false, false, "list")).toEqual([]);
    expect(keysOf(true, false, "list")).toEqual(["visited"]);
    expect(keysOf(false, true, "list")).toEqual(["archived"]);
    expect(keysOf(true, true, "list")).toEqual(["visited", "archived"]);
  });
});

describe("pinStatusAccessibilityLabels", () => {
  it("バッジのラベルと同じ内容・順序", () => {
    expect(pinStatusAccessibilityLabels({ visited: true, archived: true }, "list")).toEqual([
      "訪問済み",
      "アーカイブ済み",
    ]);
    expect(pinStatusAccessibilityLabels({ visited: false, archived: false }, "detail")).toEqual([
      "未訪問",
    ]);
    expect(pinStatusAccessibilityLabels({ visited: false, archived: false }, "list")).toEqual([]);
  });
});

describe("resolveInitialVisited", () => {
  it("散歩中の登録（clientWalkId あり）は true、ピンタブの長押し（なし）は false", () => {
    expect(resolveInitialVisited({ clientWalkId: "walk-1" })).toBe(true);
    expect(resolveInitialVisited({ clientWalkId: null })).toBe(false);
  });
});

describe("registeredPinMarkerAccessibilityLabel", () => {
  it("アーカイブ済みでなければ名前だけ", () => {
    expect(registeredPinMarkerAccessibilityLabel({ name: "桜の木", archived: false })).toBe(
      "桜の木の詳細を開く",
    );
  });

  it("アーカイブ済みなら名前の直後に状態を入れる。名前が無ければ表示名を使う", () => {
    expect(registeredPinMarkerAccessibilityLabel({ name: "桜の木", archived: true })).toBe(
      "桜の木（アーカイブ済み）の詳細を開く",
    );
    expect(registeredPinMarkerAccessibilityLabel({ name: null, archived: true })).toBe(
      "名前のないピン（アーカイブ済み）の詳細を開く",
    );
  });
});
