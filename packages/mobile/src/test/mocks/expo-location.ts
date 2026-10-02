/** vitest(node環境) 用の expo-location 最小モック。実装は services/location の mock を使うこと。 */
export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
} as const;

export type LocationObject = {
  coords: { latitude: number; longitude: number };
  timestamp: number;
};

export async function getForegroundPermissionsAsync() {
  return { status: "granted", canAskAgain: true };
}

export async function requestForegroundPermissionsAsync() {
  return { status: "granted", canAskAgain: true };
}

export async function getLastKnownPositionAsync() {
  return null;
}

export async function getCurrentPositionAsync() {
  return { coords: { latitude: 35.681236, longitude: 139.767125 }, timestamp: 0 };
}

/**
 * `location.real.ts` が vitest 上で import されても壊れないようにするためだけのスタブ。
 * 実際の通知を再現したテストは `createMockLocationService()` を使うこと（ADR-M-006 の規律）。
 */
export async function watchPositionAsync(
  _options: unknown,
  _callback: (position: LocationObject) => void,
) {
  return { remove() {} };
}

/** `location.real.ts` のモジュール評価時（オプション定数）に参照されるので必須。 */
export const ActivityType = {
  Other: 1,
  AutomotiveNavigation: 2,
  Fitness: 3,
  OtherNavigation: 4,
  Airborne: 5,
} as const;

/** 背景記録の API。vitest 上で import が壊れないためだけの no-op（振る舞いは hub のテストで担保する）。 */
export async function startLocationUpdatesAsync(_taskName: string, _options: unknown) {}

export async function stopLocationUpdatesAsync(_taskName: string) {}

export async function hasStartedLocationUpdatesAsync(_taskName: string) {
  return false;
}
