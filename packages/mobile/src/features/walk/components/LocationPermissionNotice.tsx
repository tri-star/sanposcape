import { Linking, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { locationErrorMessage } from "@/services/location/locationError";
import type { LocationErrorCode } from "@/services/location/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type LocationPermissionNoticeProps = {
  errorCode: LocationErrorCode;
  onRetry: () => void;
  testID?: string;
  /**
   * 再試行ボタンの testID。省略時は `${testID ?? "location-permission-notice"}-retry`。
   * 散歩開始・散歩中の2画面から使われるため、root の testID から自動的に画面ごとに
   * 一意な値が導出される（明示的に上書きしたい場合のみ指定すればよい）。
   */
  retryTestID?: string;
  /** 「設定を開く」ボタンの testID。省略時は `${testID ?? "location-permission-notice"}-open-settings`。 */
  openSettingsTestID?: string;
};

/**
 * LocationPermissionNotice — 位置情報の権限拒否・取得失敗時の案内カード。
 * 位置が取れないと探索できないため、`SpotMapView` の代わりにこのカードを表示する（§5.22）。
 */
export function LocationPermissionNotice({
  errorCode,
  onRetry,
  testID,
  retryTestID,
  openSettingsTestID,
}: LocationPermissionNoticeProps) {
  const theme = useTheme();
  const styles = useStyles();

  const rootTestID = testID ?? "location-permission-notice";

  return (
    <Card style={styles.root} testID={rootTestID}>
      <Icon name="crosshair" size={22} color={theme.colors.textTertiary} />
      <Text style={styles.message}>{locationErrorMessage(errorCode)}</Text>
      <View style={styles.actions}>
        <Button variant="secondary" onPress={onRetry} testID={retryTestID ?? `${rootTestID}-retry`}>
          再試行
        </Button>
        {errorCode === "permission_denied" ? (
          <Button
            variant="outline"
            onPress={() => Linking.openSettings()}
            testID={openSettingsTestID ?? `${rootTestID}-open-settings`}
          >
            設定を開く
          </Button>
        ) : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    alignItems: "center",
    gap: theme.spacing[3],
    marginHorizontal: theme.layout.pageGutter,
    marginTop: theme.spacing[1],
    padding: theme.spacing[5],
  },
  message: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
}));
