import { normalizeHeadingDegrees } from "@/lib/heading";
import type { HeadingListener, LocationSubscription } from "@/services/location/types";

/** ネイティブの購読に渡す通知口。 */
export type HeadingSourceHandlers = {
  /** 方位（度）を流す。範囲外の値は多重化の側で正規化し、不正な値は捨てる。 */
  emit: (degrees: number) => void;
  /** 開始後に購読が失敗して、もう方位が届かないことを伝える。 */
  fail: () => void;
};

/** ネイティブの方位の購読を1本始める関数。 */
export type HeadingSource = (handlers: HeadingSourceHandlers) => Promise<LocationSubscription>;

export type HeadingMultiplexer = {
  /**
   * 方位を購読する。最初の購読でネイティブの購読を始め、最後の購読を外してから `stopDelayMs` 待って止める。
   * 開始に失敗したら reject し、次の購読でやり直す。
   */
  subscribe(listener: HeadingListener): Promise<LocationSubscription>;
};

/**
 * 最後の購読が外れてからネイティブの購読を止めるまでの猶予（ms）。
 * タブの切り替えでは、前の画面の解除と次の画面の購読がほぼ同時に起きる。すぐ止めて張り直すと、
 * Android の expo-location は新しい watch の開始が古い watch の解除より先にネイティブへ届き、
 * 直前の向きを覚えたまま「約 2° 以上変わるまで通知しない」ので、端末を回すまで扇形が出ない。
 */
const DEFAULT_STOP_DELAY_MS = 1000;

/**
 * 方位のネイティブ購読を1本にまとめ、複数のリスナーへ配る（SS-169）。
 *
 * Android の expo-location は方位の watch をプロセスで1つしか持てない（`watchDeviceHeading` が
 * 直前の watchId を上書きする）。地図は複数の画面に同時にマウントされうる（タブは裏でも残る）ので、
 * 画面ごとに `watchHeadingAsync` を呼ぶと、後から購読した側しか通知を受けない。
 *
 * - 後から加わったリスナーには、直近の方位をすぐに1回渡す（センサーの次の通知を待たない）。
 * - 開始後に購読が失敗したら（iOS のストリームの例外）、リスナーへ null を配って表示を消し、ネイティブの購読を捨てる。
 *   リスナーは残すので、次に誰かが購読したときに開始し直し、残っていたリスナーにも再び配る。
 */
export function createHeadingMultiplexer(
  start: HeadingSource,
  options?: { stopDelayMs?: number },
): HeadingMultiplexer {
  const stopDelayMs = options?.stopDelayMs ?? DEFAULT_STOP_DELAY_MS;
  const listeners = new Set<HeadingListener>();
  let native: Promise<LocationSubscription> | null = null;
  let latest: number | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  function notify(degrees: number | null): void {
    for (const listener of [...listeners]) listener(degrees);
  }

  function release(subscription: Promise<LocationSubscription>): void {
    // 開始が失敗していたら止めるものは無い。
    void subscription.then(
      (started) => started.remove(),
      () => undefined,
    );
  }

  function startNative(): Promise<LocationSubscription> {
    let self: Promise<LocationSubscription> | null = null;
    self = start({
      emit(degrees) {
        if (native !== self) return;
        const normalized = normalizeHeadingDegrees(degrees);
        if (normalized === null) return;
        latest = normalized;
        notify(normalized);
      },
      fail() {
        if (native !== self || self === null) return;
        native = null;
        latest = null;
        release(self);
        notify(null);
      },
    });
    return self;
  }

  function cancelStop(): void {
    if (stopTimer === null) return;
    clearTimeout(stopTimer);
    stopTimer = null;
  }

  function scheduleStopIfIdle(): void {
    if (listeners.size > 0 || native === null) return;
    cancelStop();
    stopTimer = setTimeout(() => {
      stopTimer = null;
      if (listeners.size > 0 || native === null) return;
      const stopping = native;
      native = null;
      latest = null;
      release(stopping);
    }, stopDelayMs);
  }

  return {
    async subscribe(listener) {
      cancelStop();
      listeners.add(listener);
      if (native === null) native = startNative();
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
          scheduleStopIfIdle();
        },
      };
    },
  };
}
