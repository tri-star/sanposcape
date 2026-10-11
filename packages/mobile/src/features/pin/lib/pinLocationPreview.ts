import { regionAroundPoint } from "@/features/pin/lib/pinLocationPicker";
import type { MapRegion } from "@/lib/mapRegion";
import type { GeoCoordinates } from "@/services/location/types";

/** 登録フォーム（PinLocationField）= compact、ピン詳細 = interactive。 */
export type PinLocationPreviewVariant = "compact" | "interactive";

/** 登録フォームのプレビューの表示範囲（従来の REGION_DELTA。変えない）。 */
export const PIN_PREVIEW_COMPACT_DELTA = 0.004;

/**
 * ピン詳細の地図の初期表示範囲。約 330m 四方（緯度 0.003° ≈ 333m）。
 * 正方形の枠に収めるので、横長 140 に 0.004 を収めていた従来（約 1070m × 445m）より約 3.5 倍拡大して見える。
 */
export const PIN_PREVIEW_INTERACTIVE_DELTA = 0.003;

export type PinLocationPreviewConfig = {
  /** 初期表示（interactive は「ピンの位置に戻す」の戻り先も）の緯度・経度の差。 */
  delta: number;
  /** 1本指のドラッグでの移動（react-native-maps の scrollEnabled）。 */
  panEnabled: boolean;
  /** ピンチ・ダブルタップでの拡大縮小（zoomEnabled）。 */
  zoomEnabled: boolean;
  /** 「ピンの位置に戻す」ボタンを出すか。 */
  showRecenter: boolean;
  /** 枠の形。wide = 高さ 140 の横長、square = 幅に合わせた 1:1。 */
  shape: "wide" | "square";
  /**
   * 表示範囲の渡し方。controlled = `region`（location の変化に毎回追従。操作不可の compact 用）、
   * initial = `initialRegion`（操作した位置を再レンダーで戻さない。interactive 用）。
   */
  regionMode: "controlled" | "initial";
};

const COMPACT_CONFIG: Readonly<PinLocationPreviewConfig> = {
  delta: PIN_PREVIEW_COMPACT_DELTA,
  panEnabled: false,
  zoomEnabled: false,
  showRecenter: false,
  shape: "wide",
  regionMode: "controlled",
} as const;

const INTERACTIVE_CONFIG: Readonly<PinLocationPreviewConfig> = {
  delta: PIN_PREVIEW_INTERACTIVE_DELTA,
  panEnabled: true,
  zoomEnabled: true,
  showRecenter: true,
  shape: "square",
  regionMode: "initial",
} as const;

export function resolvePinLocationPreviewConfig(
  variant: PinLocationPreviewVariant,
): PinLocationPreviewConfig {
  switch (variant) {
    case "compact":
      return COMPACT_CONFIG;
    case "interactive":
      return INTERACTIVE_CONFIG;
    default: {
      const exhaustiveCheck: never = variant;
      return exhaustiveCheck;
    }
  }
}

/** variant の delta でピンを中心にした表示範囲（regionAroundPoint の薄い包み）。 */
export function pinLocationPreviewRegion(
  location: GeoCoordinates,
  variant: PinLocationPreviewVariant,
): MapRegion {
  return regionAroundPoint(location, resolvePinLocationPreviewConfig(variant).delta);
}

/**
 * interactive の MapView の key。座標が変わったときだけ作り直す（initialRegion はマウント時にしか読まれないため）。
 * 詳細の取り直しで `pin.location` が別オブジェクトになっても、値が同じなら同じキーを返す。
 */
export function pinLocationMapKey(location: GeoCoordinates): string {
  return `${location.latitude},${location.longitude}`;
}
