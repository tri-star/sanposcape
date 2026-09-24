import { useState } from "react";

import { resolveAdjustedLocation } from "@/features/pin/lib/pinLocationAdjust";
import type { GeoCoordinates } from "@/services/location/types";

export type UsePinLocationDraftResult = {
  /** 保存に使う位置。調整済みなら調整後、そうでなければ元の位置。元が null なら null。 */
  location: GeoCoordinates | null;
  isAdjusted: boolean;
  /** 調整オーバーレイで確定した位置を反映する（不正値は無視。元と同じなら調整を取り消す）。 */
  apply: (picked: GeoCoordinates) => void;
};

/**
 * (a) 登録画面の「元の位置（ルートの params）」と「調整後の位置」を保持する hook。
 * 判定は `lib/pinLocationAdjust.ts` に任せ、この hook は状態の保持と配線だけを行う。
 *
 * `original` はルートが毎レンダー `parsePinLocationParams(params)` で新しいオブジェクトを
 * 作るため参照は毎回変わるが、値の比較は lib（`isSameCoordinate`）で行うので問題ない。
 */
export function usePinLocationDraft(original: GeoCoordinates | null): UsePinLocationDraftResult {
  const [adjusted, setAdjusted] = useState<GeoCoordinates | null>(null);

  const location = original === null ? null : (adjusted ?? original);
  const isAdjusted = original !== null && adjusted !== null;

  const apply = (picked: GeoCoordinates) => {
    if (original === null) return;
    const resolved = resolveAdjustedLocation({ original, picked });
    if (resolved === null) return;
    setAdjusted(resolved.isAdjusted ? resolved.location : null);
  };

  return { location, isAdjusted, apply };
}
