import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";

/**
 * `__DEV__` は RN のグローバルで vitest(node 環境)には存在しない。
 * 本番コードにテスト都合の分岐(`typeof __DEV__ !== "undefined"` 等)を持ち込まないため、
 * ここでグローバルとして定義する(既定は false。個別テストは `vi.stubGlobal("__DEV__", true)` で上書きする)。
 * `__DEV__` は RN の型定義で `declare global { const __DEV__: boolean }` となっており、
 * `const` 宣言は `globalThis` の型には反映されない(TypeScript の既知の挙動)ため、
 * `globalThis.__DEV__ = ...` は型エラーになる。`Object.assign` で回避する。
 */
Object.assign(globalThis, { __DEV__: false });

/**
 * Vitest 共通のテストセットアップ。
 * MSW サーバーを起動し、API 連携ロジックをネットワーク非依存でテストする。
 * 各テストは `server.use(...)` でハンドラを追加する。
 */
export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
