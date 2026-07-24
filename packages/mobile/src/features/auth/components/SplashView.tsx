import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { AuthHero } from "@/features/auth/components/AuthHero";
import { makeStyles } from "@/theme/makeStyles";

/** スプラッシュの最低表示時間（ms）。 */
const SPLASH_MS = 900;

/**
 * 起動ブランド画面。`AuthHero` を中央表示し、一定時間後にサインイン画面へ遷移する。
 * デザイン: mock `isLogin` のロゴ＋キャッチのトーンを流用した起動ブランド画面（mock に直接該当なし）。
 */
export function SplashView() {
  const router = useRouter();
  const styles = useStyles();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/(auth)/sign-in");
    }, SPLASH_MS);
    return () => clearTimeout(timer);
  }, [router]);

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
