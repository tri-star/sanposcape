import { useLocalSearchParams } from "expo-router";

import { PinTabView } from "@/features/pin/components/PinTabView";
import {
  type PinTabFocusRouteParams,
  parsePinTabFocusParams,
} from "@/features/pin/lib/pinTabFocus";
import { useSignInNavigation } from "@/hooks/useSignInNavigation";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * ピンタブ（SS-145。ログイン直後の着地点）。中身は登録済みピンの地図・長押しでの登録・
 * ボタン配置エリア（SS-146）。ゲストのサインイン画面はこの画面の上へ push し、
 * サインイン後は既存の `(tabs)` へ dismissTo で戻る（進行中の散歩があればナビタブ、無ければこの画面。
 * `getPostSignInDestination`。`(tabs)` を二重に積まない）。認証値はここで注入する（features/pin は認証を読まない）。
 * ピン詳細の「ピンの場所に移動」は、座標と `focusKey` をパラメータで渡してここへ戻る（SS-246。`parsePinTabFocusParams` で検証する）。
 */
export default function PinTabRoute() {
  // セレクタはプリミティブを返す（zustand v5）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useSignInNavigation();
  const focus = parsePinTabFocusParams(useLocalSearchParams<PinTabFocusRouteParams>());
  return <PinTabView isSignedIn={isSignedIn} onSignIn={handleSignIn} focus={focus} />;
}
