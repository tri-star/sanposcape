import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { locationService } from "@/services/location";
import type { LocationPrecision } from "@/services/location/types";

/**
 * 位置情報の精度の許可（「正確な位置情報」）を返す。enabled が false の間は null。
 * enabled になった時点と、アプリが前面へ戻るたび（設定アプリで切り替えて戻る想定）に確かめ直す。
 * ダイアログは出さない（getPrecision は getForegroundPermissionsAsync だけを使う）。
 * RN 依存の副作用層なので Vitest 対象外（判定は lib/locationPrecisionNotice.ts）。
 */
export function useLocationPrecision(input: { enabled: boolean }): LocationPrecision | null {
  const { enabled } = input;
  const [precision, setPrecision] = useState<LocationPrecision | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const check = () => {
      locationService.getPrecision().then(
        (p) => {
          if (!cancelled) setPrecision(p);
        },
        () => {},
      );
    };
    check();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") check();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [enabled]);

  // enabled が false の間は effect 内で state を戻さず、描画時に導出する。
  return enabled ? precision : null;
}
