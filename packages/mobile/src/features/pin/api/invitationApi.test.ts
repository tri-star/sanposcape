import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import {
  acceptInvitation,
  createSanpoMapInvitation,
  fetchInvitationPreview,
  revokeSanpoMapInvitation,
} from "@/features/pin/api/invitationApi";
import { server } from "@/test/setup";

const MAP_ID = "11111111-1111-4111-8111-111111111111";
const INVITATION_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456";

describe("createSanpoMapInvitation", () => {
  it("201 で URL と期限を返す（トークンそのものは持たない）", async () => {
    server.use(
      http.post("*/sanpo-maps/:id/invitations", () =>
        HttpResponse.json(
          {
            id: INVITATION_ID,
            token: TOKEN,
            url: `https://sanposcape.com/i/#${TOKEN}`,
            created_at: "2026-11-01T00:00:00Z",
            expires_at: "2026-11-08T00:00:00Z",
          },
          { status: 201 },
        ),
      ),
    );
    await expect(createSanpoMapInvitation(MAP_ID)).resolves.toEqual({
      id: INVITATION_ID,
      url: `https://sanposcape.com/i/#${TOKEN}`,
      expiresAt: "2026-11-08T00:00:00Z",
    });
  });
});

describe("revokeSanpoMapInvitation", () => {
  it("404（もう使われた・取り消し済み）は成功として扱う", async () => {
    server.use(
      http.delete("*/sanpo-maps/:id/invitations/:invitationId", () =>
        HttpResponse.json(
          { detail: "Invitation not found", code: "invitation_not_found" },
          { status: 404 },
        ),
      ),
    );
    await expect(
      revokeSanpoMapInvitation({ sanpoMapId: MAP_ID, invitationId: INVITATION_ID }),
    ).resolves.toBeUndefined();
  });
});

describe("fetchInvitationPreview", () => {
  it("トークンをボディで送り、応答を camelCase にする", async () => {
    let body: unknown = null;
    server.use(
      http.post("*/invitations/preview", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          sanpo_map: { name: "おすすめランチ", icon: "coffee" },
          inviter_display_name: null,
          expires_at: "2026-11-08T00:00:00Z",
          membership: "none",
          sanpo_map_id: null,
        });
      }),
    );

    const preview = await fetchInvitationPreview(TOKEN);

    expect(body).toEqual({ token: TOKEN });
    expect(preview).toEqual({
      sanpoMapName: "おすすめランチ",
      sanpoMapIcon: "coffee",
      inviterDisplayName: null,
      expiresAt: "2026-11-08T00:00:00Z",
      membership: "none",
      sanpoMapId: null,
    });
  });

  it("トークンの形でない値は通信せずに 404 にする", async () => {
    await expect(fetchInvitationPreview("bad")).rejects.toMatchObject({ status: 404 });
  });
});

describe("acceptInvitation", () => {
  it("参加した地図を返す", async () => {
    server.use(
      http.post("*/invitations/accept", () =>
        HttpResponse.json({
          id: MAP_ID,
          name: "おすすめランチ",
          icon: "coffee",
          is_default: false,
          role: "editor",
          pin_count: null,
          created_at: "2026-11-01T00:00:00Z",
          updated_at: "2026-11-01T00:00:00Z",
        }),
      ),
    );
    await expect(acceptInvitation(TOKEN)).resolves.toMatchObject({
      id: MAP_ID,
      role: "editor",
    });
  });

  it("409 は本文の code を持ったまま投げる", async () => {
    server.use(
      http.post("*/invitations/accept", () =>
        HttpResponse.json(
          { detail: "Invitation limit reached", code: "member_limit_reached" },
          { status: 409 },
        ),
      ),
    );
    await expect(acceptInvitation(TOKEN)).rejects.toMatchObject({
      status: 409,
      body: { code: "member_limit_reached" },
    });
  });
});
