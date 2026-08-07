import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { AuthHero } from "@/features/auth/components/AuthHero";
import { getSplashDestination } from "@/features/auth/lib/splashDestination";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";
import { makeStyles } from "@/theme/makeStyles";

/** スプラッシュの最低表示時間（ms）。 */
const SPLASH_MS = 900;

/**
 * 起動ブランド画面。`AuthHero` を最低表示時間だけ中央表示しつつ、認証状態が確定するのを待つ。
 * セッション復元は `AuthGate` の `useAuthSessionBootstrap` が担う（ディープリンクのコールド
 * スタートでも復元されるようにするため）。この画面は `useAuthSessionStore` の `status` を
 * 購読し、「最低表示時間の経過」と「復元完了（`status !== "loading"`）」の**両方**が揃ったら
 * 遷移する（SS-13 / ADR-009）。
 * デザイン: mock `isLogin` のロゴ＋キャッチのトーンを流用した起動ブランド画面（mock に直接該当なし）。
 */
export function SplashView() {
  const router = useRouter();
  const styles = useStyles();
  const status = useAuthSessionStore((state) => state.status);
  const [minimumDisplayElapsed, setMinimumDisplayElapsed] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setMinimumDisplayElapsed(true), SPLASH_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!minimumDisplayElapsed || status === "loading") return;
    router.replace(getSplashDestination(status));
  }, [minimumDisplayElapsed, status, router]);

  return (
    <View testID="splash-screen" style={styles.root}>
      <AuthHero subtitle={"いつもの道を、\nちょっと楽しい寄り道に。"} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceTint,
    paddingHorizontal: theme.layout.pageGutter,
  },
}));
