import { defineConfig } from "orval";

/**
 * backend の OpenAPI 定義（packages/backend/openapi.yaml）から
 * TanStack Query 用の API クライアントと MSW モックを生成する。
 *
 *   pnpm --filter mobile orval
 *
 * 生成物は src/api/generated/（gitignore 済み）に出力される。
 */
export default defineConfig({
  sanposcape: {
    input: "../backend/openapi.yaml",
    output: {
      mode: "tags-split",
      target: "src/api/generated/endpoints",
      schemas: "src/api/generated/model",
      client: "react-query",
      httpClient: "fetch",
      mock: true,
      clean: true,
      override: {
        mutator: {
          path: "src/api/client.ts",
          name: "customFetch",
        },
        query: {
          useQuery: true,
        },
      },
    },
  },
});
