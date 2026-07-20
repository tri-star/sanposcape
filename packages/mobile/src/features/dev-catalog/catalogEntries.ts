export type CatalogEntry = {
  /** セクション見出し。例: "Button"(コンポーネントの PascalCase 名と一致させる) */
  title: string;
};

/**
 * `src/components/ui/` の primitive 一覧(登録漏れ検出専用)。
 *
 * 以前はここに `group`/`variants` も持たせていたが、`CatalogScreen.tsx` の実際の JSX
 * (バリエーションごとの props・testID・インタラクティブな state)から独立して手で
 * 二重管理する形になっており、コンポーネントの variant を変更するたびに両方を更新する必要が
 * あった(C-7)。実際の見た目・バリエーションの一覧は `CatalogScreen.tsx` の JSX を参照する
 * こととし、ここは「`src/components/ui/` の全フォルダに対応するセクションが
 * `CatalogScreen.tsx` に存在するか」を `catalogEntries.test.ts` で機械検証するための
 * 最小限のマニフェストに絞った。コンポーネントを追加したら、ここへ1行足すだけで良い
 * (`title` の PascalCase → フォルダの kebab-case への変換は `toCatalogFolderName` を使う)。
 */
export const CATALOG_ENTRIES: CatalogEntry[] = [
  { title: "Icon" },
  { title: "Button" },
  { title: "IconButton" },
  { title: "Card" },
  { title: "Avatar" },
  { title: "StatBlock" },
  { title: "ProgressBar" },
  { title: "Input" },
  { title: "Switch" },
  { title: "Checkbox" },
  { title: "Radio" },
  { title: "Badge" },
  { title: "Tag" },
  { title: "Toast" },
  { title: "Dialog" },
  { title: "BottomSheet" },
  { title: "Select" },
  { title: "MapPin" },
  { title: "IllustrationSlot" },
];

/** PascalCase のコンポーネント名を `src/components/ui/` のフォルダ名(kebab-case)に変換する */
export function toCatalogFolderName(title: string): string {
  return title.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
