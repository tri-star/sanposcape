import { Stack } from "expo-router";

/**
 * 認証スタック（サインイン）。
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "fade" }} />;
}
