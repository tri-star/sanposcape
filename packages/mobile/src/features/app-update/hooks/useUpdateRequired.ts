import Constants from "expo-constants";
import { useSegments } from "expo-router";
import { useState } from "react";
import { Platform } from "react-native";

import {
  isOnWalkSummary,
  shouldDeferForWalk,
  shouldShowUpdateRequired,
  toStorePlatform,
} from "@/features/app-update/lib/updateRequired";
import { useActiveWalkStore } from "@/features/walk/store/useActiveWalkStore";
import { useFinishedWalkStore } from "@/features/walk/store/useFinishedWalkStore";
import { useAppConfig } from "@/hooks/useAppConfig";

/**
 * 実行中のアプリのバージョン。起動中に変わらないので、モジュール評価時に1回だけ読む。
 *
 * `Constants.expoConfig.version` は OTA の update で起動すると update の manifest の値になるが、
 * `runtimeVersion.policy` が `appVersion`（app.json）なので、update は同じ `version` のバイナリにしか届かない。
 * そのためバイナリの `version` と一致する。`expo-application` の `nativeApplicationVersion` は
 * ネイティブ依存の追加（development build の作り直し）になるので使わない（ADR-008 の SS-101 追補）。
 */
const CURRENT_APP_VERSION: string | null = Constants.expoConfig?.version ?? null;

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
