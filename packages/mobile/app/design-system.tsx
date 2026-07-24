import { DesignSystemGallery } from "@/features/design-system/components/DesignSystemGallery";

/**
 * 開発確認用ルート。取り込んだトークン/UIプリミティブの一覧を表示する。
 * プロダクトの画面フロー確定に伴い `app/index.tsx` から退避した（SS-8）。
 */
export default function DesignSystemRoute() {
  return <DesignSystemGallery />;
}
