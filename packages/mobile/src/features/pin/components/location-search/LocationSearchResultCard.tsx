import { Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import type { LocationSearchResult } from "@/features/pin/lib/location-search/locationSearch";
import { makeStyles } from "@/theme/makeStyles";

export type LocationSearchResultCardProps = {
  result: LocationSearchResult;
  onClose: () => void;
  /** 「この場所にピンを登録」。検索結果の座標でピンの登録画面を開く（SS-272）。 */
  onRegisterPin: (result: LocationSearchResult) => void;
  /**
   * カードの testID。名前は `${testID}-name`、住所は `${testID}-address`、閉じるは `${testID}-close`、
   * 登録は `${testID}-register`。
   */
  testID: string;
};

/**
 * LocationSearchResultCard — 検索結果のピンをタップしたときに地図の下に出す概要（名前・住所。SS-267。ADR-M-026）。
 * 「この場所にピンを登録」で、検索結果の座標を初期位置にしてピンの登録画面を開く（SS-272。ADR-M-026 D7 の SS-272 追補）。
 * 名前は渡さない（Google Places の名前は保存が認められていないため、利用者が入力する）。
 */
export function LocationSearchResultCard({
  result,
  onClose,
  onRegisterPin,
  testID,
}: LocationSearchResultCardProps) {
  const styles = useStyles();
  return (
    <Card style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={2} testID={`${testID}-name`}>
            {result.name}
          </Text>
          {result.address !== null ? (
            <Text style={styles.address} numberOfLines={2} testID={`${testID}-address`}>
              {result.address}
            </Text>
          ) : null}
        </View>
        <IconButton
          icon="x"
          label="閉じる"
          variant="ghost"
          size="sm"
          onPress={onClose}
          testID={`${testID}-close`}
        />
      </View>
      <Button
        variant="primary"
        size="sm"
        icon="map-pin"
        onPress={() => onRegisterPin(result)}
        testID={`${testID}-register`}
      >
        この場所にピンを登録
      </Button>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    gap: theme.spacing[3],
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  body: {
    flex: 1,
    gap: theme.spacing[1],
  },
  name: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  address: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
}));
