/**
 * vitest(node環境) 用の expo-secure-store モック。実機の Keychain は存在しないためメモリで代替する。
 * 保険: 将来テストが間接的に tokenStore.secure.ts へ到達したときに、原因の分かりにくい失敗を防ぐ。
 * `react-native-nitro-google-signin` のエイリアスは追加しない
 * （テストがそこへ到達したら設計違反なので、エラーで気づけるほうが良い）。
 */
const store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return store.has(key) ? (store.get(key) ?? null) : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}
