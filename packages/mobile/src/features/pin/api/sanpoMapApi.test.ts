import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  getListSanpoMapMembersMockHandler,
  getListSanpoMapsMockHandler,
} from "@/api/generated/endpoints/sanpo-maps/sanpo-maps.msw";
import type { SanpoMapListRead, SanpoMapRead } from "@/api/generated/model";
import {
  createSanpoMap,
  fetchSanpoMapMembers,
  fetchSanpoMaps,
  removeSanpoMapMember,
  updateSanpoMapIcon,
} from "@/features/pin/api/sanpoMapApi";
import { server } from "@/test/setup";

const RESPONSE: SanpoMapListRead = {
  items: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "最初の地図",
      is_default: true,
      role: "owner",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      pin_count: 4,
      icon: "pin",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "友達の地図",
      is_default: false,
      role: "editor",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      icon: "tree",
    },
  ],
  next_cursor: null,
};

describe("fetchSanpoMaps", () => {
  it("200 で camelCase の SanpoMap[] に変換される", async () => {
    server.use(getListSanpoMapsMockHandler(RESPONSE));

    const result = await fetchSanpoMaps();

    expect(result).toEqual([
      {
        id: RESPONSE.items[0]!.id,
        name: "最初の地図",
        isDefault: true,
        role: "owner",
        pinCount: 4,
        icon: "pin",
      },
      {
        id: RESPONSE.items[1]!.id,
        name: "友達の地図",
        isDefault: false,
        role: "editor",
        pinCount: null,
        icon: "tree",
      },
    ]);
  });

  it("icon が欠落・未知の値なら pin になる", async () => {
    const base = RESPONSE.items[0]!;
    const { icon: _omit, ...withoutIcon } = base;
    server.use(
      getListSanpoMapsMockHandler({
        items: [
          { ...base, id: "a", icon: "coffee" },
          { ...withoutIcon, id: "b" } as unknown as SanpoMapRead,
          { ...base, id: "c", icon: "unknown" } as unknown as SanpoMapRead,
        ],
        next_cursor: null,
      }),
    );

    const result = await fetchSanpoMaps();

    expect(result.map((m) => m.icon)).toEqual(["coffee", "pin", "pin"]);
  });

  it("expand=pin_count を送る", async () => {
    let searchParams: URLSearchParams | undefined;
    server.use(
      http.get("*/sanpo-maps", ({ request }) => {
        searchParams = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], next_cursor: null }, { status: 200 });
      }),
    );

    await fetchSanpoMaps();

    expect(searchParams?.getAll("expand")).toEqual(["pin_count"]);
  });

  it("pin_count の数値・null・欠落がそれぞれ pinCount の数値・null・null になる", async () => {
    const base = RESPONSE.items[0]!;
    const { pin_count: _omit, ...withoutPinCount } = base;
    server.use(
      getListSanpoMapsMockHandler({
        items: [
          { ...base, id: "a", pin_count: 0 },
          { ...base, id: "b", pin_count: null },
          { ...withoutPinCount, id: "c" },
        ],
        next_cursor: null,
      }),
    );

    const result = await fetchSanpoMaps();

    expect(result.map((m) => m.pinCount)).toEqual([0, null, null]);
  });

  it("空配列を返す", async () => {
    server.use(getListSanpoMapsMockHandler({ items: [], next_cursor: null }));

    const result = await fetchSanpoMaps();

    expect(result).toEqual([]);
  });

  it("401 で ApiError(401) が throw される", async () => {
    server.use(http.get("*/sanpo-maps", () => new HttpResponse(null, { status: 401 })));

    await expect(fetchSanpoMaps()).rejects.toThrow(ApiError);
  });

  it("500 で ApiError(500) が throw される", async () => {
    server.use(http.get("*/sanpo-maps", () => new HttpResponse(null, { status: 500 })));

    try {
      await fetchSanpoMaps();
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(500);
    }
  });
});

describe("createSanpoMap", () => {
  const CREATED = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "新しい地図",
    is_default: false,
    role: "owner" as const,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    pin_count: null,
    icon: "coffee" as const,
  };

  it("body { name, icon } を送り、201 で pinCount 0 の SanpoMap を返す", async () => {
    let body: unknown;
    server.use(
      http.post("*/sanpo-maps", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(CREATED, { status: 201 });
      }),
    );

    const result = await createSanpoMap({ name: "新しい地図", icon: "coffee" });

    expect(body).toEqual({ name: "新しい地図", icon: "coffee" });
    expect(result).toEqual({
      id: CREATED.id,
      name: "新しい地図",
      isDefault: false,
      role: "owner",
      pinCount: 0,
      icon: "coffee",
    });
  });

  it.each([401, 422, 500])("%d で ApiError（status 付き）が throw される", async (status) => {
    server.use(http.post("*/sanpo-maps", () => new HttpResponse(null, { status })));

    try {
      await createSanpoMap({ name: "x", icon: "pin" });
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
    }
  });

  it("通信断では TypeError がそのまま投げられる", async () => {
    server.use(http.post("*/sanpo-maps", () => HttpResponse.error()));

    await expect(createSanpoMap({ name: "x", icon: "pin" })).rejects.toThrow(TypeError);
  });
});

