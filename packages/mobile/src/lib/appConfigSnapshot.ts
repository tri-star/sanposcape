import type { AppConfigRead } from "@/api/generated/model";

/**
 * - loading      : まだ1度も取得できていない（起動直後）。
 * - ready        : 取得済みの値を持っている（再取得に失敗していても、直近の成功値があればこちら）。
 * - unavailable  : 取得に失敗し、直近の成功値も無い。
 *
 * `ready` 以外は ADR-008 決定9 のフェイルセーフで「全フラグ OFF」として扱う。
 * `loading` と `unavailable` を分けているのは、**画面のチラつきを避けたい呼び出し側が
 * 「まだ分からない」と「OFF が確定した」を区別できるようにする**ため
 * （`@/lib/featureGate` の `resolveFeatureGateDecision` が使う）。
 */
export type AppConfigStatus = "loading" | "ready" | "unavailable";

/** `X.Y.Z` 形式 or null（= 指定なし = 強制アップデートしない）。比較は SS-101 の責務でここでは行わない。 */
export type MinimumSupportedVersions = { ios: string | null; android: string | null };

/**
 * アプリが参照するアプリ設定のスナップショット。
 *
 * **`config_source` を意図的に持たない。** ADR-008 追補 D1 が
 * 「クライアントはこの値で分岐してはいけない」と定めているため、
 * プロダクトコードが参照できる型から落とすことで構造的に担保する
 * （診断表示が必要な `__DEV__` 画面だけは `@/hooks/useAppConfig` の
 * `useAppConfigDiagnostics()` から読む）。
 */
export type AppConfigSnapshot = {
  status: AppConfigStatus;
  flags: Readonly<Record<string, boolean>>;
  minimumSupportedVersions: MinimumSupportedVersions;
};

export const EMPTY_MINIMUM_SUPPORTED_VERSIONS: MinimumSupportedVersions = {
  ios: null,
  android: null,
};

/** 取得できていないときの値（全フラグ OFF / 最低バージョン指定なし）。ADR-008 決定9。 */
export const APP_CONFIG_FALLBACK_FLAGS: Readonly<Record<string, boolean>> = Object.freeze({});

/**
 * API レスポンス（snake_case）をアプリ内部の形（camelCase）へ整形し、取得状態を判定する。
 *
 * 優先順位:
 * 1. `input.data` がある → `status: "ready"`。**`isError` が true でも data があれば `ready`**
 *    （再取得の失敗で直近の成功値を捨てない。チラつき対策）。
 * 2. `data` が無く `isError` → `status: "unavailable"`。
 * 3. それ以外 → `status: "loading"`。
 */
export function toAppConfigSnapshot(input: {
  data: AppConfigRead | undefined;
  isError: boolean;
}): AppConfigSnapshot {
  if (input.data !== undefined) {
    return {
      status: "ready",
      flags: input.data.flags ?? {},
      minimumSupportedVersions: {
        ios: input.data.minimum_supported_versions?.ios ?? null,
        android: input.data.minimum_supported_versions?.android ?? null,
      },
    };
  }

  if (input.isError) {
    return {
      status: "unavailable",
      flags: APP_CONFIG_FALLBACK_FLAGS,
      minimumSupportedVersions: EMPTY_MINIMUM_SUPPORTED_VERSIONS,
    };
  }

  return {
    status: "loading",
    flags: APP_CONFIG_FALLBACK_FLAGS,
    minimumSupportedVersions: EMPTY_MINIMUM_SUPPORTED_VERSIONS,
  };
}

/**
 * 未知キー・ロード中・取得失敗はすべて false（ADR-008 決定9 のフェイルセーフ）。
 * `=== true` にすることで、値が bool でない異常応答・未知キー・`undefined` をすべて OFF に倒す。
 * `status` を見る必要は無い ―― `loading` / `unavailable` の `flags` は空なので自然に false になる。
 */
export function isFeatureEnabled(snapshot: AppConfigSnapshot, key: string): boolean {
  return snapshot.flags[key] === true;
}
