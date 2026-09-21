import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { getCreatePinPhotoUploadMockHandler } from "@/api/generated/endpoints/pins/pins.msw";
import type { PinPhotoUploadCreate, PinPhotoUploadRead } from "@/api/generated/model";
import { requestPinPhotoUpload } from "@/features/pin/api/pinPhotoUploadApi";
import { server } from "@/test/setup";

const RESPONSE: PinPhotoUploadRead = {
  upload_id: "55555555-5555-4555-8555-555555555555",
  upload: {
    url: "https://sanposcape-dev-pin-photos.s3.ap-southeast-1.amazonaws.com/",
    fields: {
      key: "staging/pins/u1/x.jpg",
      policy: "abc",
      "x-amz-signature": "sig",
    },
  },
  expires_at: "2026-01-01T00:10:00.000Z",
  max_byte_size: 10 * 1024 * 1024,
};

describe("requestPinPhotoUpload", () => {
  it("201 で ticket（fields の順序・maxByteSize）に変換される", async () => {
    server.use(getCreatePinPhotoUploadMockHandler(RESPONSE));

    const result = await requestPinPhotoUpload({ byteSize: 500_000, mimeType: "image/jpeg" });

    expect(result).toEqual({
      uploadId: RESPONSE.upload_id,
      url: RESPONSE.upload.url,
      fields: [
        ["key", "staging/pins/u1/x.jpg"],
        ["policy", "abc"],
        ["x-amz-signature", "sig"],
      ],
      expiresAt: RESPONSE.expires_at,
      maxByteSize: RESPONSE.max_byte_size,
    });
  });

  it("送信ボディが content_type と byte_size の2キーだけ", async () => {
    let receivedBody: PinPhotoUploadCreate | undefined;
    server.use(
      getCreatePinPhotoUploadMockHandler(async (info) => {
        receivedBody = (await info.request.json()) as PinPhotoUploadCreate;
        return RESPONSE;
      }),
    );

    await requestPinPhotoUpload({ byteSize: 500_000, mimeType: "image/jpeg" });

    expect(receivedBody).toEqual({ content_type: "image/jpeg", byte_size: 500_000 });
  });

  it.each([401, 409, 413, 422, 429, 503])("%d は ApiError(status) になる", async (status) => {
    server.use(http.post("*/pin-photo-uploads", () => new HttpResponse(null, { status })));

    try {
      await requestPinPhotoUpload({ byteSize: 500_000, mimeType: "image/jpeg" });
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
    }
  });

  it("fields に非文字列の値があると ApiError(502)", async () => {
    server.use(
      getCreatePinPhotoUploadMockHandler({
        ...RESPONSE,
        upload: { ...RESPONSE.upload, fields: { key: "ok", broken: 123 as unknown as string } },
      }),
    );

    await expect(
      requestPinPhotoUpload({ byteSize: 500_000, mimeType: "image/jpeg" }),
    ).rejects.toThrow(ApiError);
  });
});
