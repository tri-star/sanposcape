import { useState } from "react";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { PinMapFilterSheet } from "@/features/pin/components/PinMapFilterSheet";
import { isDefaultPinMapFilter } from "@/features/pin/lib/pinMapFilter";
import { usePinMapFilterStore } from "@/features/pin/store/usePinMapFilterStore";

export type PinMapFilterControlProps = {
  /** 例: "pin-tab-pin-filter"。ボタンはこの testID、シート内は `PinMapFilterSheet` の規則で付く。 */
  testIDPrefix: string;
};

/**
 * PinMapFilterControl — 地図右上のツール列に置く「表示するピン」ボタンと、その絞り込みシート（SS-174）。
 * 状態は `usePinMapFilterStore`（ピンタブと散歩中の地図で共有）。既定と違う条件のときはボタンを `active` で塗る
 * （絞り込み中であることを地図の上で分かるようにする）。
 *
 * ピンを描かない状態（未サインイン・フラグ OFF）では、呼び出し元がこのコンポーネント自体を描かない。
 * 散歩中の地図へはルート（`app/(tabs)/index.tsx`）が `WalkActiveView` の `mapTools` に合成する
 * （features/walk は features/pin を import しない）。
 */
export function PinMapFilterControl({ testIDPrefix }: PinMapFilterControlProps) {
  const [open, setOpen] = useState(false);
  const filter = usePinMapFilterStore((state) => state.filter);
  const setIncludeArchived = usePinMapFilterStore((state) => state.setIncludeArchived);
  const setVisitOption = usePinMapFilterStore((state) => state.setVisitOption);
  const filtered = !isDefaultPinMapFilter(filter);

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
        testIDPrefix={testIDPrefix}
      />
    </>
  );
}