describe("updateSanpoMapIcon", () => {
  const ID = "33333333-3333-4333-8333-333333333333";
  const UPDATED = {
    id: ID,
    name: "新しい地図",
    is_default: false,
    role: "owner" as const,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    pin_count: null,
    icon: "cat" as const,
  };

  it("PATCH のパスに id が入り、body は { icon } だけ。200 で icon 付きの SanpoMap", async () => {
    let body: unknown;
    let path: string | undefined;
    server.use(
      http.patch("*/sanpo-maps/:id", async ({ request }) => {
        body = await request.json();
        path = new URL(request.url).pathname;
        return HttpResponse.json(UPDATED, { status: 200 });
      }),
    );

    const result = await updateSanpoMapIcon({ sanpoMapId: ID, icon: "cat" });

    expect(path).toContain(`/sanpo-maps/${ID}`);
    expect(body).toEqual({ icon: "cat" });
    expect(result).toMatchObject({ id: ID, icon: "cat", pinCount: null, role: "owner" });
  });

  it("UUID でない id は通信せず ApiError(404)", async () => {
    let called = false;
    server.use(
      http.patch("*/sanpo-maps/:id", () => {
        called = true;
        return HttpResponse.json(UPDATED, { status: 200 });
      }),
    );

    await expect(updateSanpoMapIcon({ sanpoMapId: "not-uuid", icon: "cat" })).rejects.toMatchObject(
      { status: 404 },
    );
    expect(called).toBe(false);
  });

  it.each([403, 404, 422, 500])("%d で ApiError（status 付き）が throw される", async (status) => {
    server.use(http.patch("*/sanpo-maps/:id", () => new HttpResponse(null, { status })));

    try {
      await updateSanpoMapIcon({ sanpoMapId: ID, icon: "cat" });
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
    }
  });

  it("通信断では TypeError がそのまま投げられる", async () => {
    server.use(http.patch("*/sanpo-maps/:id", () => HttpResponse.error()));

    await expect(updateSanpoMapIcon({ sanpoMapId: ID, icon: "cat" })).rejects.toThrow(TypeError);
  });
});

const MAP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "33333333-3333-4333-8333-333333333333";

describe("fetchSanpoMapMembers", () => {
  it("200 で camelCase の SanpoMapMember[] に変換し、backend の並びを保つ", async () => {
    server.use(
      getListSanpoMapMembersMockHandler({
        items: [
          {
            user_id: USER_ID,
            display_name: "山田",
            role: "owner",
            joined_at: "2026-01-01T00:00:00.000Z",
          },
          {
            user_id: "44444444-4444-4444-8444-444444444444",
            display_name: null,
            role: "editor",
            joined_at: "2026-01-02T00:00:00.000Z",
          },
        ],
      }),
    );

    const result = await fetchSanpoMapMembers(MAP_ID);

    expect(result).toEqual([
      { userId: USER_ID, displayName: "山田", role: "owner", joinedAt: "2026-01-01T00:00:00.000Z" },
      {
        userId: "44444444-4444-4444-8444-444444444444",
        displayName: null,
        role: "editor",
        joinedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });

  it("UUID でない id は通信せずに 404 にする", async () => {
    await expect(fetchSanpoMapMembers("not-a-uuid")).rejects.toMatchObject({ status: 404 });
  });
});

describe("removeSanpoMapMember", () => {
  it("204 で解決する", async () => {
    server.use(
      http.delete(
        "*/sanpo-maps/:sanpoMapId/members/:userId",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    await expect(removeSanpoMapMember({ sanpoMapId: MAP_ID, userId: USER_ID })).resolves.toBe(
      undefined,
    );
  });

  it("404（もう抜けている・外されている）は成功として扱う", async () => {
    server.use(
      http.delete("*/sanpo-maps/:sanpoMapId/members/:userId", () =>
        HttpResponse.json(
          { detail: "Sanpo map not found", code: "sanpo_map_not_found" },
          { status: 404 },
        ),
      ),
    );
    await expect(removeSanpoMapMember({ sanpoMapId: MAP_ID, userId: USER_ID })).resolves.toBe(
      undefined,
    );
  });

  it("409 などはそのまま投げる", async () => {
    server.use(
      http.delete("*/sanpo-maps/:sanpoMapId/members/:userId", () =>
        HttpResponse.json(
          { detail: "Owner cannot leave the sanpo map", code: "owner_cannot_leave" },
          { status: 409 },
        ),
      ),
    );
    await expect(
      removeSanpoMapMember({ sanpoMapId: MAP_ID, userId: USER_ID }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("UUID でない id は通信せずに 422 にする", async () => {
    await expect(removeSanpoMapMember({ sanpoMapId: MAP_ID, userId: "x" })).rejects.toMatchObject({
      status: 422,
    });
  });
});
