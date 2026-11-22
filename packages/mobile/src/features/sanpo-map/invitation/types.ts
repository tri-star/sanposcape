import type { SanpoMapIconKey } from "@/features/sanpo-map/shared/types";

/**
 * 地図への招待だけが使う型（SS-260 で旧 `features/pin/types.ts` から分けた）。
 * 地図・ピンからも使う型は `@/features/sanpo-map/shared/types` に置く（ADR-M-001 決定2 の SS-260 追補）。
 */

/** 有効な招待リンク（`GET /sanpo-maps/{id}/invitations`。SS-250）。トークンは持たない。 */
export type SanpoMapInvitation = {
  id: string;
  createdAt: string;
  expiresAt: string;
};

/** 発行した招待リンク（`POST /sanpo-maps/{id}/invitations`）。`url` は共有シートに載せたら捨てる。 */
export type SanpoMapInvitationCreated = {
  id: string;
  url: string;
  expiresAt: string;
};

/** 招待の中身（`POST /invitations/preview`）。 */
export type InvitationPreview = {
  sanpoMapName: string;
  sanpoMapIcon: SanpoMapIconKey;
  inviterDisplayName: string | null;
  expiresAt: string;
  /** サインインしていて、すでにその地図のメンバーなら "member"。 */
  membership: "none" | "member";
  /** membership が "member" のときだけ地図の ID（「地図を開く」用）。 */
  sanpoMapId: string | null;
};
