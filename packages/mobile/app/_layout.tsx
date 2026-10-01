import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { queryClient } from "@/api/queryClient";
import { AppConfigBootstrap } from "@/components/app-config/AppConfigBootstrap";
import { AuthGate } from "@/features/auth/components/AuthGate";
// サインアウト時の expo-image キャッシュ消去登録（副作用 import）。起動時に必ず評価される
// このファイルから読み込むことで、写真を表示する画面が一度も開かれなくても登録が確実に走る
// （SS-118 ローカルレビュー SEC-M1。`src/lib/imageCacheCleanup.ts` の JSDoc も参照）。
import "@/lib/imageCacheCleanup";
import { initAuth } from "@/services/auth";
import { appPreferences } from "@/services/preferences";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ThemedStatusBar } from "@/theme/ThemedStatusBar";

// Provider の生成より前に、api クライアントへトークン供給者を登録する。
// モジュールスコープで1回だけ実行する（initAuth は冪等）。
initAuth();

// 最初の描画より前に、保存済みのテーマ設定を同期で読む（起動時のちらつき防止。SS-86 / ADR-M-016）。
const initialThemeMode = appPreferences.loadThemeMode();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppConfigBootstrap />
      <ThemeProvider initialMode={initialThemeMode} onModeChange={appPreferences.saveThemeMode}>
        <SafeAreaProvider>
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }} />
          </AuthGate>
          <ThemedStatusBar />
        </SafeAreaProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
