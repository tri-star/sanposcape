import { invitationAcceptPath, parseInvitationLink } from "@/features/pin/lib/invitation";

/**
 * OS から渡された URL を Expo Router のパスに書き換える（SS-250）。
 *
 * 地図の招待リンク `https://sanposcape.com/i/#<token>`（Universal Links / App Links。dev は
 * `dev.sanposcape.com`）と、LP の「アプリで開く」の `sanposcape://invite?t=<token>`（開発用は
 * `sanposcape-dev://`）を、受諾画面 `/invitations/accept?token=<token>` に向ける。
 * トークンが fragment に載るので、Expo Router の既定の解釈（path だけを見る）では受け取れない。
 * `/i/` なのにトークンが読めないときも受諾画面へ向け、「使えないリンク」を出す。それ以外の URL は変えない。
 * ここで例外を投げるとアプリが開かないので、失敗は元のパスに倒す。
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const token = parseInvitationLink(path);
    if (token !== null) return invitationAcceptPath(token);
    if (isInvitationPagePath(path)) return "/invitations/accept";
    return path;
  } catch {
    return path;
  }
}

function isInvitationPagePath(path: string): boolean {
  try {
    const url = new URL(path);
    return (
      (url.hostname === "sanposcape.com" || url.hostname === "dev.sanposcape.com") &&
      (url.pathname === "/i/" || url.pathname === "/i")
    );
  } catch {
    return false;
  }
}
