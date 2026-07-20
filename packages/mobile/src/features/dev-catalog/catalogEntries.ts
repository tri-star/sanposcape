export type CatalogGroup = "core" | "data" | "forms" | "feedback" | "overlays" | "map";

export type CatalogEntry = {
  /** セクション見出し。例: "Button"(コンポーネントの PascalCase 名と一致させる) */
  title: string;
  group: CatalogGroup;
  /** 各バリエーションの表示名 */
  variants: string[];
};

/**
 * `src/components/ui/` の primitive を一覧するカタログの構成データ。
 * コンポーネントを追加したら、ここへ1行足すだけで良いようにする。
 * `catalogEntries.test.ts` が `src/components/ui/` の全フォルダとの突き合わせで
 * 登録漏れを検出する(`title` の PascalCase → フォルダの kebab-case への変換は
 * `toCatalogFolderName` を使う)。
 */
export const CATALOG_ENTRIES: CatalogEntry[] = [
  { title: "Icon", group: "core", variants: ["home", "map-pin", "search", "settings"] },
  { title: "Button", group: "core", variants: ["primary", "secondary", "ghost", "danger"] },
  { title: "IconButton", group: "core", variants: ["primary", "secondary", "ghost"] },
  { title: "Card", group: "data", variants: ["none", "sm", "md", "lg"] },
  { title: "Avatar", group: "data", variants: ["sm", "md", "lg", "xl"] },
  { title: "StatBlock", group: "data", variants: ["md", "lg"] },
  { title: "ProgressBar", group: "data", variants: ["sm", "md"] },
  { title: "Input", group: "forms", variants: ["default", "error", "disabled"] },
  { title: "Switch", group: "forms", variants: ["on", "off", "disabled"] },
  { title: "Checkbox", group: "forms", variants: ["unchecked", "checked", "indeterminate"] },
  { title: "Radio", group: "forms", variants: ["unselected", "selected"] },
  {
    title: "Badge",
    group: "feedback",
    variants: ["neutral", "primary", "success", "warning", "danger"],
  },
  { title: "Tag", group: "feedback", variants: ["park", "cafe", "culture", "station"] },
  { title: "Toast", group: "feedback", variants: ["info", "success", "warning", "danger"] },
  { title: "Dialog", group: "overlays", variants: ["default", "destructive"] },
  { title: "BottomSheet", group: "overlays", variants: ["default"] },
  { title: "Select", group: "overlays", variants: ["default"] },
  {
    title: "MapPin",
    group: "map",
    variants: ["park", "cafe", "culture", "station", "current", "destination"],
  },
  {
    title: "IllustrationSlot",
    group: "map",
    variants: ["home-hero", "empty-walks", "empty-spots", "nav-idle"],
  },
];

/** PascalCase のコンポーネント名を `src/components/ui/` のフォルダ名(kebab-case)に変換する */
export function toCatalogFolderName(title: string): string {
  return title.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
