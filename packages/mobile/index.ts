/**
 * アプリのエントリポイント。
 *
 * 起動前に初期化が必要な処理（ポリフィル・計測の初期化など）を差し込めるよう
 * `package.json` の `main` はこのファイルを指している。
 *
 * 1. 散歩の位置記録タスクの定義（SS-156 / ADR-M-018）。`TaskManager.defineTask` はバンドルの
 *    グローバルスコープで評価しなければならない（React のライフサイクル内では不可）。
 *    バックグラウンドで JS が起動したときも、ビューを1つもマウントせずにタスクを実行できるようにするため。
 *    未定義のタスク名にイベントが届くと expo-task-manager がそのタスクを登録解除するので、ここから外さない。
 * 2. 前回プロセスの記録タスクの停止と、サインアウト時の後始末の登録。
 * 3. Expo Router。
 */
import "@/services/location/backgroundLocationTask";
import "@/lib/backgroundLocationCleanup";
import "expo-router/entry";
