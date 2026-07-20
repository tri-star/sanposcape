/**
 * BottomSheet のスナップ位置計算(純粋関数)。
 *
 * `y` は「シートが画面下からどれだけ立ち上がって見えているか(可視高さ, px)」を表す。
 * 値が大きいほどシートが大きく開いている。ジェスチャの translateY への変換は
 * 呼び出し側(`BottomSheet.tsx`)の責務とし、ここでは寸法・速度からの判定だけを行う
 * (`react-native` / `react-native-gesture-handler` / `react-native-reanimated` を import しない)。
 */

/** 下向き(閉じる方向)にこの速度(px/秒)以上でドラッグを離したら、位置に関わらず閉じる */
const VELOCITY_DISMISS_THRESHOLD = 800;
/** 上向き(開く方向)にこの速度(px/秒)以上でドラッグを離したら、最も開いたスナップ点へ飛ばす */
const VELOCITY_OPEN_THRESHOLD = -800;

/**
 * 比率の配列(画面高に対する可視高さの割合。例: `[0.5, 0.9]`)を検証しつつ絶対 px に変換する。
 * 戻り値は昇順(可視高さが小さい = より閉じている順)に整列する。
 */
export function toAbsoluteSnapPoints(ratios: number[], screenHeight: number): number[] {
  if (ratios.length === 0) {
    throw new Error("toAbsoluteSnapPoints: snapPoints が空です");
  }

  const pixels = ratios.map((ratio) => {
    if (ratio <= 0 || ratio > 1) {
      throw new Error(
        `toAbsoluteSnapPoints: 比率は 0 より大きく1以下でなければなりません: ${ratio}`,
      );
    }
    return screenHeight * ratio;
  });

  return pixels.sort((a, b) => a - b);
}

export type SnapTarget = { type: "snap"; y: number } | { type: "dismiss" };

/**
 * ドラッグ終了位置(`currentY`)と速度(`velocityY`, 下向き=正)から、次にスナップすべき点を決める。
 * 判定順序: 速い下向き速度 > 速い上向き速度 > `dismissThreshold` 未満 > 最近傍スナップ点。
 */
export function resolveSnapTarget(
  currentY: number,
  velocityY: number,
  snapPointsPx: number[],
  /** これを下回ったら閉じる閾値(可視高さ, px) */
  dismissThreshold: number,
): SnapTarget {
  if (snapPointsPx.length === 0) {
    throw new Error("resolveSnapTarget: snapPointsPx が空です");
  }

  if (velocityY >= VELOCITY_DISMISS_THRESHOLD) {
    return { type: "dismiss" };
  }

  if (velocityY <= VELOCITY_OPEN_THRESHOLD) {
    const mostOpen = snapPointsPx[snapPointsPx.length - 1] as number;
    return { type: "snap", y: mostOpen };
  }

  if (currentY < dismissThreshold) {
    return { type: "dismiss" };
  }

  const nearest = snapPointsPx.reduce((closest, point) =>
    Math.abs(point - currentY) < Math.abs(closest - currentY) ? point : closest,
  );
  return { type: "snap", y: nearest };
}
