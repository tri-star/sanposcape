export type SessionCleanup = () => void;

const cleanups = new Set<SessionCleanup>();

/**
 * サインアウト時にクリアすべきクライアント状態（feature の Zustand store・TanStack Query の
 * キャッシュ等）の後始末関数を登録する。各 store・キャッシュ側のモジュールが読み込み時に
 * 1回だけ呼ぶ想定（例: `useFinishedWalkStore.ts` の末尾）。
 *
 * 目的: サインアウト導線（呼び出し側）を、クリア対象が増えるたびに編集しなくて済むようにする。
 * 共有端末での認証切り替え時、前のユーザーの下書き（散歩の軌跡など）が次のユーザーの
 * トークンで送信・上書きされる事故を防ぐため、feature 側の store が増えるたびに
 * 同種の指摘が繰り返されないよう、クリア対象をここ1箇所に集約する。
 */
export function registerSessionCleanup(cleanup: SessionCleanup): void {
  cleanups.add(cleanup);
}

/**
 * 登録済みの後始末関数をすべて実行する。呼び出し側はサインアウトを実行するレイヤのみ
 * （現状は `SettingsView` のサインアウト導線）。
 * 1つが例外を投げても他の後始末の実行は止めない（無関係な store のクリア失敗が原因で、
 * 他の機微データ（位置情報の軌跡など）が残留するのを避けるため）。
 */
export function runSessionCleanup(): void {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      // 個々の後始末の失敗で他のクリアを止めない。詳細はこの関数の JSDoc を参照。
    }
  }
}
