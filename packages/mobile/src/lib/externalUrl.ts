/**
 * 外部の Web ページを開く判定ロジック（SS-158 / ADR-M-019）。
 *
 * `react-native` / `expo-web-browser` を値として import しない（開く手段は引数で注入する）。
 * Vitest でテストするため。実際の配線は `src/hooks/useOpenExternalUrl.ts`。
 */

/** https で、ホスト名が空でない URL だけを開く（javascript: / file: / http: / 相対 URL を拒否）。 */
export function isOpenableExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname !== "";
  } catch {
    return false;
  }
}

/** 開く手段。hook が expo-web-browser と Linking を渡す。テストではフェイクを渡す。 */
export type ExternalUrlOpeners = {
  /** アプリ内ブラウザで開き、結果の type を返す（expo-web-browser の WebBrowserResult["type"] を string で受ける）。 */
  openInAppBrowser: (url: string) => Promise<string>;
  /** OS の既定ブラウザで開く（RN の Linking.openURL）。 */
  openWithSystem: (url: string) => Promise<unknown>;
};

export type OpenExternalUrlResult =
  | { kind: "opened"; via: "in-app" }
  | { kind: "opened"; via: "system"; inAppError: unknown }
  | { kind: "busy" }
  | { kind: "failed"; reason: "invalid_url" }
  | { kind: "failed"; reason: "open_error"; inAppError: unknown; systemError: unknown };

/**
 * URL を検証し、アプリ内ブラウザ → OS ブラウザの順に開く。この関数自体は例外を投げない。
 *
 * - アプリ内ブラウザが `"locked"`（別のブラウザセッションが表示中）なら `busy`。OS ブラウザへは逃がさない。
 * - アプリ内ブラウザが失敗（Custom Tabs を解決できない端末など）したときだけ OS ブラウザで開く。
 */
export async function openExternalUrl(
  url: string,
  openers: ExternalUrlOpeners,
): Promise<OpenExternalUrlResult> {
  if (!isOpenableExternalUrl(url)) {
    return { kind: "failed", reason: "invalid_url" };
  }

  let inAppError: unknown;
  try {
    const type = await openers.openInAppBrowser(url);
    if (type === "locked") return { kind: "busy" };
    return { kind: "opened", via: "in-app" };
  } catch (error) {
    inAppError = error;
  }

  try {
    await openers.openWithSystem(url);
    return { kind: "opened", via: "system", inAppError };
  } catch (systemError) {
    return { kind: "failed", reason: "open_error", inAppError, systemError };
  }
}

/** 開けなかったときの画面内の案内。URL を含める（利用者が手でブラウザに入力・コピーできるように）。 */
export function externalUrlOpenFailedMessage(url: string): string {
  return `ページを開けませんでした。ブラウザで次のアドレスを開いてください: ${url}`;
}
