import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";

/**
 * Vitest 共通のテストセットアップ。
 * MSW サーバーを起動し、API 連携ロジックをネットワーク非依存でテストする。
 * 各テストは `server.use(...)` でハンドラを追加する。
 */
export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
