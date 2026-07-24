import { Redirect } from "expo-router";

import { DesignSystemGallery } from "@/features/design-system/components/DesignSystemGallery";

/**
 * 開発確認用ルート。取り込んだトークン/UIプリミティブの一覧を表示する。
 * プロダクトの画面フロー確定に伴い `app/index.tsx` から退避した（SS-8）。
 * 本番ビルドではディープリンク経由でも到達できないよう `__DEV__` でガードする（SS-9）。
 */
export default function DesignSystemRoute() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return <DesignSystemGallery />;
}
