/** vitest(node環境) 用の expo-location 最小モック。実装は services/location の mock を使うこと。 */
export const Accuracy = { Balanced: 3 } as const;

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
