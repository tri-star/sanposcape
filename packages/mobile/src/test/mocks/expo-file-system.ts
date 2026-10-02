/**
 * vitest(node環境) 用の expo-file-system 最小モック（メモリ上の File）。
 * バレル経由の import で壊れないためだけのもの。保存の振る舞いは
 * `createMemorySampleBufferStorage` でテストすること。
 */
export const Paths = { document: "memory://document", cache: "memory://cache" } as const;

const files = new Map<string, string>();

export class File {
  private readonly uri: string;

  constructor(...parts: unknown[]) {
    this.uri = parts.map(String).join("/");
  }

  get exists(): boolean {
    return files.has(this.uri);
  }

  create(): void {
    if (!files.has(this.uri)) files.set(this.uri, "");
  }

  write(content: string, options?: { append?: boolean }): void {
    files.set(this.uri, options?.append ? (files.get(this.uri) ?? "") + content : content);
  }

  textSync(): string {
    return files.get(this.uri) ?? "";
  }

  delete(): void {
    files.delete(this.uri);
  }
}
