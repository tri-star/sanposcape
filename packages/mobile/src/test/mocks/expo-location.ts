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
