import { describeError, logDiagnostic } from "@/lib/diagnosticLog";
import { registerSessionCleanup } from "@/lib/sessionCleanup";
import { locationService } from "@/services/location";

/**
 * 散歩の位置記録（SS-156 / ADR-M-018）の後始末。
 *
 * - 起動時: 進行中の散歩は永続化していない（ADR-M-008 決定5）ので、JS が起動した時点で記録すべき散歩は無い。
 *   OS は登録済みのタスクをアプリの再起動後も復元する（expo-task-manager）ため、ここで止めないと、
 *   散歩していないのに測位が続き、iOS では位置情報のインジケータが出たままになる。
 *   SS-36（ローカル永続化と復帰）に着手したら、ここを「止める」から「復元する」に差し替える。
 * - サインアウト時: バッファ（端末上のファイル）に前のユーザーの軌跡が残らないようにする（ADR-M-008 決定6）。
 *   通常は散歩の終了・endWalk による停止で済むが、画面が無い状態でのセッション終了にも備えて登録する。
 *
 * `index.ts` から副作用 import する（`expo-router/entry` より前。起動時の停止を、どの散歩の開始よりも先に
 * serialQueue に積むため）。`src/lib` から services のバレルを import するのはこのファイルだけの例外
 * （architecture-guideline の「単体テスト」節）。「起動時に必ず評価される副作用モジュール」であり、
 * 純粋ロジックの `lib/` の単体テストからは import されない。
 */
function stopInBackground(): void {
  // stopBackgroundTracking は throw しない契約だが、未処理の rejection を作らないよう念のため受ける。
  locationService.stopBackgroundTracking().catch((error: unknown) => {
    logDiagnostic("walk_background_tracking_cleanup_failed", describeError(error));
  });
}

stopInBackground();
registerSessionCleanup(stopInBackground);
