export type WalkDeletionCleanup = (walkId: string) => void;

const cleanups = new Set<WalkDeletionCleanup>();

/**
 * 散歩がサーバー（backend）から削除されたときに走らせるべき後始末を登録する。
 * 各 store のモジュール末尾で読み込み時に1回だけ呼ぶ想定（例:
 * `features/walk/store/useFinishedWalkStore.ts`）。
 *
 * 目的: `docs/folder-structure.md` の「その機能の外から import されるものは置かない」により、
 * `features/history` から `features/walk/store/useFinishedWalkStore` を直接 import できない。
 * `src/lib/sessionCleanup.ts`（サインアウト時の後始末レジストリ）と同じ形の仕組みをここでも
 * 使うことで、クリアされる側（store）が自分の後始末を登録する向きに揃え、
 * `features/history` を `features/walk` の実装に結合させない。
 *
 * 登録はモジュール読み込み時に行われるため、当該ストアのモジュールが未ロードなら
 * 後始末は走らない。ただしストアはメモリ上のみで永続化しないため、未ロード = ドラフトも
 * 存在しない（例: 起動直後にディープリンクで詳細画面へ入り、散歩を一度も開始していない場合）。
 * `sessionCleanup.ts` と同じ性質であり実害は無い。
 */
export function registerWalkDeletionCleanup(cleanup: WalkDeletionCleanup): void {
  cleanups.add(cleanup);
}

/**
 * 登録済みの後始末をすべて実行する。1つが例外を投げても他の後始末の実行は止めない
 * （無関係な store のクリア失敗が原因で、他の後始末が走らなくなるのを避けるため。
 * `sessionCleanup.ts` の `runSessionCleanup` と同じ方針）。
 */
export function runWalkDeletionCleanup(walkId: string): void {
  for (const cleanup of cleanups) {
    try {
      cleanup(walkId);
    } catch {
      // 個々の後始末の失敗で他のクリアを止めない。詳細はこの関数の JSDoc を参照。
    }
  }
}

/** @internal テスト間で登録済みの後始末関数を隔離する。 */
export function resetWalkDeletionCleanupForTest(): void {
  cleanups.clear();
}
