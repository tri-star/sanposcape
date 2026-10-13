import { normalizeHeadingDegrees } from "@/lib/heading";
import type { HeadingListener, LocationSubscription } from "@/services/location/types";

/** ネイティブの方位の購読を1本始める関数。`emit` に正規化済みの方位を流す。 */
export type HeadingSource = (emit: HeadingListener) => Promise<LocationSubscription>;

export type HeadingMultiplexer = {
  /**
   * 方位を購読する。最初の購読でネイティブの購読を始め、最後の購読の remove() で止める。
   * 開始に失敗したら reject し、次の購読でやり直す。
   */
  subscribe(listener: HeadingListener): Promise<LocationSubscription>;
};

/**
 * 方位のネイティブ購読を1本にまとめ、複数のリスナーへ配る（SS-169）。
 *
 * Android の expo-location は方位の watch をプロセスで1つしか持てない（`watchDeviceHeading` が
 * 直前の watchId を上書きする）。地図は複数の画面に同時にマウントされうる（タブは裏でも残る）ので、
 * 画面ごとに `watchHeadingAsync` を呼ぶと、後から購読した側しか通知を受けない。
 *
 * 後から加わったリスナーには、直近の方位をすぐに1回渡す（センサーの次の通知を待たない）。
 */
export function createHeadingMultiplexer(start: HeadingSource): HeadingMultiplexer {
  const listeners = new Set<HeadingListener>();
  let native: Promise<LocationSubscription> | null = null;
  let latest: number | null = null;

  function emit(degrees: number): void {
    const normalized = normalizeHeadingDegrees(degrees);
    if (normalized === null) return;
    latest = normalized;
    for (const listener of [...listeners]) listener(normalized);
  }

  function stopIfIdle(): void {
    if (listeners.size > 0 || native === null) return;
    const stopping = native;
    native = null;
    latest = null;
    // 開始が失敗していたら止めるものは無い。
    void stopping.then(
      (subscription) => subscription.remove(),
      () => undefined,
    );
  }

  return {
    async subscribe(listener) {
      listeners.add(listener);
      if (native === null) native = start(emit);
      const current = native;
      try {
        await current;
      } catch (error) {
        listeners.delete(listener);
        // 同じ開始を待っていた他のリスナーも reject される。次の subscribe で開始し直せるようにする。
        if (native === current) {
          native = null;
          latest = null;
        }
        throw error;
      }
      if (latest !== null && listeners.has(listener)) listener(latest);

      let removed = false;
      return {
        remove() {
          if (removed) return;
          removed = true;
          listeners.delete(listener);
          stopIfIdle();
        },
      };
    },
  };
}
