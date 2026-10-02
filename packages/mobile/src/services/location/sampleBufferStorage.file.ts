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
 * バッファのファイル名。`Paths.document` に置くのは、OS に勝手に消されないため
 * （`Paths.cache` は空き容量が減ると消されうる）。SS-36 の復元でも同じファイルを使えるようにする。
 */
export const WALK_LOCATION_SAMPLES_FILE_NAME = "walk-location-samples.jsonl";

export function createFileSampleBufferStorage(): SampleBufferStorage {
  // File の生成もネイティブ呼び出しで throw しうる。モジュール評価時（import 時）に走らせると
  // アプリが起動不能になるため、初回利用時に生成してメモ化する。
  let cached: File | null = null;
  function getFile(): File {
    cached ??= new File(Paths.document, WALK_LOCATION_SAMPLES_FILE_NAME);
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
