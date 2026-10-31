import { ApiError } from "@/api/apiError";
import {
  acceptInvitation as acceptInvitationRequest,
  createSanpoMapInvitation as createSanpoMapInvitationRequest,
  listSanpoMapInvitations as listSanpoMapInvitationsRequest,
  previewInvitation as previewInvitationRequest,
  revokeSanpoMapInvitation as revokeSanpoMapInvitationRequest,
} from "@/api/generated/endpoints/sanpo-map-invitations/sanpo-map-invitations";
import { toSanpoMap } from "@/features/pin/api/sanpoMapApi";
import { isInvitationToken } from "@/features/pin/lib/invitation";
import { toSanpoMapIconKey } from "@/features/pin/lib/sanpoMapIcon";
import type {
  InvitationPreview,
  SanpoMap,
  SanpoMapInvitation,
  SanpoMapInvitationCreated,
} from "@/features/pin/types";
import { isUuid } from "@/lib/uuid";

/**
 * 地図への招待（SS-250）の素の fetcher の薄い包み。書き込みには `signal` を渡さない（画面を離れても中断しない）。
 * トークンはボディで送る（path・クエリに載せない。backend の決定）。形の検証に通らない値は通信しない。
 */

/** `POST /sanpo-maps/{id}/invitations`（owner）。`token`・`url` はこの応答でしか得られない。 */
export async function createSanpoMapInvitation(
  sanpoMapId: string,
): Promise<SanpoMapInvitationCreated> {
  if (!isUuid(sanpoMapId)) throw new ApiError(422);
  const response = await createSanpoMapInvitationRequest(sanpoMapId);
  if (response.status !== 201) throw new ApiError(response.status);
  return {
    id: response.data.id,
    url: response.data.url,
    expiresAt: response.data.expires_at,
  };
}

/** `GET /sanpo-maps/{id}/invitations`（owner）。有効なものだけ（新しい順）。 */
export async function fetchSanpoMapInvitations(
  sanpoMapId: string,
  options?: { signal?: AbortSignal },
): Promise<SanpoMapInvitation[]> {
  if (!isUuid(sanpoMapId)) throw new ApiError(404);
  const response = await listSanpoMapInvitationsRequest(sanpoMapId, { signal: options?.signal });
  if (response.status !== 200) throw new ApiError(response.status);
  return response.data.items.map((item) => ({
    id: item.id,
    createdAt: item.created_at,
    expiresAt: item.expires_at,
  }));
}

/** `DELETE /sanpo-maps/{id}/invitations/{invitation_id}`。404（もう使われた・取り消し済み）は成功として扱う。 */
export async function revokeSanpoMapInvitation(input: {
  sanpoMapId: string;
  invitationId: string;
}): Promise<void> {
  if (!isUuid(input.sanpoMapId) || !isUuid(input.invitationId)) throw new ApiError(422);
  try {
    const response = await revokeSanpoMapInvitationRequest(input.sanpoMapId, input.invitationId);
    if (response.status !== 204) throw new ApiError(response.status);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return;
    throw error;
  }
}

/** `POST /invitations/preview`（サインイン不要）。使えないトークンは ApiError(404)。 */
export async function fetchInvitationPreview(
  token: string,
  options?: { signal?: AbortSignal },
): Promise<InvitationPreview> {
  if (!isInvitationToken(token)) throw new ApiError(404);
  const response = await previewInvitationRequest({ token }, { signal: options?.signal });
  if (response.status !== 200) throw new ApiError(response.status);
  const data = response.data;
  return {
    sanpoMapName: data.sanpo_map.name,
    sanpoMapIcon: toSanpoMapIconKey(data.sanpo_map.icon),
    inviterDisplayName: data.inviter_display_name,
    expiresAt: data.expires_at,
    membership: data.membership === "member" ? "member" : "none",
    sanpoMapId: data.sanpo_map_id ?? null,
  };
}

/** `POST /invitations/accept`（サインイン必須）。参加した地図を返す（すでにメンバーなら同じ地図）。 */
export async function acceptInvitation(token: string): Promise<SanpoMap> {
  if (!isInvitationToken(token)) throw new ApiError(404);
  const response = await acceptInvitationRequest({ token });
  if (response.status !== 200) throw new ApiError(response.status);
  return toSanpoMap(response.data);
}
