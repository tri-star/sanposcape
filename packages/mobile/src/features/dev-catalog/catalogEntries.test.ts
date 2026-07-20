import { readdirSync } from "node:fs";
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
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    const registeredFolders = CATALOG_ENTRIES.map((entry) =>
      toCatalogFolderName(entry.title),
    ).sort();

    expect(registeredFolders).toEqual(folders);
  });

  it("全エントリの variants が1つ以上ある", () => {
    for (const entry of CATALOG_ENTRIES) {
      expect(entry.variants.length).toBeGreaterThan(0);
    }
  });

  it("title が重複しない", () => {
    const titles = CATALOG_ENTRIES.map((entry) => entry.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
