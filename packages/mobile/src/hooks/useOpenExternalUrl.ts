import * as WebBrowser from "expo-web-browser";
import { useCallback, useRef, useState } from "react";
import { AccessibilityInfo, Linking } from "react-native";

import { describeError, logDiagnostic } from "@/lib/diagnosticLog";
import {
  externalUrlOpenFailedMessage,
  openExternalUrl,
  type ExternalUrlOpeners,
  type OpenExternalUrlResult,
} from "@/lib/externalUrl";

export type UseOpenExternalUrlResult = {
  /** 直近の試行が両方の手段で失敗したときの URL。成功・再試行の開始で null に戻る。 */
  failedUrl: string | null;
  open: (url: string) => void;
};

/** `openBrowserAsync` のオプションは既定のまま（Android Custom Tabs / iOS SFSafariViewController）。 */
const OPENERS: ExternalUrlOpeners = {
  openInAppBrowser: async (url) => (await WebBrowser.openBrowserAsync(url)).type,
  openWithSystem: (url) => Linking.openURL(url),
};

/**
 * 外部の Web ページを開く（SS-158 / ADR-M-020）。判定は `src/lib/externalUrl.ts`、
 * ここは expo-web-browser / Linking / 診断ログ / 読み上げの配線だけを持つ。
 *
 * ネイティブ依存（expo-web-browser / RN）を持つので、Vitest 対象のモジュール
 * （`lib/`・`api/`・`config/`）から import しないこと。
 *
 * 失敗時は URL をそのまま診断ログに出す。トークンや ID などの機密をクエリに含む URL は渡さないこと。
 */
export function useOpenExternalUrl(): UseOpenExternalUrlResult {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const open = useCallback((url: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setFailedUrl(null);

    const handleResult = (result: OpenExternalUrlResult) => {
      if (result.kind === "busy") return;
      if (result.kind === "opened") {
        if (result.via === "system") {
          // 開けてはいるので画面には何も出さない。
          logDiagnostic("external_url_in_app_browser_failed", {
            url,
            ...describeError(result.inAppError),
          });
        }
        return;
      }
      if (result.reason === "invalid_url") {
        logDiagnostic("external_url_rejected", { url });
      } else {
        logDiagnostic("external_url_open_failed", {
          url,
          inApp: describeError(result.inAppError),
          system: describeError(result.systemError),
        });
      }
      setFailedUrl(url);
      // iOS の VoiceOver は新しく出た Text を自動では読まないため明示的に読み上げる。
      AccessibilityInfo.announceForAccessibility(externalUrlOpenFailedMessage(url));
    };

    void openExternalUrl(url, OPENERS)
      .then(handleResult)
      .finally(() => {
        inFlightRef.current = false;
      });
  }, []);

  return { failedUrl, open };
}
