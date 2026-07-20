import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { queryClient } from "@/api/queryClient";
import { ToastProvider } from "@/components/ui/toast/ToastProvider";

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ToastProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="auto" />
        </ToastProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
