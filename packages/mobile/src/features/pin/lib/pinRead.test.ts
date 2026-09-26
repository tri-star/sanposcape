import { describe, expect, it } from "vitest";

import type { PinListItemRead, PinPhotoRead, PinRead } from "@/api/generated/model";
import {
  mergeRegisteredPinPages,
  toPinDetail,
  toPinPhoto,
  toPinSummary,
} from "@/features/pin/lib/pinRead";
import type { PinSummary } from "@/features/pin/types";

const API_BASE_URL_HTTPS = "https://api.sanposcape.example.com";
const API_BASE_URL_HTTP = "http://10.0.2.2:8000";

function photo(overrides: Partial<PinPhotoRead> = {}): PinPhotoRead {
  return {
    id: "photo-1",
    upload_id: "up-1",
    position: 0,
    width: 2048,
    height: 1536,
    byte_size: 500_000,
    content_type: "image/jpeg",
    thumbnail: { url: "https://cdn.example.com/thumb.jpg", width: 256, height: 192 },
    original_url: "https://cdn.example.com/original.jpg",
    urls_expire_at: "2026-01-01T01:00:00.000Z",
    uploaded_by_user_id: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("toPinPhoto", () => {
  it("https の thumbnail/original はそのまま通す", () => {
    const result = toPinPhoto(photo(), { apiBaseUrl: API_BASE_URL_HTTPS });
    expect(result.thumbnailUrl).toBe("https://cdn.example.com/thumb.jpg");
    expect(result.originalUrl).toBe("https://cdn.example.com/original.jpg");
  });

  it("thumbnail が null なら thumbnailUrl は null", () => {
    const result = toPinPhoto(photo({ thumbnail: null }), { apiBaseUrl: API_BASE_URL_HTTPS });
    expect(result.thumbnailUrl).toBeNull();
  });

  it("original_url が null なら originalUrl は null", () => {
    const result = toPinPhoto(photo({ original_url: null }), { apiBaseUrl: API_BASE_URL_HTTPS });
    expect(result.originalUrl).toBeNull();
  });

  it("apiBaseUrl が http のとき同一 origin の http URL は通す", () => {
    const result = toPinPhoto(
      photo({
        thumbnail: { url: "http://10.0.2.2:8000/dev-storage/thumb.jpg", width: 1, height: 1 },
        original_url: "http://10.0.2.2:8000/dev-storage/original.jpg",
      }),
      { apiBaseUrl: API_BASE_URL_HTTP },
    );
    expect(result.thumbnailUrl).toBe("http://10.0.2.2:8000/dev-storage/thumb.jpg");
    expect(result.originalUrl).toBe("http://10.0.2.2:8000/dev-storage/original.jpg");
  });

  it("apiBaseUrl が http のとき別ホストの http URL は null", () => {
    const result = toPinPhoto(photo({ original_url: "http://evil.example.com/original.jpg" }), {
      apiBaseUrl: API_BASE_URL_HTTP,
    });
    expect(result.originalUrl).toBeNull();
  });

  it("apiBaseUrl が https のとき http URL は null", () => {
    const result = toPinPhoto(photo({ original_url: "http://cdn.example.com/original.jpg" }), {
      apiBaseUrl: API_BASE_URL_HTTPS,
    });
    expect(result.originalUrl).toBeNull();
  });

  it("不正な URL 文字列は null", () => {
    const result = toPinPhoto(photo({ original_url: "not a url" }), {
      apiBaseUrl: API_BASE_URL_HTTPS,
    });
    expect(result.originalUrl).toBeNull();
  });

  it("width/height/position/id をそのまま保持する", () => {
    const result = toPinPhoto(photo({ id: "photo-9", position: 3, width: 100, height: 200 }), {
      apiBaseUrl: API_BASE_URL_HTTPS,
    });
    expect(result).toMatchObject({ id: "photo-9", position: 3, width: 100, height: 200 });
  });
});

describe("toPinSummary", () => {
  const READ: PinListItemRead = {
    id: "pin-1",
    sanpo_map_id: "map-1",
    name: "桜の木",
    location: { latitude: 35.681236, longitude: 139.767125 },
    tags: [],
    cover_photo: null,
    photo_count: 0,
    created_by_user_id: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  it("正常な座標なら変換する", () => {
    expect(toPinSummary(READ)).toEqual({
      id: "pin-1",
      sanpoMapId: "map-1",
      name: "桜の木",
      location: { latitude: 35.681236, longitude: 139.767125 },
    });
  });

  it("緯度91（不正座標）は null", () => {
    expect(toPinSummary({ ...READ, location: { latitude: 91, longitude: 139.767125 } })).toBeNull();
  });

  it("name が null（名前なし）でも変換する", () => {
    expect(toPinSummary({ ...READ, name: null })?.name).toBeNull();
  });
});

describe("toPinDetail", () => {
  const READ: PinRead = {
    id: "pin-1",
    client_pin_id: "client-1",
    sanpo_map: { id: "map-1", name: "最初の地図", is_default: true },
    name: null,
    memo: null,
    location: { latitude: 35.681236, longitude: 139.767125 },
    tags: [{ id: "tag-1", label: "桜", created_by_user_id: "user-1" }],
    photos: [photo()],
    photo_count: 1,
    created_by_user_id: "user-1",
    client_walk_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  it("name / memo が null でも保持する", () => {
    const detail = toPinDetail(READ, { apiBaseUrl: API_BASE_URL_HTTPS });
    expect(detail.name).toBeNull();
    expect(detail.memo).toBeNull();
  });

  it("tags を { id, label } に変換する", () => {
    const detail = toPinDetail(READ, { apiBaseUrl: API_BASE_URL_HTTPS });
    expect(detail.tags).toEqual([{ id: "tag-1", label: "桜" }]);
  });

  it("sanpoMapName / photoCount / createdAt を保持する", () => {
    const detail = toPinDetail(READ, { apiBaseUrl: API_BASE_URL_HTTPS });
    expect(detail.sanpoMapName).toBe("最初の地図");
    expect(detail.photoCount).toBe(1);
    expect(detail.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(detail.photos).toHaveLength(1);
  });
});

describe("mergeRegisteredPinPages", () => {
  function pin(id: string): PinSummary {
    return { id, sanpoMapId: "map-1", name: null, location: { latitude: 0, longitude: 0 } };
  }

  it("複数地図の結合", () => {
    const result = mergeRegisteredPinPages([
      { pins: [pin("a")], hasMore: false },
      { pins: [pin("b")], hasMore: false },
    ]);
    expect(result.pins.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result.truncated).toBe(false);
  });

  it("重複 id は最初に出たものだけ残す", () => {
    const result = mergeRegisteredPinPages([
      { pins: [pin("a")], hasMore: false },
      { pins: [pin("a"), pin("b")], hasMore: false },
    ]);
    expect(result.pins.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("1つでも hasMore が true なら truncated true", () => {
    const result = mergeRegisteredPinPages([
      { pins: [pin("a")], hasMore: true },
      { pins: [pin("b")], hasMore: false },
    ]);
    expect(result.truncated).toBe(true);
  });

  it("undefined を含む配列は無視して結合する", () => {
    const result = mergeRegisteredPinPages([undefined, { pins: [pin("a")], hasMore: false }]);
    expect(result.pins.map((p) => p.id)).toEqual(["a"]);
    expect(result.truncated).toBe(false);
  });
});
