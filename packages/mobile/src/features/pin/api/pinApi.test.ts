import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  getAddPinPhotosMockHandler,
  getCreatePinMockHandler,
} from "@/api/generated/endpoints/pins/pins.msw";
import type { PinCreate, PinPhotoRead, PinPhotosAdd, PinRead } from "@/api/generated/model";
import { addPinPhotos, createPin } from "@/features/pin/api/pinApi";
import { server } from "@/test/setup";

const PIN_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_PIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "44444444-4444-4444-8444-444444444444";

function photo(uploadId: string, position: number): PinPhotoRead {
  return {
    id: `photo-${position}`,
    upload_id: uploadId,
    position,
    width: 2048,
    height: 1536,
    byte_size: 500_000,
    content_type: "image/jpeg",
    thumbnail: null,
    original_url: null,
    urls_expire_at: "2026-01-01T01:00:00.000Z",
    uploaded_by_user_id: USER_ID,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

const REQUEST: PinCreate = {
  client_pin_id: CLIENT_PIN_ID,
  location: { latitude: 35.681236, longitude: 139.767125 },
  tags: [],
  photo_upload_ids: ["up-1", "up-2"],
};

const PIN_READ: PinRead = {
  id: PIN_ID,
  client_pin_id: CLIENT_PIN_ID,
  sanpo_map: { id: "map-1", name: "最初の地図", is_default: true },
  name: null,
  memo: null,
  location: REQUEST.location,
  tags: [],
  photos: [photo("up-1", 0), photo("up-2", 1)],
  photo_count: 2,
  created_by_user_id: USER_ID,
  client_walk_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("createPin", () => {
  it("201（新規作成）で SavedPin と attachedUploadIds が返る", async () => {
    server.use(http.post("*/pins", () => HttpResponse.json(PIN_READ, { status: 201 })));

    const result = await createPin(REQUEST);

    expect(result.pin).toEqual({
      id: PIN_ID,
      sanpoMapId: "map-1",
      sanpoMapName: "最初の地図",
      photoCount: 2,
    });
    expect(result.attachedUploadIds).toEqual(["up-1", "up-2"]);
  });

  it("200（冪等再送）でも成功し、応答側の photos が優先される", async () => {
    const existingOnlyOne: PinRead = { ...PIN_READ, photos: [photo("up-1", 0)], photo_count: 1 };
    server.use(getCreatePinMockHandler(existingOnlyOne));

    const result = await createPin(REQUEST);

    // 送信した photo_upload_ids は ["up-1", "up-2"] だが、応答側の photos だけを見る。
    expect(result.attachedUploadIds).toEqual(["up-1"]);
  });

  it("送信ボディが sanpo_map_id を持たない（省略時）", async () => {
    let receivedBody: PinCreate | undefined;
    server.use(
      getCreatePinMockHandler(async (info) => {
        receivedBody = (await info.request.json()) as PinCreate;
        return PIN_READ;
      }),
    );

    await createPin(REQUEST);

    expect(receivedBody).toEqual(REQUEST);
    expect("sanpo_map_id" in (receivedBody as object)).toBe(false);
  });

  it("401 は呼び出し1回で ApiError", async () => {
    let callCount = 0;
    server.use(
      http.post("*/pins", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(createPin(REQUEST)).rejects.toThrow(ApiError);
    expect(callCount).toBe(1);
  });

  it.each([403, 404, 409, 413, 422, 503])("%d は ApiError になる", async (status) => {
    server.use(http.post("*/pins", () => new HttpResponse(null, { status })));

    try {
      await createPin(REQUEST);
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
    }
  });
});

describe("addPinPhotos", () => {
  it("200 で photoCount と attachedUploadIds が返る", async () => {
    server.use(getAddPinPhotosMockHandler({ items: [photo("up-3", 2)], photo_count: 3 }));

    const result = await addPinPhotos(PIN_ID, ["up-3"]);

    expect(result).toEqual({ photoCount: 3, attachedUploadIds: ["up-3"] });
  });

  it("送信ボディとパスが正しい", async () => {
    let receivedBody: PinPhotosAdd | undefined;
    let receivedPath: string | undefined;
    server.use(
      http.post("*/pins/:pinId/photos", async ({ request, params }) => {
        receivedBody = (await request.json()) as PinPhotosAdd;
        receivedPath = params.pinId as string;
        return HttpResponse.json({ items: [], photo_count: 0 }, { status: 200 });
      }),
    );

    await addPinPhotos(PIN_ID, ["up-1", "up-2"]);

    expect(receivedPath).toBe(PIN_ID);
    expect(receivedBody).toEqual({ photo_upload_ids: ["up-1", "up-2"] });
  });

  it.each([404, 409, 503])("%d は ApiError になる", async (status) => {
    server.use(http.post("*/pins/:pinId/photos", () => new HttpResponse(null, { status })));

    try {
      await addPinPhotos(PIN_ID, ["up-1"]);
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
    }
  });

  it("非UUIDのpinIdはfetchせずにApiError(422)", async () => {
    let called = false;
    server.use(
      http.post("*/pins/:pinId/photos", () => {
        called = true;
        return HttpResponse.json({ items: [], photo_count: 0 }, { status: 200 });
      }),
    );

    await expect(addPinPhotos("not-a-uuid", ["up-1"])).rejects.toThrow(ApiError);
    expect(called).toBe(false);
  });

  it("0件・11件はfetchせずにApiError(422)", async () => {
    await expect(addPinPhotos(PIN_ID, [])).rejects.toThrow(ApiError);
    await expect(
      addPinPhotos(
        PIN_ID,
        Array.from({ length: 11 }, (_, i) => `up-${i}`),
      ),
    ).rejects.toThrow(ApiError);
  });
});
