/**
 * vitest (node環境) 用の react-native モック。
 * RN本体はFlow構文を含みnode環境でパースできないため、
 * ロジックテストで参照される API のみ最小限に差し替える。
 */
export const Platform: { OS: string; Version: number | string } = {
  OS: "ios",
  Version: "17.0",
};

/** 通知権限の要求だけ（location.real.ts）。テストは vi.mock で差し替える。 */
export const PermissionsAndroid = {
  PERMISSIONS: { POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS" },
  check: async (_permission: string): Promise<boolean> => false,
  request: async (_permission: string): Promise<string> => "denied",
};
