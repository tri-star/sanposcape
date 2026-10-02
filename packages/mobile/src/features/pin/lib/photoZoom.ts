/**
 * 写真ビューアのピンチ・パンの計算（SS-153）。UI スレッド（worklet）から呼ぶ純粋関数。
 *
 * 座標系:
 * - 枠（frame）= ジェスチャーを受ける View（ビューアの写真領域）。拡大した写真はこの枠で切り抜かれる。
 * - 移動量（translateX / translateY）は枠の中心基準。transform は
 *   `[{ translateX }, { translateY }, { scale }]` の順で、scale は View の中心を原点にかかる。
 *   したがって「拡大前の写真上の点 c（中心基準）」は画面上で `t + s * c` に描かれる。
 * - content は「倍率1のとき、枠に contain で収めた写真の見た目の大きさ」（レターボックスを除いた写真本体）。
 *
 * すべてのエクスポート関数に "worklet" を付ける（付け忘れは Vitest では検出できず実機で落ちる）。
 */

export const PHOTO_ZOOM_MIN_SCALE = 1;
/** 原本は長辺2048px（ADR-M-010）。等倍表示を超えて細部を見られる程度に4倍までとする。 */
export const PHOTO_ZOOM_MAX_SCALE = 4;

export type ZoomSize = { width: number; height: number };
export type PhotoZoomState = { scale: number; translateX: number; translateY: number };
export type PhotoZoomLayout = { frame: ZoomSize; content: ZoomSize };

/** 初期状態。shared value の初期値に渡すときは `{ ...PHOTO_ZOOM_IDENTITY }` で複製する。 */
export const PHOTO_ZOOM_IDENTITY: Readonly<PhotoZoomState> = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

function isPositive(value: number): boolean {
  "worklet";
  return Number.isFinite(value) && value > 0;
}

/** 写真を枠に contain で収めたときの見た目の大きさ。 */
export function containSize(photo: ZoomSize, frame: ZoomSize): ZoomSize {
  "worklet";
  if (!isPositive(frame.width) || !isPositive(frame.height)) {
    return { width: 0, height: 0 };
  }
  if (!isPositive(photo.width) || !isPositive(photo.height)) {
    // 縦横比が分からないときは枠いっぱいとみなす。
    return { width: frame.width, height: frame.height };
  }
  const ratio = Math.min(frame.width / photo.width, frame.height / photo.height);
  return { width: photo.width * ratio, height: photo.height * ratio };
}

/** 枠と写真の実寸から移動範囲の計算に使うレイアウトを求める。 */
export function resolvePhotoZoomLayout(photo: ZoomSize, frame: ZoomSize): PhotoZoomLayout {
  "worklet";
  return { frame, content: containSize(photo, frame) };
}

export function clampPhotoZoomScale(scale: number): number {
  "worklet";
  if (!Number.isFinite(scale)) return PHOTO_ZOOM_MIN_SCALE;
  return Math.min(PHOTO_ZOOM_MAX_SCALE, Math.max(PHOTO_ZOOM_MIN_SCALE, scale));
}

function clampAxis(value: number, max: number): number {
  "worklet";
  if (max <= 0) return 0;
  return Math.min(max, Math.max(-max, value));
}

/** 写真の端が枠の内側に入り込まない範囲に移動量を収める（枠より小さい方向は中央固定）。 */
export function clampPhotoZoomTranslate(
  state: PhotoZoomState,
  layout: PhotoZoomLayout,
): PhotoZoomState {
  "worklet";
  const maxX = Math.max(0, (state.scale * layout.content.width - layout.frame.width) / 2);
  const maxY = Math.max(0, (state.scale * layout.content.height - layout.frame.height) / 2);
  return {
    scale: state.scale,
    translateX: clampAxis(state.translateX, maxX),
    translateY: clampAxis(state.translateY, maxY),
  };
}

/**
 * ピンチの1イベント分（差分）を現在の状態に積む。焦点の下の点は動かさない。
 * 指の移動に伴う焦点の動きは含まない（それは同時に動く Pan の changeX/Y が担う）。
 */
export function applyPinchChange(
  state: PhotoZoomState,
  input: { scaleChange: number; focalX: number; focalY: number },
  layout: PhotoZoomLayout,
): PhotoZoomState {
  "worklet";
  if (!Number.isFinite(input.scaleChange) || input.scaleChange <= 0) return state;
  const nextScale = clampPhotoZoomScale(state.scale * input.scaleChange);
  const k = nextScale / state.scale;
  // RNGH の focalX/Y は View の左上基準。枠の中心基準に直す。
  const fx = input.focalX - layout.frame.width / 2;
  const fy = input.focalY - layout.frame.height / 2;
  return clampPhotoZoomTranslate(
    {
      scale: nextScale,
      translateX: fx - k * (fx - state.translateX),
      translateY: fy - k * (fy - state.translateY),
    },
    layout,
  );
}

/** パンの1イベント分（差分）を現在の状態に積む。倍率1では範囲が0なので動かない。 */
export function applyPanChange(
  state: PhotoZoomState,
  input: { changeX: number; changeY: number },
  layout: PhotoZoomLayout,
): PhotoZoomState {
  "worklet";
  const dx = Number.isFinite(input.changeX) ? input.changeX : 0;
  const dy = Number.isFinite(input.changeY) ? input.changeY : 0;
  return clampPhotoZoomTranslate(
    { ...state, translateX: state.translateX + dx, translateY: state.translateY + dy },
    layout,
  );
}

/** 枠の大きさが変わったとき（分割画面・折りたたみ等）に、現在の状態を新しい移動範囲へ収め直す。 */
export function reclampPhotoZoomForFrame(
  state: PhotoZoomState,
  photo: ZoomSize,
  frame: ZoomSize,
): PhotoZoomState {
  "worklet";
  return clampPhotoZoomTranslate(state, resolvePhotoZoomLayout(photo, frame));
}
