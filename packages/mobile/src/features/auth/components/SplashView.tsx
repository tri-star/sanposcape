import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { AuthHero } from "@/features/auth/components/AuthHero";
import { getSplashDestination } from "@/features/auth/lib/splashDestination";
import { authService } from "@/services/auth";
import { makeStyles } from "@/theme/makeStyles";

/** スプラッシュの最低表示時間（ms）。 */
const SPLASH_MS = 900;

/**
 * 起動ブランド画面。`AuthHero` を最低表示時間だけ中央表示しつつ、保存済みセッションを復元する。
 * デザイン: mock `isLogin` のロゴ＋キャッチのトーンを流用した起動ブランド画面（mock に直接該当なし）。
 */
export function SplashView() {
  const router = useRouter();
  const styles = useStyles();

  useEffect(() => {
    let active = true;
    const restoreController = new AbortController();
    let minimumDisplayTimeout: ReturnType<typeof setTimeout> | undefined;
    const minimumDisplay = new Promise<void>((resolve) => {
      minimumDisplayTimeout = setTimeout(resolve, SPLASH_MS);
    });

    void Promise.all([
      minimumDisplay,
      // 一時的な通信失敗時も起動を止めず、今回の起動ではサインインへ案内する。
      authService.restoreSession({ signal: restoreController.signal }).catch(() => null),
    ]).then(([, user]) => {
      if (active) {
        router.replace(getSplashDestination(user));
      }
    });

    return () => {
      active = false;
      restoreController.abort();
      clearTimeout(minimumDisplayTimeout);
    };
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
