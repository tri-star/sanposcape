import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { PinTabView } from "@/features/pin/components/PinTabView";
import { usePinRegistrationGate } from "@/hooks/usePinRegistrationGate";
import { useSignInNavigation } from "@/hooks/useSignInNavigation";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";
import { useTheme } from "@/theme/useTheme";

/**
 * ピンタブ（SS-145。ログイン直後の着地点）。中身は登録済みピンの地図・長押しでの登録・
 * ボタン配置エリア（SS-146）。ゲストのサインイン画面はこの画面の上へ push し、
 * サインイン後は既存の `(tabs)` へ dismissTo で戻る（進行中の散歩があればナビタブ、無ければこの画面。
 * `getPostSignInDestination`。`(tabs)` を二重に積まない）。認証値はここで注入する（features/pin は認証を読まない）。
 * pin_registration が OFF と確定したらナビタブへリダイレクトする（ログイン後の着地点のフォールバック。
 * `Redirect` はフォーカス中にだけ動くので、別タブにいる間に OFF になってもユーザーを動かさない）。
 * 取得中（pending）は読み込み表示だけを出す（ON なのに追い出す事故を防ぎつつ、着地直後に
 * タブバーだけの空白画面にしないため）。`/app-config` の取得は失敗しても再試行後に確定する
 * （`appConfigQueryOptions` の retry）ので、読み込み表示が無期限に続くことはない。
 */
export default function PinTabRoute() {
  const theme = useTheme();
  const decision = usePinRegistrationGate();
  // セレクタはプリミティブを返す（zustand v5）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useSignInNavigation();
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
  return <PinTabView isSignedIn={isSignedIn} onSignIn={handleSignIn} />;
}
