import { Redirect } from "expo-router";

import { isDevToolsEnabled } from "@/config/devTools";
import { ScreenCatalog } from "@/features/design-system/components/ScreenCatalog";

/**
 * 開発確認用ルート。各主要画面をスタブデータ付きで直接開くための一覧（画面カタログ）。
 * プロダクト導線には含めない（開発者が URL 直打ち/リンクで開く）。
 * 本番ビルド（`APP_VARIANT=production` / `production` チャネル）では、ディープリンク経由でも到達できないよう
 * `isDevToolsEnabled()` でガードする。development / E2E / staging（TestFlight）では開ける
 * （SS-148。SS-9 までは `__DEV__`）。
 */
export default function DevScreensRoute() {
  if (!isDevToolsEnabled()) {
    return <Redirect href="/" />;
  }
  return <ScreenCatalog />;
}
