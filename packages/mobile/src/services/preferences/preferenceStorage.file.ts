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
  // File の生成もネイティブ呼び出しで throw しうる。モジュール評価時（import 時）に走らせると
  // アプリが起動不能になるため、初回利用時に生成してメモ化する（失敗はサービス側の try/catch へ）。
  let cached: File | null = null;
  function getFile(): File {
    cached ??= new File(Paths.document, PREFERENCES_FILE_NAME);
    return cached;
  }
  return {
    read() {
      const file = getFile();
      return file.exists ? file.textSync() : null;
    },
    write(raw) {
      const file = getFile();
      if (!file.exists) file.create(); // write() は既存ファイル前提（公式例も create → write）
      file.write(raw);
    },
  };
}
