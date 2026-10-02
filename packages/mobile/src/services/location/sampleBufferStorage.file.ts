import { File, Paths } from "expo-file-system";

import type { SampleBufferStorage } from "@/services/location/types";

/**
 * `expo-file-system`（新 API）による SampleBufferStorage の実装。ネイティブ依存のため単体テストの対象外。
 *
 * - このファイルは散歩の位置（機微情報）を一時的に持つ。散歩の終了・サインアウト・アプリ起動時に
 *   消す（ADR-M-018）。
 * - `expo-file-system` を位置サンプルのバッファ用途で import してよいのはこのファイルだけ。
 * - 例外はここでは捕まえない（`backgroundSampleHub` が捕まえて診断ログに出す）。
 */

/**
 * バッファのファイル名。`Paths.cache` に置くのは、バックアップ（iOS の iCloud / 端末バックアップ、
 * Android の Auto Backup）の対象外にするため。居場所の軌跡を端末外へ複製させない。
 * トレードオフとして、OS が空き容量不足で消しうる（その場合は軌跡が欠けるだけで、散歩は続く）。
 * 今は復元をしない（起動時に消す。ADR-M-008 決定5）ので問題にならない。SS-36 で復元を入れるときに
 * 置き場所を再検討する（ADR-M-018 決定6）。
 */
export const WALK_LOCATION_SAMPLES_FILE_NAME = "walk-location-samples.jsonl";

export function createFileSampleBufferStorage(): SampleBufferStorage {
  // File の生成もネイティブ呼び出しで throw しうる。モジュール評価時（import 時）に走らせると
  // アプリが起動不能になるため、初回利用時に生成してメモ化する。
  let cached: File | null = null;
  function getFile(): File {
    cached ??= new File(Paths.cache, WALK_LOCATION_SAMPLES_FILE_NAME);
    return cached;
  }
  return {
    read() {
      const file = getFile();
      return file.exists ? file.textSync() : null;
    },
    append(raw) {
      const file = getFile();
      if (!file.exists) file.create();
      file.write(raw, { append: true });
    },
    clear() {
      const file = getFile();
      if (file.exists) file.delete();
    },
  };
}
