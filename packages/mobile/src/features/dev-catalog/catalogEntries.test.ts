import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CATALOG_ENTRIES, toCatalogFolderName } from "@/features/dev-catalog/catalogEntries";

describe("toCatalogFolderName", () => {
  it("PascalCase を kebab-case に変換する", () => {
    expect(toCatalogFolderName("Button")).toBe("button");
    expect(toCatalogFolderName("IconButton")).toBe("icon-button");
    expect(toCatalogFolderName("MapPin")).toBe("map-pin");
    expect(toCatalogFolderName("IllustrationSlot")).toBe("illustration-slot");
    expect(toCatalogFolderName("BottomSheet")).toBe("bottom-sheet");
  });
});

describe("CATALOG_ENTRIES", () => {
  it("src/components/ui/ の全フォルダが登録されている(登録漏れ検出)", () => {
    const uiDir = path.resolve(process.cwd(), "src/components/ui");
    const folders = readdirSync(uiDir, { withFileTypes: true })
      // ドットフォルダ(エディタ/ツールの作業ディレクトリ等)は component ではないため除外する
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();

    const registeredFolders = CATALOG_ENTRIES.map((entry) =>
      toCatalogFolderName(entry.title),
    ).sort();

    expect(registeredFolders).toEqual(folders);
  });

  it("title が重複しない", () => {
    const titles = CATALOG_ENTRIES.map((entry) => entry.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  // C-7: catalogEntries.ts と CatalogScreen.tsx が独立した手作業の二重管理にならないよう、
  // 「登録された全タイトルが CatalogScreen.tsx に対応する <CatalogSection> を持つ」ことを
  // 機械的に検証する(バリエーションの詳細までは追わないが、登録漏れ・タイトルの綴りズレは検出できる)。
  it("全エントリが CatalogScreen.tsx の <CatalogSection title=...> に対応する", () => {
    const screenSource = readFileSync(
      path.resolve(process.cwd(), "src/features/dev-catalog/components/CatalogScreen.tsx"),
      "utf-8",
    );
    for (const entry of CATALOG_ENTRIES) {
      expect(
        screenSource,
        `CatalogScreen.tsx に "${entry.title}" のセクションがありません`,
      ).toMatch(new RegExp(`<CatalogSection title="${entry.title}"`));
    }
  });
});
