import { useState } from "react";

import type { PinMapFocusRequest } from "@/features/pin/components/PinMapFullScreen";
import { resolvePickerStartRegion } from "@/features/pin/lib/pinLocationPicker";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import type { MapRegion } from "@/lib/mapRegion";
import type { GeoCoordinates, LocationErrorCode } from "@/services/location/types";

export type UsePinLocationPickerResult = {
  /** 一度決まったら変えない初期表示範囲。null の間は読み込み表示。 */
  startRegion: MapRegion | null;
  currentLocation: GeoCoordinates | null;
  locationErrorCode: LocationErrorCode | null;
  retryLocation: () => void;
  focusRequest: PinMapFocusRequest | null;
  /** 現在地があればそこへ移動する（現在地ボタン）。 */
  recenter: () => void;
};

/**
 * (b) 地点選択画面の状態をまとめる hook。判定は `lib/pinLocationPicker.ts` に任せ、
 * この hook は状態の保持と配線だけを行う（`usePinRegister` と同じ設計方針）。
 *
 * 権限リクエストは `useCurrentLocation` がマウント時に行う
 * （ADR-006「権限リクエストは画面側の hook が必要になった時点で行う」に合う）。
 *
 * `startRegion`/`focusRequest` の「一度だけ確定・一度だけ移動」は、React公式ドキュメントの
 * 「レンダー中に state を直接調整する」パターン（`useEffect` にすると1フレーム遅れて描画される）
 * で行う。`useEffect` 内での単純な派生 setState は oxlint の `react/set-state-in-effect` に
 * 引っかかるため、条件付きで render 中に setState する形にしている（React が再レンダーを
 * コミット前に差し替えるため、画面のちらつきは起きない）。
 */
export function usePinLocationPicker(): UsePinLocationPickerResult {
  const { coordinates, isLoading, errorCode, retry } = useCurrentLocation();

  const [startRegion, setStartRegion] = useState<MapRegion | null>(null);
  const [startSource, setStartSource] = useState<"current" | "fallback" | null>(null);
  const [focusRequest, setFocusRequest] = useState<PinMapFocusRequest | null>(null);

  // 初期表示範囲を一度だけ確定させる。
  if (startRegion === null) {
    const resolved = resolvePickerStartRegion({ isLoading, coordinates });
    if (resolved !== null) {
      setStartRegion(resolved.region);
      setStartSource(resolved.source);
    }
  }

  // 初期表示が fallback（現在地が取れなかった）だった後、現在地が取れたら1回だけそこへ移動する。
  // `recenter()`（イベントハンドラ内の通常の setState）と二重発火しないか: `currentLocation` が
  // 真になった時点でこのブロックが**先に**（イベントハンドラより前、レンダーの一部として）
  // `startSource` を "current" に倒すため、以後このブロックの条件（`startSource === "fallback"`）
  // は満たされなくなる。`recenter()` はユーザー操作でのみ呼ばれる独立した経路であり、
  // このブロックと競合しない（手動検証済み）。
  if (
    startRegion !== null &&
    startSource === "fallback" &&
    coordinates !== null &&
    isValidCoordinate(coordinates)
  ) {
    setStartSource("current");
    setFocusRequest((prev) => ({ target: coordinates, nonce: (prev?.nonce ?? 0) + 1 }));
  }

  const recenter = () => {
    if (coordinates === null || !isValidCoordinate(coordinates)) return;
    setFocusRequest((prev) => ({ target: coordinates, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const currentLocation =
    coordinates !== null && isValidCoordinate(coordinates) ? coordinates : null;

  return {
    startRegion,
    currentLocation,
    locationErrorCode: errorCode,
    retryLocation: retry,
    focusRequest,
    recenter,
  };
}
