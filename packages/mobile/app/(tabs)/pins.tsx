import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { PinTabView } from "@/features/pin/components/PinTabView";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";
import { useTheme } from "@/theme/useTheme";

/**
 * ピンタブ（SS-145。ログイン直後の着地点）。中身は SS-146 で本実装に差し替える暫定の `PinTabView`。
 * pin_registration が OFF と確定したらナビタブへリダイレクトする（ログイン後の着地点のフォールバック。
 * `Redirect` はフォーカス中にだけ動くので、別タブにいる間に OFF になってもユーザーを動かさない）。
 * 取得中（pending）は読み込み表示だけを出す（ON なのに追い出す事故を防ぎつつ、着地直後に
 * タブバーだけの空白画面にしないため）。`/app-config` の取得は失敗しても再試行後に確定する
 * （`appConfigQueryOptions` の retry）ので、読み込み表示が無期限に続くことはない。
 */
export default function PinTabRoute() {
  const theme = useTheme();
  const decision = usePinRegistrationGate();
  if (decision === "pending") {
    return (
      <View
        testID="pin-tab-loading"
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.surfaceApp,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} accessibilityLabel="読み込み中" />
      </View>
    );
  }
  if (decision === "disabled") return <Redirect href="/(tabs)" />;
  return <PinTabView />;
}
