import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { queryClient } from "@/api/queryClient";
import { ToastProvider } from "@/components/ui/toast/ToastProvider";

export default function RootLayout() {
  return (
    // BottomSheet(react-native-gesture-handler の Pan gesture)を使うため、
    // アプリのルートを GestureHandlerRootView で必ず1つだけ包む(公式要件)。
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <ToastProvider>
            <Stack screenOptions={{ headerShown: false }} />
            <StatusBar style="auto" />
          </ToastProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
