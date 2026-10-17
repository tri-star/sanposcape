import { isBelowMinimumVersion } from "@/features/app-update/lib/appVersion";
import type { AppConfigSnapshot } from "@/lib/appConfigSnapshot";

/** `Platform.OS` のうち、最低サポートバージョンを持つもの。それ以外（web など）は判定しない。 */
export type StorePlatform = "ios" | "android";

/**
 * ストアの掲載ページ。**ビルドの種類で切り替えない**（ADR-M-020 の法的文書の URL と同じ。
 * `src/config/devTools.ts` の「ビルドの種類で分岐してよいのは開発ツールの表示可否だけ」）。
 * staging・開発ビルドで開くと本番アプリの掲載ページになるが、それらは TestFlight・APK で更新する。
 *
 * - iOS: 本番のアプリレコード（`eas.json` の `submit.production.ios.ascAppId`）。
 * - Android: 本番のパッケージ名（`app.config.ts` の `PRODUCTION_VARIANT.androidPackage`）。
 *
 * どちらも `https` にしている。iOS は `apps.apple.com`、Android は `play.google.com` の URL を
 * OS がストアのアプリへ渡す（ストアのアプリが無い端末ではブラウザで開く）。
 */
export const STORE_URLS: Readonly<Record<StorePlatform, string>> = {
  ios: "https://apps.apple.com/app/id6823866201",
  android: "https://play.google.com/store/apps/details?id=com.sanposcape.app",
};

/** ストアを開くボタンの文言。 */
export const STORE_BUTTON_LABELS: Readonly<Record<StorePlatform, string>> = {
  ios: "App Store を開く",
  android: "Google Play を開く",
};

/** `Platform.OS` の値を、最低サポートバージョンを持つ OS に絞る。 */
export function toStorePlatform(os: string): StorePlatform | null {
  return os === "ios" || os === "android" ? os : null;
}

/**
 * アップデートを求める全画面の案内を出すか（SS-101）。
 *
 * - `ready` のときだけ判定する。`loading`（初回取得前）・`unavailable`（取得失敗・成功値なし）は出さない。
 *   取得完了を起動条件にしない方針（`architecture-guideline.md`「フィーチャーフラグの扱い」）と同じで、
 *   通信断でアプリを使えなくしないため。成功値があれば再取得の失敗中も `ready` のまま判定する。
 * - `walkInProgress`（進行中の散歩・保存されていない散歩がある）の間は出さない。散歩は永続化されず
 *   （ADR-M-008）、ストアへ送るとアプリの終了で記録を失うため。散歩が終われば出る。
 *   contract（API の削除）は最低バージョンを上げてから古いクライアントが減るのを待って行うので、
 *   散歩の終了まで遅らせても互換の問題にはならない（ADR-008 決定7）。
 */
export function shouldShowUpdateRequired(input: {
  snapshot: Pick<AppConfigSnapshot, "status" | "minimumSupportedVersions">;
  platform: StorePlatform | null;
  currentVersion: string | null;
  walkInProgress: boolean;
}): boolean {
  if (input.walkInProgress) return false;
  if (input.snapshot.status !== "ready" || input.platform === null) return false;
  return isBelowMinimumVersion({
    currentVersion: input.currentVersion,
    minimumVersion: input.snapshot.minimumSupportedVersions[input.platform],
  });
}

/** ストアを開けなかったときの画面内の案内。URL を含める（手でストア・ブラウザを開けるように）。 */
export function storeOpenFailedMessage(url: string): string {
  return `ストアを開けませんでした。ストアで「sanposcape」を検索してアップデートするか、次のアドレスを開いてください: ${url}`;
}
