import { Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { PinLocationPreview } from "@/features/pin/components/PinLocationPreview";
import type { GeoCoordinates } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";

export type PinLocationFieldProps = {
  location: GeoCoordinates;
  isAdjusted: boolean;
  /** canAdjustPinLocation の結果。false のとき「位置を調整」は disabled。 */
  adjustable: boolean;
  onRequestAdjust: () => void;
  /** 位置調整のオーバーレイを開いているあいだ true。プレビューの MapView を外す（`PinLocationPreview` の `mapHidden` を参照）。 */
  previewMapHidden?: boolean;
  /** 接頭辞。`${testID}-preview`（= 既存の pin-register-location-preview と同じ値）/ `-adjust` / `-adjusted` を付ける。 */
  testID: string;
};

/**
 * PinLocationField — 登録画面の位置の欄（SS-124）。
 * 既存の `PinLocationPreview` の置き換え。プレビュー・「位置を調整」ボタン・調整済みの表示をまとめる。
 * オーバーレイの開閉状態はここでは持たない（`PinRegisterView` が root に重ねる必要があるため）。
 */
export function PinLocationField({
  location,
  isAdjusted,
  adjustable,
  onRequestAdjust,
  previewMapHidden = false,
  testID,
}: PinLocationFieldProps) {
  const styles = useStyles();

  return (
    <>
      <PinLocationPreview
        location={location}
        mapHidden={previewMapHidden}
        testID={`${testID}-preview`}
      />
      <View style={styles.row}>
        {isAdjusted ? (
          <Text style={styles.adjustedText} testID={`${testID}-adjusted`}>
            位置を調整しました
          </Text>
        ) : (
          <View style={styles.spacer} />
        )}
        <Button
          variant="outline"
          size="sm"
          icon="crosshair"
          onPress={onRequestAdjust}
          disabled={!adjustable}
          testID={`${testID}-adjust`}
        >
          位置を調整
        </Button>
      </View>
    </>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    marginHorizontal: theme.layout.pageGutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  spacer: {
    flex: 1,
  },
  adjustedText: {
    flex: 1,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textSecondary,
  },
}));
