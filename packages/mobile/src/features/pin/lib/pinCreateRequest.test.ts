import { describe, expect, it } from "vitest";

import { buildPinCreateRequest } from "@/features/pin/lib/pinCreateRequest";
import { PIN_NAME_MAX_LENGTH, PIN_PHOTOS_PER_REQUEST_MAX } from "@/features/pin/lib/pinLimits";
import type { PinDraft } from "@/features/pin/types";

const CLIENT_PIN_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_WALK_ID = "22222222-2222-4222-8222-222222222222";
const LOCATION = { latitude: 35.6812361234, longitude: 139.7671251234 };

const BASE_DRAFT: PinDraft = {
  name: "",
  memo: "",
  tags: [],
  sanpoMapSelection: { kind: "default" },
};

describe("buildPinCreateRequest", () => {
  it("最小入力: sanpo_map_id / client_walk_id のキーが存在しない", () => {
    const result = buildPinCreateRequest({
      clientPinId: CLIENT_PIN_ID,
      draft: BASE_DRAFT,
      location: LOCATION,
      photoUploadIds: [],
      clientWalkId: null,
    });

    expect(result).not.toBeNull();
    expect("sanpo_map_id" in result!).toBe(false);
    expect("client_walk_id" in result!).toBe(false);
    expect(result).toMatchObject({
      client_pin_id: CLIENT_PIN_ID,
      name: null,
      memo: null,
      tags: [],
      photo_upload_ids: [],
    });
  });

  it("座標は小数6桁に丸める", () => {
    const result = buildPinCreateRequest({
      clientPinId: CLIENT_PIN_ID,
      draft: BASE_DRAFT,
      location: LOCATION,
      photoUploadIds: [],
      clientWalkId: null,
    });
    expect(result?.location).toEqual({ latitude: 35.681236, longitude: 139.767125 });
  });

  it("existing 選択なら sanpo_map_id を送る", () => {
    const result = buildPinCreateRequest({
      clientPinId: CLIENT_PIN_ID,
      draft: { ...BASE_DRAFT, sanpoMapSelection: { kind: "existing", sanpoMapId: "map-1" } },
      location: LOCATION,
      photoUploadIds: [],
      clientWalkId: null,
    });
    expect(result?.sanpo_map_id).toBe("map-1");
  });

  it("clientWalkId が UUID なら client_walk_id を送る", () => {
    const result = buildPinCreateRequest({
      clientPinId: CLIENT_PIN_ID,
      draft: BASE_DRAFT,
      location: LOCATION,
      photoUploadIds: [],
      clientWalkId: CLIENT_WALK_ID,
    });
    expect(result?.client_walk_id).toBe(CLIENT_WALK_ID);
  });

  it("name / memo は trim される", () => {
    const result = buildPinCreateRequest({
      clientPinId: CLIENT_PIN_ID,
      draft: { ...BASE_DRAFT, name: "  桜  ", memo: "  メモ  " },
      location: LOCATION,
      photoUploadIds: [],
      clientWalkId: null,
    });
    expect(result?.name).toBe("桜");
    expect(result?.memo).toBe("メモ");
  });

  it("photo_upload_ids は渡された順で入る", () => {
    const result = buildPinCreateRequest({
      clientPinId: CLIENT_PIN_ID,
      draft: BASE_DRAFT,
      location: LOCATION,
      photoUploadIds: ["up-1", "up-2"],
      clientWalkId: null,
    });
    expect(result?.photo_upload_ids).toEqual(["up-1", "up-2"]);
  });

  it("不正座標は null", () => {
    const result = buildPinCreateRequest({
      clientPinId: CLIENT_PIN_ID,
      draft: BASE_DRAFT,
      location: { latitude: Number.NaN, longitude: 0 },
      photoUploadIds: [],
      clientWalkId: null,
    });
    expect(result).toBeNull();
  });

  it("clientPinId が UUID でなければ null", () => {
    const result = buildPinCreateRequest({
      clientPinId: "not-a-uuid",
      draft: BASE_DRAFT,
      location: LOCATION,
      photoUploadIds: [],
      clientWalkId: null,
    });
    expect(result).toBeNull();
  });

  it(`photoUploadIds が ${PIN_PHOTOS_PER_REQUEST_MAX + 1} 件だと null`, () => {
    const result = buildPinCreateRequest({
      clientPinId: CLIENT_PIN_ID,
      draft: BASE_DRAFT,
      location: LOCATION,
      photoUploadIds: Array.from({ length: PIN_PHOTOS_PER_REQUEST_MAX + 1 }, (_, i) => `up-${i}`),
      clientWalkId: null,
    });
    expect(result).toBeNull();
  });

  it(`名前が ${PIN_NAME_MAX_LENGTH + 1} 文字だと null`, () => {
    const result = buildPinCreateRequest({
      clientPinId: CLIENT_PIN_ID,
      draft: { ...BASE_DRAFT, name: "あ".repeat(PIN_NAME_MAX_LENGTH + 1) },
      location: LOCATION,
      photoUploadIds: [],
      clientWalkId: null,
    });
    expect(result).toBeNull();
  });
});
