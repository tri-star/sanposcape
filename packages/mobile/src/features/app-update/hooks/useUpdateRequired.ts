import { useSegments } from "expo-router";
import { useState } from "react";
import { Platform } from "react-native";

import { CURRENT_APP_VERSION } from "@/config/currentAppVersion";
import {
  isOnWalkSummary,
  shouldDeferForWalk,
  shouldShowUpdateRequired,
  toStorePlatform,
} from "@/features/app-update/lib/updateRequired";
import { useActiveWalkStore } from "@/features/walk/store/useActiveWalkStore";
import { useFinishedWalkStore } from "@/features/walk/store/useFinishedWalkStore";
import { useAppConfig } from "@/hooks/useAppConfig";

const STORE_PLATFORM = toStorePlatform(Platform.OS);

/**
 * アップデートを求める全画面の案内を出すか（SS-101）。判定は `shouldShowUpdateRequired`。
 * 呼ぶのは `UpdateRequiredGate` の1箇所だけ。
 */
export function useUpdateRequired(): boolean {
  const snapshot = useAppConfig();
  const hasActiveWalk = useActiveWalkStore((state) => state.activeWalk !== null);
  const unsavedWalkId = useFinishedWalkStore((state) =>
    state.finishedWalk !== null && !state.saved ? state.finishedWalk.clientWalkId : null,
  );
  const signInForSaveRequested = useFinishedWalkStore((state) => state.signInForSaveRequested);
  const rootSegment: string | undefined = useSegments()[0];

  // サマリ画面で表示したドラフトを覚える。レンダー中に state を更新する形（React の「props の変化で
  // state を調整する」パターン）にして、記録前の値でコミットされる回を作らない。
  const [summaryVisitedWalkId, setSummaryVisitedWalkId] = useState<string | null>(null);
  if (
    isOnWalkSummary(rootSegment) &&
    unsavedWalkId !== null &&
    summaryVisitedWalkId !== unsavedWalkId
  ) {
    setSummaryVisitedWalkId(unsavedWalkId);
  }

  return shouldShowUpdateRequired({
    snapshot,
    platform: STORE_PLATFORM,
    currentVersion: CURRENT_APP_VERSION,
    deferForWalk: shouldDeferForWalk({
      hasActiveWalk,
      unsavedWalkId,
      summaryVisitedWalkId,
      signInForSaveRequested,
      rootSegment,
    }),
  });
}
