import { Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type PinSignInRequiredProps = {
  onSignIn: () => void;
};

/** PinSignInRequired — ゲストに対してサインイン案内だけを出す（入力欄は描画しない）。 */
export function PinSignInRequired({ onSignIn }: PinSignInRequiredProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <View testID="pin-register-sign-in-required" style={styles.wrap}>
      <Card style={styles.card}>
        <View style={styles.iconWrap}>
          <Icon name="map-pin" size={28} color={theme.colors.primary} />
        </View>
        <Text style={styles.title}>ピンの保存にはサインインが必要です</Text>
        <Text style={styles.body}>
          サインインすると、見つけた場所を写真やメモと一緒に残せます。
        </Text>
        <Button variant="primary" fullWidth onPress={onSignIn} testID="pin-register-sign-in">
          サインイン
        </Button>
      </Card>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  wrap: {
    marginHorizontal: theme.layout.pageGutter,
  },
  card: {
    alignItems: "center",
    gap: theme.spacing[3],
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: theme.typography.size.lg,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  body: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
}));
