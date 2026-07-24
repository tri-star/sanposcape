import { ScreenCatalog } from "@/features/design-system/components/ScreenCatalog";

/**
 * 開発確認用ルート。各主要画面をスタブデータ付きで直接開くための一覧（画面カタログ）。
 * プロダクト導線には含めない（開発者が URL 直打ち/リンクで開く）。
 */
export default function DevScreensRoute() {
  return <ScreenCatalog />;
}
