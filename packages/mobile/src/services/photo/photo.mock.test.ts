import { describe, expect, it } from "vitest";

import { isPhotoError } from "@/services/photo/photoError";
import {
  MOCK_PICKED_PHOTO,
  MOCK_PREPARED_BYTE_SIZE,
  MOCK_PREPARED_URI,
  MOCK_TAKEN_AT,
  createMockPhotoService,
  mockJpegBytes,
} from "@/services/photo/photo.mock";
import type { UploadFileBody } from "@/services/photo/types";

/** `UploadFileBody` の中身を読む（Blob と `bytes()` を持つ実装の両方）。 */
async function readUploadFile(file: UploadFileBody): Promise<Uint8Array> {
  if (file instanceof Blob) {
    return new Uint8Array(await file.arrayBuffer());
  }
  return file.bytes();
}

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

  it("takenAt: 既定は MOCK_TAKEN_AT、null 指定で撮影日時なし", async () => {
    const [byDefault] = await createMockPhotoService().pickPhotos({
      source: "library",
      selectionLimit: 0,
    });
    expect(byDefault?.takenAt).toBe(MOCK_TAKEN_AT);
    const [none] = await createMockPhotoService({ takenAt: null }).pickPhotos({
      source: "library",
      selectionLimit: 0,
    });
    expect(none?.takenAt).toBeNull();
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

    expect(result).toMatchObject({
      uri: MOCK_PREPARED_URI,
      width: 2048,
      height: 1536,
      byteSize: MOCK_PREPARED_BYTE_SIZE,
      mimeType: "image/jpeg",
    });
    // 直送に載せる実体は `bytes()` を持つ実装であること（`{ uri, name, type }` だと Expo の fetch が
    // 送信前に落ちる。SS-88 の回帰。RN の Blob は Uint8Array から作れないので Blob にもしない）。
    expect(result.file).not.toBeInstanceOf(Blob);
    expect(result.file).toMatchObject({ name: "mock-photo.jpg", type: "image/jpeg" });
    expect(result.file).not.toHaveProperty("uri");
  });

  it("実体は本物の JPEG で、長さは既定の byteSize と一致する（SS-123）", async () => {
    const result = await createMockPhotoService().prepareForUpload(MOCK_PICKED_PHOTO);
    const bytes = await readUploadFile(result.file);

    expect(bytes.length).toBe(result.byteSize);
    // SOI（FF D8）で始まり EOI（FF D9）で終わる
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    expect([bytes[bytes.length - 2], bytes[bytes.length - 1]]).toEqual([0xff, 0xd9]);
    // 表示用の data URI と同じ中身
    expect(MOCK_PREPARED_URI.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(bytes).toEqual(mockJpegBytes());
  });

  it("bytes() を呼ぶたびに別の配列を返す（送信側が書き換えても埋め込みの値が壊れない）", async () => {
    const result = await createMockPhotoService().prepareForUpload(MOCK_PICKED_PHOTO);
    const first = await readUploadFile(result.file);
    first[0] = 0;
    const second = await readUploadFile(result.file);
    expect(second[0]).toBe(0xff);
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
