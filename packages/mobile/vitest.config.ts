import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Vitest 設定。
 * M1 段階では UI から分離した純粋ロジック・API 連携ロジック（node 環境）を対象にする。
 * RN コンポーネントのテストは今後、専用の環境/プリセット整備時に拡張する。
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["src/api/generated/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "react-native": path.resolve(__dirname, "src/test/mocks/react-native.ts"),
    },
  },
});
