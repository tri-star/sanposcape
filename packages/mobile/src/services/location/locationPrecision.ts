import type { LocationPrecision } from "@/services/location/types";

/** expo-location の LocationPermissionResponse のうち、判定に使う部分だけ（構造的に互換）。 */
export type ForegroundPermissionSnapshot = {
  granted: boolean;
  ios?: { accuracy?: string } | null;
  android?: { accuracy?: string } | null;
};

/**
 * 前景の権限の応答 → 精度の許可への写像（純粋）。`expo-location` を import しない
 * （Vitest でテストするため。`locationError.ts` と同じ置き方）。
 *
 * - 権限が無ければ null。
 * - iOS: `ios.accuracy === "reduced"`（EXBaseLocationRequester.m の accuracyAuthorizationString。
 *   iOS 14 未満は "full"）。
 * - Android: `android.accuracy === "coarse"`（LocationModule.kt の getForegroundPermissionsAsync。
 *   fine が無く coarse だけのとき）。
 * - フィールドが無い・想定外の値は precise にする（案内を出さない側に倒す）。
 */
export function toLocationPrecision(
  snapshot: ForegroundPermissionSnapshot,
): LocationPrecision | null {
  if (!snapshot.granted) return null;
  if (snapshot.ios?.accuracy === "reduced") return "approximate";
  if (snapshot.android?.accuracy === "coarse") return "approximate";
  return "precise";
}
