/**
 * 設定画面の「バージョン」行の文言（SS-228。SS-230 でビルド番号・チャネル・OTA の ID を足した）。
 * `.tsx` は Vitest 対象外なので、文言の決定だけをこの純粋な `lib` に出す（先例: `accountDeleteCopy.ts`）。
 */

import { PRODUCTION_UPDATES_CHANNEL } from "@/config/appVariant";

/** 「バージョン」行のラベル。 */
export const APP_VERSION_LABEL = "バージョン";

/** バージョンを読めなかったときの表示。行ごと消すと「どこにあるか」を案内できなくなるので、行は残す。 */
export const APP_VERSION_UNKNOWN = "不明";

/** OTA の update ID を表示する桁数。問い合わせで EAS の update 一覧と突き合わせるのに足りる長さ。 */
const OTA_UPDATE_ID_LENGTH = 8;

/** 表示に使う実行中のアプリの情報。値は `src/config/currentAppVersion.ts` が読む。 */
export type AppVersionInfo = {
  /** app.json の `version`。 */
  version: string | null;
  /** ネイティブのビルド番号（EAS が採番する）。 */
  buildNumber: string | null;
  /** EAS Update のチャネル。 */
  channel: string | null;
  /** OTA の update で起動しているときの update ID。 */
  otaUpdateId: string | null;
};

function nonBlank(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * 表示するバージョン文字列。例: `1.0.0 (57)` / `1.0.0 (57) · OTA a1b2c3d4` / `1.0.0 (57) · staging`。
 * - `version` はそのまま出す（接頭辞 `v` は付けない）。`null`・空白だけのときは「不明」とし、付記は続けて出す（問い合わせの手がかりになる）。
 * - チャネルは本番以外のときだけ出す。次のリリースまで staging のビルドは公開版と同じ `version` を名乗るので、見分けるために要る。
 *   ビルドの種類での分岐は開発ツールの表示可否だけに使う規則（ADR-M-007 の SS-148 追補）の例外で、表示だけを変える（ADR-M-020 の SS-230 追補）。
 */
export function formatAppVersion(info: AppVersionInfo): string {
  let label = nonBlank(info.version) ?? APP_VERSION_UNKNOWN;
  const buildNumber = nonBlank(info.buildNumber);
  if (buildNumber !== null) label += ` (${buildNumber})`;
  const channel = nonBlank(info.channel);
  if (channel !== null && channel !== PRODUCTION_UPDATES_CHANNEL) label += ` · ${channel}`;
  const otaUpdateId = nonBlank(info.otaUpdateId);
  if (otaUpdateId !== null) label += ` · OTA ${otaUpdateId.slice(0, OTA_UPDATE_ID_LENGTH)}`;
  return label;
}
