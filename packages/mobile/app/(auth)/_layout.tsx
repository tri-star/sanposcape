import { Stack } from "expo-router";

/**
 * 認証スタック（サインイン / サインアップ）。
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "fade" }} />;
}
