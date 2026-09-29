import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Icon } from "@/components/ui/icon/Icon";
import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { useToast } from "@/hooks/useToast";
import { consumeFlashMessage } from "@/lib/flashMessage";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * PinTabView — ピンタブの暫定の中身（SS-145）。
 * SS-146 で『登録済みピンの地図 + 長押しで登録 + ボタン配置エリア』に作り直すまでの入口。
 * 全画面の Stack ルート（`PinMapFullScreen` を使う画面）はタブに入れない
 * （戻るボタンが必須で、下部の配置が `insets.bottom` 前提のため）。
 * pin_registration のガードはルート（`app/(tabs)/pins.tsx`）が担うので、ここではフラグも認証も見ない。
 */
export function PinTabView() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { show } = toast;

  // ピン登録（/pins/new）を保存して戻ってきたときの保存完了トースト
  // （画面またぎのメッセージ受け渡し。`src/lib/flashMessage.ts` 参照）。
  useFocusEffect(
    useCallback(() => {
      const message = consumeFlashMessage();
      if (message) show(message);
    }, [show]),
  );

  return (
    <View
      testID="pin-tab-screen"
      style={[styles.root, { paddingTop: insets.top + theme.spacing[2] }]}
    >
      <Text style={styles.eyebrow}>ピン</Text>
      <Text style={styles.title}>気になった場所をピンで残そう</Text>
      <Card style={styles.card}>
        <Icon name="map-pin" size={28} color={theme.colors.primary} />
        <Text style={styles.description}>
          登録したピンを地図で見たり、地図を長押しして新しいピンを登録できます。
        </Text>
        <Button
          variant="primary"
          icon="map"
          fullWidth
          testID="pin-tab-open-pin-map"
          onPress={() => router.push("/pins/map")}
        >
          登録したピンを地図で見る
        </Button>
        <Button
          variant="secondary"
          icon="map-pin"
          fullWidth
          testID="pin-tab-add-pin"
          onPress={() => router.push("/pins/pick-location")}
        >
          地図からピンを登録する
        </Button>
      </Card>
      {/* タブ画面の下端はタブバーの上なので insets.bottom は足さない。 */}
      <ToastOverlay message={toast.message} visible={toast.visible} bottom={theme.spacing[4]} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
    paddingHorizontal: theme.layout.pageGutter,
  },
  eyebrow: {
    fontSize: theme.typography.size["2xs"],
    color: theme.colors.textTertiary,
  },
  title: {
    marginTop: 1,
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  card: {
    marginTop: theme.spacing[4],
    gap: theme.spacing[3],
  },
  description: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
}));
