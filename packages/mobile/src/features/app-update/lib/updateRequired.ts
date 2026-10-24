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

/** サマリ画面（`app/walk-summary.tsx`）と認証画面（`app/(auth)/`）の先頭セグメント。 */
const WALK_SUMMARY_SEGMENT = "walk-summary";
const AUTH_GROUP_SEGMENT = "(auth)";

/**
 * 散歩の記録を失わないために、案内を遅らせるべきか（SS-101）。
 *
 * 散歩は永続化されず（ADR-M-008）、ストアへ移ってアプリが終了すると記録を失う。遅らせるのは
 * **まだ記録を残せる間**だけにする:
 * - 散歩中（`hasActiveWalk`）。
 * - 保存されていない散歩があり、サマリ画面にいる（保存の実行中・再試行・サインインの CTA）。
 * - 保存されていない散歩があり、サマリの CTA から来た保存のためのサインインの途中
 *   （`signInForSaveRequested` かつ認証画面。サインイン後にサマリへ戻って保存する。SS-37）。
 * - 保存されていない散歩が、まだサマリ画面に着いていない（散歩の終了からサマリへの遷移の途中）。
 *   `useSegments()` はナビゲーションの状態が変わったコミットより1つ遅れて更新されるので、終了の直後は
 *   散歩中の画面のセグメントのまま `hasActiveWalk` だけが false になる。ここで遅らせないと、
 *   終了確認の `Dialog` が閉じるのと同時に案内の `Modal` が一瞬開く（SS-101 のレビューで判明）。
 *
 * サマリに着いた後に「ホームへ」で離れたドラフトは、サインアウトか次の散歩まで残るが、戻って保存する導線が無い。
 * これを条件に入れると、アプリを再起動するまで案内が出なくなるため、サマリを離れたら遅らせない。
 */
export function shouldDeferForWalk(input: {
  hasActiveWalk: boolean;
  /** 保存されていない散歩の `clientWalkId`。無ければ null。 */
  unsavedWalkId: string | null;
  /** サマリ画面で表示したことのある、保存されていない散歩の `clientWalkId`。 */
  summaryVisitedWalkId: string | null;
  signInForSaveRequested: boolean;
  /** `useSegments()` の先頭。ルートの外（初回描画前）では undefined。 */
  rootSegment: string | undefined;
}): boolean {
  if (input.hasActiveWalk) return true;
  if (input.unsavedWalkId === null) return false;
  if (input.rootSegment === WALK_SUMMARY_SEGMENT) return true;
  if (input.signInForSaveRequested && input.rootSegment === AUTH_GROUP_SEGMENT) return true;
  return input.summaryVisitedWalkId !== input.unsavedWalkId;
}

/** サマリ画面にいるか（`summaryVisitedWalkId` を記録する条件）。 */
export function isOnWalkSummary(rootSegment: string | undefined): boolean {
  return rootSegment === WALK_SUMMARY_SEGMENT;
}

/**
 * アップデートを求める全画面の案内を出すか（SS-101）。
 *
 * - `ready` のときだけ判定する。`loading`（初回取得前）・`unavailable`（取得失敗・成功値なし）は出さない。
 *   取得完了を起動条件にしない方針（`architecture-guideline.md`「フィーチャーフラグの扱い」）と同じで、
 *   通信断でアプリを使えなくしないため。成功値があれば再取得の失敗中も `ready` のまま判定する。
 * - `deferForWalk`（`shouldDeferForWalk`。散歩中・保存できる間の未保存の散歩）の間は出さない。
 *   散歩を終えて保存するか、サマリ画面を離れれば出る。
 *   contract（API の削除）は最低バージョンを上げてから1日経った後に行うので、
 *   散歩の終了まで遅らせても互換の問題にはならない（ADR-008 決定7、SS-233 追補 D43）。
 */
export function shouldShowUpdateRequired(input: {
  snapshot: Pick<AppConfigSnapshot, "status" | "minimumSupportedVersions">;
  platform: StorePlatform | null;
  currentVersion: string | null;
  deferForWalk: boolean;
}): boolean {
  if (input.deferForWalk) return false;
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
