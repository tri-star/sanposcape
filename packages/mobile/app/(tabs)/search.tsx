import { SearchPlaceholderView } from "@/features/search/components/SearchPlaceholderView";

/**
 * 検索タブ。ピン検索は別タスク（ピン機能）に送るため、準備中の空状態のみ表示する。
 */
export default function SearchRoute() {
  return <SearchPlaceholderView />;
}
