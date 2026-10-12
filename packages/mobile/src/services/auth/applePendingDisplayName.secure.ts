import * as SecureStore from "expo-secure-store";

import {
  parsePendingAppleDisplayName,
  serializePendingAppleDisplayName,
} from "@/services/auth/appleDisplayName";
import type { PendingAppleDisplayNameStore } from "@/services/auth/types";

/** 送り切れていない Apple の氏名の保存キー（SecureStore のキーに使える文字だけ）。 */
const PENDING_APPLE_DISPLAY_NAME_KEY = "sanposcape.applePendingDisplayName";

/**
 * 保留中の Apple の氏名の SecureStore 実装。`tokenStore.secure.ts` と同じ形で、`index.ts` からだけ import する
 * （ネイティブ依存のためテストしない）。
 * 氏名は個人情報なので refresh token と同じ Keychain に置く。値は最大でも 255 コードポイント + Apple の user で、
 * SecureStore の値の上限（約 2KB）に収まる。
 * iOS の Keychain はアプリを再インストールしても残りうるが、Apple のユーザーが一致したときに再送されるだけで害は無い。
 * サインアウト（アカウント削除成功後を含む）では `realSignOut.ts` が消す。1ユーザー分しか保持しない（単一スロット）。
 */
export const securePendingAppleDisplayNameStore: PendingAppleDisplayNameStore = {
  async load() {
    try {
      return parsePendingAppleDisplayName(
        await SecureStore.getItemAsync(PENDING_APPLE_DISPLAY_NAME_KEY),
      );
    } catch {
      return null;
    }
  },
  async save(value) {
    await SecureStore.setItemAsync(
      PENDING_APPLE_DISPLAY_NAME_KEY,
      serializePendingAppleDisplayName(value),
    );
  },
  async clear() {
    await SecureStore.deleteItemAsync(PENDING_APPLE_DISPLAY_NAME_KEY);
  },
};
