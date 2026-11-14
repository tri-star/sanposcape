import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { PinRegisterView } from "@/features/pin/components/PinRegisterView";
import {
  parseClientWalkIdParam,
  parsePinLocationParams,
} from "@/features/pin/lib/pinLocationParams";
import type { PinRouteParams } from "@/features/pin/lib/pinLocationParams";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * ピン登録画面。散歩中画面の「この場所にピンを追加」または地図の長押しから push（`clientWalkId` つき）、
 * またはピンタブの地図の長押しから push（`clientWalkId` なし。SS-146）で来る。
 */
export default function PinNewRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<PinRouteParams>();
  // セレクタはプリミティブを返す（オブジェクトを返すと zustand v5 で毎レンダー新しい参照になる）。
  const isSignedIn = useAuthSessionStore((state) => state.status === "authenticated");
  const handleSignIn = useCallback(() => router.push("/(auth)/sign-in"), [router]);

  return (
    <PinRegisterView
      location={parsePinLocationParams(params)}
      clientWalkId={parseClientWalkIdParam(params)}
      isSignedIn={isSignedIn}
      onSignIn={handleSignIn}
    />
  );
}
