import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { getCreatePinPhotoUploadMockHandler } from "@/api/generated/endpoints/pins/pins.msw";
import type { PinPhotoUploadRead } from "@/api/generated/model";
import { transferPinPhoto } from "@/features/pin/api/pinPhotoTransfer";
import type { PreparedPhoto } from "@/services/photo/types";
import { server } from "@/test/setup";

const APP_API_BASE_URL = "http://localhost:8000";
const S3_URL = "https://sanposcape-dev-pin-photos.s3.ap-southeast-1.amazonaws.com/";

function ticket(maxByteSize: number): PinPhotoUploadRead {
  return {
    upload_id: "66666666-6666-4666-8666-666666666666",
    upload: { url: S3_URL, fields: { key: "staging/pins/u1/x.jpg" } },
    expires_at: "2026-01-01T00:10:00.000Z",
    max_byte_size: maxByteSize,
  };
}

const PREPARED: PreparedPhoto = {
  uri: "file:///tmp/a.jpg",
  width: 2048,
  height: 1536,
  byteSize: 500_000,
  mimeType: "image/jpeg",
};

describe("transferPinPhoto", () => {
  it("成功すると uploadId を返す", async () => {
    server.use(getCreatePinPhotoUploadMockHandler(ticket(10 * 1024 * 1024)));
    server.use(http.post(S3_URL, () => new HttpResponse(null, { status: 204 })));

    const uploadId = await transferPinPhoto(
      { localId: "local-1", prepared: PREPARED },
      { apiBaseUrl: APP_API_BASE_URL },
    );

    expect(uploadId).toBe("66666666-6666-4666-8666-666666666666");
  });

  it("maxByteSize 超過は直送せずに ApiError(413)", async () => {
    let s3Called = false;
    server.use(getCreatePinPhotoUploadMockHandler(ticket(100)));
    server.use(
      http.post(S3_URL, () => {
        s3Called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(
      transferPinPhoto(
        { localId: "local-1", prepared: PREPARED },
        { apiBaseUrl: APP_API_BASE_URL },
      ),
    ).rejects.toThrow(ApiError);
    expect(s3Called).toBe(false);
  });

  it("枠発行 429 は ApiError(429) のまま投げる", async () => {
    server.use(http.post("*/pin-photo-uploads", () => new HttpResponse(null, { status: 429 })));

    await expect(
      transferPinPhoto(
        { localId: "local-1", prepared: PREPARED },
        { apiBaseUrl: APP_API_BASE_URL },
      ),
    ).rejects.toThrow(ApiError);
  });
});
