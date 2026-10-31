import { isApiError } from "@/api/apiError";

/**
 * 地図への招待（SS-250）の、リンクの読み取り・失敗の分類・文言。文言を `.tsx` に書かずここに置くのは、
 * コンポーネントのレンダリングテストが書けない構成のため（`docs/architecture-guideline.md`）。
 */

/** backend が発行するトークン（`secrets.token_urlsafe(32)`。base64url）。それ以外は通信に載せない。 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** 招待リンクのホスト（本番と開発用。LP の `/i/` ページ）。 */
const INVITATION_HOSTS = new Set(["sanposcape.com", "dev.sanposcape.com"]);
/** custom scheme（`app.config.ts`。本番は sanposcape、開発用は sanposcape-dev）。 */
const INVITATION_SCHEMES = new Set(["sanposcape:", "sanposcape-dev:"]);

export function isInvitationToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/**
 * 招待リンクからトークンを取り出す。受け付けるのは次の形だけで、それ以外は null。
 * - `https://sanposcape.com/i/#<token>`（`dev.sanposcape.com` も。末尾の `/` は省略可）
 * - `sanposcape://invite?t=<token>`（`sanposcape-dev://` も。LP の「アプリで開く」）
 * - トークンそのもの（貼り付けで、前後の空白は無視する）
 */
export function parseInvitationLink(input: string): string | null {
  const text = input.trim();
  if (isInvitationToken(text)) return text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol === "https:" && INVITATION_HOSTS.has(url.hostname)) {
    if (url.pathname !== "/i/" && url.pathname !== "/i") return null;
    const token = url.hash.slice(1);
    return isInvitationToken(token) ? token : null;
  }
  if (INVITATION_SCHEMES.has(url.protocol)) {
    // `sanposcape://invite?t=` は URL の仕様上 host が invite になる。
    const target = url.hostname || url.pathname.replace(/^\/+/, "");
    if (target !== "invite") return null;
    const token = url.searchParams.get("t");
    return isInvitationToken(token) ? token : null;
  }
  return null;
}

/** 受諾画面（`/invitations/accept`）のパス。`+native-intent.tsx` が招待リンクをここへ書き換える。 */
export function invitationAcceptPath(token: string): string {
  return `/invitations/accept?token=${encodeURIComponent(token)}`;
}

export type InvitationErrorCode =
  | "not_found" // 404（使えないリンク。理由は区別しない）
  | "map_not_found" // 404 sanpo_map_not_found（発行・一覧で地図が無い・メンバーでなくなった）
  | "member_limit" // 409 member_limit_reached
  | "invitation_limit" // 409 invitation_limit_exceeded（発行）
  | "disabled" // 403 feature_disabled
  | "forbidden" // 403（owner でない。通常は導線を出さない）
  | "unauthorized" // 401
  | "rate_limited" // 429
  | "network"
  | "server"
  | "unknown";

function bodyCode(error: { body?: unknown }): string | null {
  const body = error.body;
  if (typeof body === "object" && body !== null && "code" in body) {
    const code = (body as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

export function toInvitationErrorCode(error: unknown): InvitationErrorCode {
  if (isApiError(error)) {
    if (error.status >= 500) return "server";
    const code = bodyCode(error);
    switch (error.status) {
      case 401:
        return "unauthorized";
      case 403:
        return code === "feature_disabled" ? "disabled" : "forbidden";
      case 404:
        return code === "sanpo_map_not_found" ? "map_not_found" : "not_found";
      case 409:
        return code === "invitation_limit_exceeded" ? "invitation_limit" : "member_limit";
      case 429:
        return "rate_limited";
      default:
        return "unknown";
    }
  }
  if (error instanceof TypeError) return "network";
  return "unknown";
}

const ERROR_MESSAGES: Record<InvitationErrorCode, string> = {
  not_found: "この招待リンクは使えません。招待した人に新しいリンクを頼んでください。",
  map_not_found: "この地図は見つかりませんでした。削除された可能性があります。",
  member_limit: "この地図のメンバーは上限（10人）に達しています。",
  invitation_limit:
    "有効な招待リンクが上限（10件）に達しています。使わないリンクを取り消してください。",
  disabled: "この機能はまだ使えません。",
  forbidden: "この操作をする権限がありません。",
  unauthorized: "サインインし直してから、もう一度お試しください。",
  rate_limited: "しばらく時間をおいてから、もう一度お試しください。",
  network: "通信に失敗しました。電波状況を確認して再試行してください。",
  server: "サーバーで問題が発生しました。時間をおいて再試行してください。",
  unknown: "うまくいきませんでした。もう一度お試しください。",
};

export function invitationErrorMessage(code: InvitationErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** 再試行して意味がある失敗か（受諾画面の「再試行」・ダイアログの実行ボタン）。 */
export function isRetriableInvitationError(code: InvitationErrorCode): boolean {
  return code === "network" || code === "server" || code === "unknown" || code === "rate_limited";
}

/** OS の共有シートに載せる本文（`Share.share` の message）。 */
export function invitationShareMessage(input: { sanpoMapName: string; url: string }): string {
  return `「${input.sanpoMapName}」の地図に招待します。Sanposcape のアプリで開いてください。\n${input.url}`;
}

/** 招待シートの説明（招待された人ができること・リンクの決まり）。 */
export const INVITATION_SHEET_TITLE = "メンバーを招待";
export const INVITATION_SHEET_POINTS = [
  "招待された人は、この地図のピンと写真を見て、ピン・写真・タグを追加できます。自分が追加したものは削除できます。",
  "1つのリンクで参加できるのは1人です。リンクの有効期限は7日です。",
  "リンクを受け取った人なら誰でも使えるので、送る相手に注意してください。使われる前なら、いつでも取り消せます。",
] as const;
export const INVITATION_SEND_LABEL = "招待リンクを送る";

/** 有効な招待リンクの行の説明（「11月7日 まで有効」）。 */
export function formatInvitationExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日 まで有効`;
}

/** 受諾画面の見出し（招待した人の表示名。未設定は「メンバー」）。 */
export function invitationInviterLabel(inviterDisplayName: string | null): string {
  const name = inviterDisplayName?.trim();
  return `${name ? name : "メンバー"}さんが地図に招待しています`;
}

/** 受諾画面で、参加すると自分の名前がどう見えるか。 */
export function invitationVisibleNameNote(myDisplayName: string | null): string {
  const name = myDisplayName?.trim();
  return name
    ? `参加すると、メンバーには「${name}」と表示されます。`
    : "参加すると、メンバーには「メンバー」と表示されます。";
}

export const INVITATION_ACCEPT_POINTS = [
  "この地図のピンと写真を見て、ピン・写真・タグを追加できます。",
  "メンバーには、あなたの表示名と、あなたが追加したもの（だれがいつ追加したか）が見えます。",
  "地図から抜けても、あなたが追加したピン・写真・タグは地図に残ります。",
] as const;

export function invitationJoinedMessage(sanpoMapName: string): string {
  return `「${sanpoMapName}」に参加しました`;
}
