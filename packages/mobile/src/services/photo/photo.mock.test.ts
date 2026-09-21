import { describe, expect, it } from "vitest";

import { isPhotoError } from "@/services/photo/photoError";
import {
  MOCK_PICKED_PHOTO,
  MOCK_PREPARED_BYTE_SIZE,
  createMockPhotoService,
} from "@/services/photo/photo.mock";

describe("createMockPhotoService.pickPhotos", () => {
  it("library: selectionLimit で頭打ちになる", async () => {
    const service = createMockPhotoService({ count: 3 });
    const result = await service.pickPhotos({ source: "library", selectionLimit: 2 });
    expect(result).toHaveLength(2);
  });

  it("library: selectionLimit=0 は上限なし（count 全件）", async () => {
    const service = createMockPhotoService({ count: 3 });
    const result = await service.pickPhotos({ source: "library", selectionLimit: 0 });
    expect(result).toHaveLength(3);
    const uris = result.map((p) => p.uri);
    expect(new Set(uris).size).toBe(3);
  });

  it("camera: 常に1枚（count に関わらず）", async () => {
    const service = createMockPhotoService({ count: 3 });
    const result = await service.pickPhotos({ source: "camera", selectionLimit: 1 });
    expect(result).toHaveLength(1);
  });

  it("cancel: 空配列を返す（エラーにしない）", async () => {
    const service = createMockPhotoService({ cancel: true });
    const result = await service.pickPhotos({ source: "library", selectionLimit: 0 });
    expect(result).toEqual([]);
  });

  it("pickFailWith: 指定した PhotoErrorCode を throw する", async () => {
    const service = createMockPhotoService({ pickFailWith: "permission_denied" });
    await expect(service.pickPhotos({ source: "camera", selectionLimit: 1 })).rejects.toSatisfy(
      (error: unknown) => isPhotoError(error) && error.code === "permission_denied",
    );
  });
});

describe("createMockPhotoService.prepareForUpload", () => {
  it("既定では 2048x1536・image/jpeg・既定バイト数を返す", async () => {
    const service = createMockPhotoService();
    const result = await service.prepareForUpload(MOCK_PICKED_PHOTO);

    expect(result).toEqual({
      uri: MOCK_PICKED_PHOTO.uri,
      width: 2048,
      height: 1536,
      byteSize: MOCK_PREPARED_BYTE_SIZE,
      mimeType: "image/jpeg",
    });
  });

  it("preparedByteSize を指定するとその値が返る", async () => {
    const service = createMockPhotoService({ preparedByteSize: 12_000_000 });
    const result = await service.prepareForUpload(MOCK_PICKED_PHOTO);
    expect(result.byteSize).toBe(12_000_000);
  });

  it("prepareFailWith: 指定した PhotoErrorCode を throw する", async () => {
    const service = createMockPhotoService({ prepareFailWith: "processing_failed" });
    await expect(service.prepareForUpload(MOCK_PICKED_PHOTO)).rejects.toSatisfy(
      (error: unknown) => isPhotoError(error) && error.code === "processing_failed",
    );
  });
});
