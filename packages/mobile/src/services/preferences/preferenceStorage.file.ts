import { File, Paths } from "expo-file-system";

import type { PreferenceStorage } from "@/services/preferences/types";

/**
 * `expo-file-system`（新 API）による実装。ネイティブ依存のため単体テストの対象外。
 * このファイルと `index.ts` 以外から `expo-file-system` の設定保存用途で import しない。
 * 例外はここでは捕まえない（サービス側で捕まえて診断ログに出す）。
 */

/** アプリのドキュメント領域（OS に勝手に消されない。アンインストール・「データを消去」で消える）。 */
const PREFERENCES_FILE_NAME = "app-preferences.json";

export function createFilePreferenceStorage(): PreferenceStorage {
  const file = new File(Paths.document, PREFERENCES_FILE_NAME);
  return {
    read() {
      return file.exists ? file.textSync() : null;
    },
    write(raw) {
      if (!file.exists) file.create(); // write() は既存ファイル前提（公式例も create → write）
      file.write(raw);
    },
  };
}
