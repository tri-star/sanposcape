import { Redirect, Stack } from "expo-router";

import { isCatalogEnabled } from "@/config/env";

/**
 * 開発用ルートグループ。ルートファイル自体は常に存在させ(型生成を安定させるため)、
 * 無効時は `Redirect` で `/` へ戻し UI から到達不能にする
 * (カタログをビルドから物理的に除外する仕組みは Expo Router に無いため。詳細は ADR-005)。
 */
export default function DevLayout() {
  if (!isCatalogEnabled()) {
    return <Redirect href="/" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
