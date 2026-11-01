import { isApiError } from "@/api/apiError";
import type { SanpoMapMember } from "@/features/pin/types";

/**
 * 地図のメンバー（SS-249）の表示の判定・文言・失敗の分類。文言を `.tsx` に書かずここに置くのは、
 * コンポーネントのレンダリングテストが書けない構成のため（`docs/architecture-guideline.md`）。
 */

/** 表示名が未設定のメンバーの呼び名。backend は null を返す（ADR-009 決定38）。 */
export const SANPO_MAP_MEMBER_FALLBACK_NAME = "メンバー";

export function sanpoMapMemberDisplayName(member: Pick<SanpoMapMember, "displayName">): string {
  const name = member.displayName?.trim();
  return name ? name : SANPO_MAP_MEMBER_FALLBACK_NAME;
}

/** アバターの丸に出す1文字（表示名の先頭の書記素。サロゲートペアを割らない）。 */
export function sanpoMapMemberInitial(member: Pick<SanpoMapMember, "displayName">): string {
  return Array.from(sanpoMapMemberDisplayName(member))[0] ?? "?";
}

export function sanpoMapMemberRoleLabel(role: SanpoMapMember["role"]): string {
  return role === "owner" ? "オーナー" : "メンバー";
}

export function formatSanpoMapMemberCount(count: number): string {
  return `メンバー ${count}人`;
}

/** 地図詳細のメンバーの行に並べるアバターの最大数。超えた分は「+N」にまとめる。 */
export const SANPO_MAP_MEMBER_AVATAR_MAX = 4;

export function splitSanpoMapMemberAvatars<T>(members: readonly T[]): {
  shown: T[];
  overflow: number;
} {
  return {
    shown: members.slice(0, SANPO_MAP_MEMBER_AVATAR_MAX),
    overflow: Math.max(0, members.length - SANPO_MAP_MEMBER_AVATAR_MAX),
  };
}

/**
 * 地図詳細にメンバーの行を出すか・メンバー画面を開けるか。フラグ `map_invitation` が ON のときと、
 * 自分が editor の地図のとき（フラグを OFF に戻しても、参加している人が抜けられるように）。
 */
export function canShowSanpoMapMembers(input: {
  mapInvitationEnabled: boolean;
  role: SanpoMapMember["role"];
}): boolean {
  return input.mapInvitationEnabled || input.role === "editor";
}

/** メンバーの画面で、この行に「外す」を出すか（owner が見ていて、自分以外の行）。 */
export function canRemoveSanpoMapMember(input: {
  viewerRole: SanpoMapMember["role"];
  viewerUserId: string | null;
  member: Pick<SanpoMapMember, "userId">;
}): boolean {
  return (
    input.viewerRole === "owner" &&
    input.viewerUserId !== null &&
    input.member.userId !== input.viewerUserId
  );
}

export type SanpoMapMemberRemoveErrorCode =
  | "unauthorized" // 401
  | "forbidden" // 403（owner でなくなった。通常は導線を出さないので防御）
  | "owner_cannot_leave" // 409（owner が自分を指定。通常は導線を出さないので防御）
  | "invalid_request" // 413 / 422
  | "network" // TypeError
  | "server" // 5xx
  | "unknown";

export function toSanpoMapMemberRemoveErrorCode(error: unknown): SanpoMapMemberRemoveErrorCode {
  if (isApiError(error)) {
    if (error.status >= 500) return "server";
    switch (error.status) {
      case 401:
        return "unauthorized";
      case 403:
        return "forbidden";
      case 409:
        return "owner_cannot_leave";
      case 413:
      case 422:
        return "invalid_request";
      default:
        return "unknown";
    }
  }
  if (error instanceof TypeError) return "network";
  return "unknown";
}

const REMOVE_ERROR_MESSAGES: Record<SanpoMapMemberRemoveErrorCode, string> = {
  unauthorized: "サインインし直してから、もう一度お試しください。",
  forbidden: "この操作をする権限がありません。",
  owner_cannot_leave: "地図のオーナーは、地図から抜けられません。",
  invalid_request: "この操作はできませんでした。",
  network: "通信に失敗しました。電波状況を確認して再試行してください。",
  server: "サーバーで問題が発生しました。時間をおいて再試行してください。",
  unknown: "うまくいきませんでした。もう一度お試しください。",
};

export function sanpoMapMemberRemoveErrorMessage(code: SanpoMapMemberRemoveErrorCode): string {
  return REMOVE_ERROR_MESSAGES[code];
}

const RETRIABLE_REMOVE_CODES = new Set<SanpoMapMemberRemoveErrorCode>([
  "network",
  "server",
  "unknown",
]);

/** 確認ダイアログに実行ボタンを出してよいか（`canRetryPinDelete` と同じ考え方）。 */
export function canRetrySanpoMapMemberRemove(
  errorCode: SanpoMapMemberRemoveErrorCode | null,
): boolean {
  return errorCode === null || RETRIABLE_REMOVE_CODES.has(errorCode);
}

/** 確認ダイアログの文言。`mode` は自分が抜ける（leave）か、owner が他人を外す（remove）か。 */
export function sanpoMapMemberRemoveDialogCopy(input: {
  mode: "leave" | "remove";
  sanpoMapName: string;
  memberName: string;
}): { title: string; description: string; confirmLabel: string; busyLabel: string } {
  if (input.mode === "leave") {
    return {
      title: `「${input.sanpoMapName}」から抜けますか？`,
      description:
        "抜けても、あなたが追加したピン・写真・タグは地図に残ります。残したくないものは、抜ける前に削除してください。抜けた後は、この地図を見ることも、追加したものを削除することもできなくなります。",
      confirmLabel: "抜ける",
      busyLabel: "抜けています…",
    };
  }
  return {
    title: `${input.memberName}さんを外しますか？`,
    description:
      "外した人は、この地図を見られなくなります。その人が追加したピン・写真・タグは地図に残ります。",
    confirmLabel: "外す",
    busyLabel: "外しています…",
  };
}

export const SANPO_MAP_MEMBER_CANCEL_LABEL = "キャンセル";
export const SANPO_MAP_MEMBER_CLOSE_LABEL = "閉じる";
export const SANPO_MAP_LEAVE_LABEL = "この地図から抜ける";

export function sanpoMapLeftMessage(sanpoMapName: string): string {
  return `「${sanpoMapName}」から抜けました`;
}

export function sanpoMapMemberRemovedMessage(memberName: string): string {
  return `${memberName}さんを外しました`;
}

export const SANPO_MAP_MEMBERS_LOAD_ERROR = "メンバーを読み込めませんでした。";
