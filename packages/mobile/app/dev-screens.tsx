import { Redirect } from "expo-router";

import { ScreenCatalog } from "@/features/design-system/components/ScreenCatalog";

/**
 * 開発確認用ルート。各主要画面をスタブデータ付きで直接開くための一覧（画面カタログ）。
 * プロダクト導線には含めない（開発者が URL 直打ち/リンクで開く）。
 * 本番ビルドではディープリンク経由でも到達できないよう `__DEV__` でガードする。
 */
export default function DevScreensRoute() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return <ScreenCatalog />;
}
