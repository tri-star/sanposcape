import { Image } from "expo-image";

import { registerSessionCleanup } from "@/lib/sessionCleanup";

/**
 * サインアウト時に expo-image のメモリ・ディスクキャッシュを消す（SS-118）。
 * 写真は本人（地図の member）しか見られないため、共有端末でサインアウトした後に前のユーザーの
 * 写真が端末に残らないようにする（ADR-009（mobile）決定6 / ADR-008 決定6 と同じ考え方）。
 *
 * このモジュールを `PinPhotoImage.tsx`（コンポーネント）ではなく、起動時に必ず評価される
 * `app/_layout.tsx` から副作用 import することが重要（`import "@/lib/imageCacheCleanup"`）。
 * コンポーネント側で登録すると、そのコンポーネントが一度も画面に出ないままサインアウトした
 * セッションでは登録自体が走らず、ディスクキャッシュ（永続）が消えない
 * （SS-118 ローカルレビュー SEC-M1。以前はこのファイルの内容が `PinPhotoImage.tsx` の
 * モジュール末尾にあった。`docs/folder-structure.md` の
 * 「feature をまたぐイベントで他 feature の store をクリアしたくなったら」の節も参照）。
 */
registerSessionCleanup(() => {
  void Image.clearMemoryCache();
  void Image.clearDiskCache();
});
