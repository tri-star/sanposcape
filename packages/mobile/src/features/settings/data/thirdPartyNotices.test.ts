import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { THIRD_PARTY_NOTICES } from "@/features/settings/data/thirdPartyNotices";

const asset = (path: string) => readFileSync(join(__dirname, "../../../../assets", path), "utf8");

describe("THIRD_PARTY_NOTICES", () => {
  it("Noto Emoji のライセンス本文が assets の原文と一致する", () => {
    const noto = THIRD_PARTY_NOTICES.find((notice) => notice.name === "Noto Emoji");
    expect(noto?.licenses.map((license) => license.text)).toEqual([
      asset("sanpo-map-icons/LICENSE-Apache-2.0.txt"),
      asset("sanpo-map-icons/LICENSE-OFL-1.1.txt"),
    ]);
  });

  it("どの素材も著作権表示と1つ以上のライセンスを持つ", () => {
    for (const notice of THIRD_PARTY_NOTICES) {
      expect(notice.copyright.length).toBeGreaterThan(0);
      expect(notice.licenses.length).toBeGreaterThan(0);
    }
  });
});
