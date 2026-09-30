import { Redirect } from "expo-router";

import { isDevToolsEnabled } from "@/config/devTools";
import { DesignSystemGallery } from "@/features/design-system/components/DesignSystemGallery";

/**
 * 開発確認用ルート。取り込んだトークン/UIプリミティブの一覧を表示する。
 * プロダクトの画面フロー確定に伴い `app/index.tsx` から退避した（SS-8）。
 * 本番ビルド（`APP_VARIANT=production` / `production` チャネル）では、ディープリンク経由でも到達できないよう
 * `isDevToolsEnabled()` でガードする（SS-9。SS-148 で `__DEV__` から置き換え、development / E2E / staging では開ける）。
 */
export default function DesignSystemRoute() {
  if (!isDevToolsEnabled()) {
    return <Redirect href="/" />;
  }
  return <DesignSystemGallery />;
}
