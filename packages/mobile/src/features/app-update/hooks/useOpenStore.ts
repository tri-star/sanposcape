import { useCallback, useRef, useState } from "react";
import { AccessibilityInfo, Linking, Platform } from "react-native";

import {
  STORE_BUTTON_LABELS,
  STORE_URLS,
  storeOpenFailedMessage,
  toStorePlatform,
} from "@/features/app-update/lib/updateRequired";
import { describeError, logDiagnostic } from "@/lib/diagnosticLog";

export type UseOpenStoreResult = {
  /** この OS のストアの URL。ストアを持たない OS（web）では null。 */
  storeUrl: string | null;
  /** ストアを開くボタンの文言。 */
  storeLabel: string;
  /** 直近の試行で開けなかったか。再試行の開始で false に戻る。 */
  failed: boolean;
  open: () => void;
};

/**
 * ストアの掲載ページを OS に開かせる（SS-101）。
 *
 * アプリ内ブラウザ（`useOpenExternalUrl`）は使わない。アプリ内ブラウザだと Web の掲載ページが
 * 開くだけでストアのアプリに渡らず、そこからアップデートできないため。
 */
export function useOpenStore(): UseOpenStoreResult {
  const platform = toStorePlatform(Platform.OS);
  const storeUrl = platform === null ? null : STORE_URLS[platform];
  const storeLabel = platform === null ? "" : STORE_BUTTON_LABELS[platform];
  const [failed, setFailed] = useState(false);
  const inFlightRef = useRef(false);

  const open = useCallback(() => {
    if (storeUrl === null || inFlightRef.current) return;
    inFlightRef.current = true;
    setFailed(false);
    Linking.openURL(storeUrl)
      .catch((error: unknown) => {
        logDiagnostic("store_url_open_failed", { url: storeUrl, ...describeError(error) });
        setFailed(true);
        // iOS の VoiceOver は新しく出た Text を自動では読まないため明示的に読み上げる。
        AccessibilityInfo.announceForAccessibility(storeOpenFailedMessage(storeUrl));
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [storeUrl]);

  return { storeUrl, storeLabel, failed, open };
}
