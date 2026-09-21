import { describe, expect, it } from "vitest";

import { FIRST_SANPO_MAP_NAME } from "@/features/pin/lib/pinLimits";
import { resolveSanpoMapChoices } from "@/features/pin/lib/sanpoMapChoices";
import type { SanpoMap } from "@/features/pin/types";

const OWNED_DEFAULT: SanpoMap = {
  id: "map-default",
  name: "最初の地図",
  isDefault: true,
  role: "owner",
};
const OWNED_OTHER: SanpoMap = {
  id: "map-other",
  name: "おすすめランチ",
  isDefault: false,
  role: "owner",
};
const INVITED: SanpoMap = {
  id: "map-invited",
  name: "友達の地図",
  isDefault: false,
  role: "editor",
};

describe("resolveSanpoMapChoices", () => {
  it("loading: choices は空、helper あり", () => {
    const result = resolveSanpoMapChoices({
      status: "loading",
      maps: [],
      selection: { kind: "default" },
    });
    expect(result.status).toBe("loading");
    expect(result.choices).toEqual([]);
    expect(result.helper).not.toBeNull();
  });

  it("error: choices は空、helper あり", () => {
    const result = resolveSanpoMapChoices({
      status: "error",
      maps: [],
      selection: { kind: "default" },
    });
    expect(result.status).toBe("error");
    expect(result.choices).toEqual([]);
    expect(result.helper).not.toBeNull();
  });

  it("ready 0件: draft のみ・selected・helper あり", () => {
    const result = resolveSanpoMapChoices({
      status: "ready",
      maps: [],
      selection: { kind: "default" },
    });
    expect(result.choices).toEqual([
      {
        key: "default",
        label: FIRST_SANPO_MAP_NAME,
        isDraft: true,
        selection: { kind: "default" },
        selected: true,
      },
    ]);
    expect(result.helper).toContain(FIRST_SANPO_MAP_NAME);
  });

  it("既定地図 + 他: 既定地図が selected、draft は無い", () => {
    const result = resolveSanpoMapChoices({
      status: "ready",
      maps: [OWNED_DEFAULT, OWNED_OTHER],
      selection: { kind: "default" },
    });
    expect(result.choices).toHaveLength(2);
    expect(result.choices[0]).toEqual({
      key: OWNED_DEFAULT.id,
      label: OWNED_DEFAULT.name,
      isDraft: false,
      selection: { kind: "default" },
      selected: true,
    });
    expect(result.choices[1]?.selected).toBe(false);
    expect(result.helper).toBeNull();
  });

  it("existing(他) を選択すると該当の地図が selected になる", () => {
    const result = resolveSanpoMapChoices({
      status: "ready",
      maps: [OWNED_DEFAULT, OWNED_OTHER],
      selection: { kind: "existing", sanpoMapId: OWNED_OTHER.id },
    });
    expect(result.choices.find((c) => c.key === OWNED_OTHER.id)?.selected).toBe(true);
    expect(result.choices.find((c) => c.key === OWNED_DEFAULT.id)?.selected).toBe(false);
  });

  it("editor の地図だけ（自分の既定地図が無い）: draft が先頭", () => {
    const result = resolveSanpoMapChoices({
      status: "ready",
      maps: [INVITED],
      selection: { kind: "default" },
    });
    expect(result.choices[0]).toMatchObject({ key: "default", isDraft: true, selected: true });
    expect(result.choices[1]).toMatchObject({ key: INVITED.id, isDraft: false, selected: false });
  });

  it("消えた existing の id は default 扱いに戻る", () => {
    const result = resolveSanpoMapChoices({
      status: "ready",
      maps: [OWNED_DEFAULT],
      selection: { kind: "existing", sanpoMapId: "deleted-map" },
    });
    expect(result.choices.find((c) => c.key === OWNED_DEFAULT.id)?.selected).toBe(true);
  });
});
