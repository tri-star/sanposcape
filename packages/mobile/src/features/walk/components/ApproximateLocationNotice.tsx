import { Linking, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import {
  type ApproximateLocationContext,
  approximateLocationNoticeMessage,
} from "@/features/walk/lib/locationPrecisionNotice";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type ApproximateLocationNoticeProps = {
  context: ApproximateLocationContext;
  /** root の testID。「設定を開く」は `${testID}-open-settings`。 */
  testID: string;
};

/**
 * ApproximateLocationNotice — 「正確な位置情報」がオフのときの案内カード（散歩開始・散歩中）。
 * 探索も記録も止めない。閉じるボタンは付けず、設定で直すか、精度が戻れば
 * （前面復帰で再判定して）自動で消える（ADR-M-022）。
 * 「設定を開く」は LocationPermissionNotice と同じく `Linking.openSettings()` を直接呼ぶ
 * （architecture-guideline の例外）。
 */
export function ApproximateLocationNotice({ context, testID }: ApproximateLocationNoticeProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Card style={styles.root} testID={testID}>
      <Icon name="crosshair" size={20} color={theme.colors.textTertiary} />
      <Text style={styles.message}>{approximateLocationNoticeMessage(context)}</Text>
      <View>
        <Button
          variant="outline"
          size="sm"
          onPress={() => Linking.openSettings()}
          testID={`${testID}-open-settings`}
        >
          設定を開く
        </Button>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginHorizontal: theme.layout.pageGutter,
    marginTop: theme.spacing[1],
    padding: theme.spacing[3],
  },
  message: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
}));
