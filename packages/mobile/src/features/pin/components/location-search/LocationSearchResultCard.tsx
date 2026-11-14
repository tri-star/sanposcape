import { Text, View } from "react-native";

import { Card } from "@/components/ui/card/Card";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import type { LocationSearchResult } from "@/features/pin/lib/location-search/locationSearch";
import { makeStyles } from "@/theme/makeStyles";

export type LocationSearchResultCardProps = {
  result: LocationSearchResult;
  onClose: () => void;
  /** カードの testID。名前は `${testID}-name`、住所は `${testID}-address`、閉じるは `${testID}-close`。 */
  testID: string;
};

/**
 * LocationSearchResultCard — 検索結果のピンをタップしたときに地図の下に出す概要（名前・住所。SS-267。ADR-M-026）。
 * 「ここにピンを登録」は置かない（Google Places の座標をピンとして無期限に保存することになるため。登録は従来どおり長押し）。
 */
export function LocationSearchResultCard({
  result,
  onClose,
  testID,
}: LocationSearchResultCardProps) {
  const styles = useStyles();
  return (
    <Card style={styles.card} testID={testID}>
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
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
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
