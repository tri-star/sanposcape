import { createAppPreferencesService } from "@/services/preferences/appPreferences";
import { createFilePreferenceStorage } from "@/services/preferences/preferenceStorage.file";
import type { AppPreferencesService } from "@/services/preferences/types";

export type { AppPreferences, AppPreferencesService } from "@/services/preferences/types";

/**
 * 端末ローカルのアプリ設定。real/mock を環境変数で切り替えない（EXPO_PUBLIC_*_MODE を作らない）。
 * - E2E（Maestro）は real のまま再現できる（clearState で消える）。
 * - 単体テストはこのバレルを import せず、createAppPreferencesService + createMemoryPreferenceStorage
 *   を直接使う（このバレルは expo-file-system に到達するため）。
 */
export const appPreferences: AppPreferencesService = createAppPreferencesService(
  createFilePreferenceStorage(),
);
