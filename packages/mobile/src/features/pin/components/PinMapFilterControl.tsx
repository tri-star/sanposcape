import { useState } from "react";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { PinMapFilterSheet } from "@/features/pin/components/PinMapFilterSheet";
import { useSanpoMaps } from "@/features/pin/hooks/useSanpoMaps";
import { useSanpoMapPinVisibilityUpdate } from "@/features/pin/hooks/visibility/useSanpoMapPinVisibilityUpdate";
import { isDefaultPinMapFilter } from "@/features/pin/lib/pinMapFilter";
import {
  countHiddenSanpoMaps,
  sanpoMapPinVisibilityErrorMessage,
} from "@/features/pin/lib/visibility/sanpoMapPinVisibility";
import { usePinMapFilterStore } from "@/features/pin/store/usePinMapFilterStore";

export type PinMapFilterControlProps = {
  /** 例: "pin-tab-pin-filter"。ボタンはこの testID、シート内は `PinMapFilterSheet` の規則で付く。 */
  testIDPrefix: string;
  /**
   * 地図単位の表示・非表示（SS-266）を出すか。ルートがフラグ `map_pin_visibility` から注入する
   * （features/pin はフラグを読まない）。false なら「表示する地図」の節を出さず、地図一覧も取らない。
   */
  mapPinVisibility: boolean;
};

/**
 * PinMapFilterControl — 地図右上のツール列に置く「表示するピン」ボタンと、その絞り込みシート（SS-174）。
 * 状態は `usePinMapFilterStore`（ピンタブと散歩中の地図で共有）。既定と違う条件のとき、または非表示にした
 * 地図があるとき（SS-266）はボタンを `active` で塗る（絞り込み中であることを地図の上で分かるようにする）。
 *
 * 地図ごとの表示・非表示（SS-266）は地図一覧のキャッシュ（`pinsVisible`）が持ち、切り替えは
 * `useSanpoMapPinVisibilityUpdate` が楽観的に書き換える。`useRegisteredPins` も同じ一覧を読むので、地図にその場で効く。
 *
 * ピンを描かない状態（未サインイン・フラグ OFF）では、呼び出し元がこのコンポーネント自体を描かない。
 * 散歩中の地図へはルート（`app/(tabs)/index.tsx`）が `WalkActiveView` の `mapTools` に合成する
 * （features/walk は features/pin を import しない）。
 */
export function PinMapFilterControl({ testIDPrefix, mapPinVisibility }: PinMapFilterControlProps) {
  const [open, setOpen] = useState(false);
  const filter = usePinMapFilterStore((state) => state.filter);
  const setIncludeArchived = usePinMapFilterStore((state) => state.setIncludeArchived);
  const setVisitOption = usePinMapFilterStore((state) => state.setVisitOption);
  const maps = useSanpoMaps({ enabled: mapPinVisibility });
  const visibility = useSanpoMapPinVisibilityUpdate();
  const filtered =
    !isDefaultPinMapFilter(filter) || countHiddenSanpoMaps(maps.maps, mapPinVisibility) > 0;

  return (
    <>
      <IconButton
        icon="sliders-horizontal"
        label={filtered ? "表示するピン（絞り込み中）" : "表示するピン"}
        variant="surface"
        size="sm"
        active={filtered}
        onPress={() => setOpen(true)}
        testID={testIDPrefix}
      />
      <PinMapFilterSheet
        open={open}
        onClose={() => setOpen(false)}
        filter={filter}
        onChangeIncludeArchived={setIncludeArchived}
        onChangeVisitOption={setVisitOption}
        mapVisibility={
          mapPinVisibility
            ? {
                maps: maps.maps,
                status: maps.status,
                onRetry: maps.retry,
                pendingSanpoMapIds: visibility.pendingSanpoMapIds,
                errorMessage:
                  visibility.errorCode !== null
                    ? sanpoMapPinVisibilityErrorMessage(visibility.errorCode)
                    : null,
                onChange: (sanpoMapId, pinsVisible) =>
                  visibility.update({ sanpoMapId, pinsVisible }),
              }
            : null
        }
        testIDPrefix={testIDPrefix}
      />
    </>
  );
}
