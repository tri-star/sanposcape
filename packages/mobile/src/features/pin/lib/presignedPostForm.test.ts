import { describe, expect, it } from "vitest";

import {
  buildPresignedPostFormEntries,
  isAllowedUploadUrl,
  uploadFileName,
} from "@/features/pin/lib/presignedPostForm";
import type { UploadFilePart } from "@/features/pin/lib/presignedPostForm";

const FILE: UploadFilePart = { uri: "file:///tmp/a.jpg", name: "a.jpg", type: "image/jpeg" };

describe("buildPresignedPostFormEntries", () => {
  it("fields の順を保ち、最後に file を置く", () => {
    const entries = buildPresignedPostFormEntries(
      [
        ["key", "staging/pins/u1/x.jpg"],
        ["policy", "abc"],
        ["x-amz-signature", "sig"],
      ],
      FILE,
    );
    expect(entries).toEqual([
      { name: "key", value: "staging/pins/u1/x.jpg" },
      { name: "policy", value: "abc" },
      { name: "x-amz-signature", value: "sig" },
      { name: "file", file: FILE },
    ]);
  });

  it("fields 中の file / acl / X-Amz-Acl（大小無視）を除外する", () => {
    const entries = buildPresignedPostFormEntries(
      [
        ["key", "k"],
        ["acl", "public-read"],
        ["X-Amz-Acl", "private"],
        ["file", "should-be-ignored"],
      ],
      FILE,
    );
    expect(entries).toEqual([
      { name: "key", value: "k" },
      { name: "file", file: FILE },
    ]);
  });
});

describe("isAllowedUploadUrl", () => {
  it.each([
    [
      "https://sanposcape-dev-pin-photos.s3.ap-southeast-1.amazonaws.com/",
      "https://app-api.dev.sanposcape.com",
      true,
    ],
    [
      "https://sanposcape-dev-pin-photos.s3.ap-southeast-1.amazonaws.com/",
      "http://10.0.2.2:8000",
      true,
    ],
    ["http://10.0.2.2:8000/dev-storage/uploads", "http://10.0.2.2:8000", true],
    ["http://localhost:8000/dev-storage/uploads", "http://localhost:8000", true],
    ["http://evil.example/dev-storage/uploads", "http://10.0.2.2:8000", false],
    ["http://10.0.2.2:9000/dev-storage/uploads", "http://10.0.2.2:8000", false],
    ["http://10.0.2.2:8000/dev-storage/uploads", "https://app-api.dev.sanposcape.com", false],
    ["file:///x", "http://10.0.2.2:8000", false],
    ["javascript:alert(1)", "http://10.0.2.2:8000", false],
    ["not a url", "http://10.0.2.2:8000", false],
  ])("url=%s apiBaseUrl=%s -> %s", (url, apiBaseUrl, expected) => {
    expect(isAllowedUploadUrl(url, { apiBaseUrl })).toBe(expected);
  });
});

describe("uploadFileName", () => {
  it("localId を含む .jpg ファイル名を返す", () => {
    expect(uploadFileName("abc-123")).toBe("pin-photo-abc-123.jpg");
  });
});
