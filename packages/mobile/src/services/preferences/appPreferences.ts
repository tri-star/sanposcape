import { describeError, logDiagnostic } from "@/lib/diagnosticLog";
import type {
  AppPreferences,
  AppPreferencesService,
  PreferenceStorage,
} from "@/services/preferences/types";
import { DEFAULT_THEME_MODE, isThemeMode } from "@/theme/themeMode";

export const APP_PREFERENCES_VERSION = 1;
export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  themeMode: DEFAULT_THEME_MODE,
  themeModeUpdatedAt: null,
};

/**
 * 保存文字列 → AppPreferences。どんな入力でも throw せず、解釈できない項目は既定値にする。
 * `version` は見ない（古いアプリへのダウングレード時に設定を失わないため）。未知のキーは読み取りでは無視する
 * （保存時は {@link saveThemeMode} が元の未知キーを残して書き戻す）。
 */
export function parseAppPreferences(raw: string | null): AppPreferences {
  if (raw === null || raw === "") return { ...DEFAULT_APP_PREFERENCES };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_APP_PREFERENCES };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_APP_PREFERENCES };
  }

  const record = parsed as Record<string, unknown>;
  // 壊れた themeMode の時刻は信用しない
  if (!isThemeMode(record.themeMode)) return { ...DEFAULT_APP_PREFERENCES };

  return {
    themeMode: record.themeMode,
    themeModeUpdatedAt:
      typeof record.themeModeUpdatedAt === "string" ? record.themeModeUpdatedAt : null,
  };
}

/** 保存文字列が JSON オブジェクトとして読めるときだけそのレコードを返す（壊れていれば null）。 */
function parseRawRecord(raw: string | null): Record<string, unknown> | null {
  if (raw === null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * AppPreferences → 保存文字列。
 * `base` を渡すと、その未知キーを残したまま既知フィールドを上書きする
 * （新しい版のアプリが書いたキーを、旧版の保存で消さないため）。
 */
export function serializeAppPreferences(
  prefs: AppPreferences,
  base: Record<string, unknown> | null = null,
): string {
  return JSON.stringify({
    ...base,
    version: APP_PREFERENCES_VERSION,
    themeMode: prefs.themeMode,
    themeModeUpdatedAt: prefs.themeModeUpdatedAt,
  });
}

export type AppPreferencesServiceOptions = {
  /** 現在時刻（テストで固定するため注入可能）。既定 () => new Date() */
  now?: () => Date;
  /** 読み書き失敗の通知。既定は logDiagnostic(event, describeError(error))。 */
  onError?: (event: "preferences_read_failed" | "preferences_write_failed", error: unknown) => void;
};

/**
 * 端末ローカルのアプリ設定サービス。ストレージは注入（`tokenStore.ts` と同じ DI の形）。
 * メソッドは `this` を使わないクロージャで、関数としてそのまま渡せる。
 */
export function createAppPreferencesService(
  storage: PreferenceStorage,
  options: AppPreferencesServiceOptions = {},
): AppPreferencesService {
  const now = options.now ?? (() => new Date());
  const onError =
    options.onError ??
    ((event, error) => {
      logDiagnostic(event, describeError(error));
    });

  /** 保存文字列。読めなければ null（onError に通知する）。 */
  function readRaw(): string | null {
    try {
      return storage.read();
    } catch (error) {
      onError("preferences_read_failed", error);
      return null;
    }
  }

  return {
    loadThemeMode() {
      return parseAppPreferences(readRaw()).themeMode;
    },
    saveThemeMode(mode) {
      const raw = readRaw();
      const current = parseAppPreferences(raw);
      const next: AppPreferences = {
        ...current,
        themeMode: mode,
        themeModeUpdatedAt: now().toISOString(),
      };
      try {
        storage.write(serializeAppPreferences(next, parseRawRecord(raw)));
      } catch (error) {
        onError("preferences_write_failed", error);
      }
    },
  };
}
