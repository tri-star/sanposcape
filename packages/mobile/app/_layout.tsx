import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { queryClient } from "@/api/queryClient";
import { AuthGate } from "@/features/auth/components/AuthGate";
import { initAuth } from "@/services/auth";
import { ThemeProvider } from "@/theme/ThemeProvider";

// Provider の生成より前に、api クライアントへトークン供給者を登録する。
// モジュールスコープで1回だけ実行する（initAuth は冪等）。
initAuth();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SafeAreaProvider>
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }} />
          </AuthGate>
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
