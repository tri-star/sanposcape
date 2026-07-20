/**
 * vitest (node環境) 用の react-native モック。
 * RN本体はFlow構文を含みnode環境でパースできないため、
 * ロジックテストで参照される API のみ最小限に差し替える。
 */
export const Platform: { OS: string } = {
  OS: "ios",
};
