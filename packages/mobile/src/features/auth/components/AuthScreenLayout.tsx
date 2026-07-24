import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ToastOverlay } from "@/components/ui/toast/ToastOverlay";
import { AuthHero } from "@/features/auth/components/AuthHero";
import { makeStyles } from "@/theme/makeStyles";

export type AuthScreenLayoutProps = {
  testID?: string;
  heroSubtitle: string;
  heroCaption: string;
  /** `useAuthActions().toast` の状態。失敗時のフィードバックを表示する。 */
  toast: { visible: boolean; message: string };
  /** 下部のアクション（Google ボタン・ゲスト導線 等）。 */
  children: ReactNode;
};

/**
 * AuthScreenLayout — サインイン/サインアップ画面の共通レイアウト。
 * `SignInView`/`SignUpView` で完全一致していたスタイル（root/hero/actions）と
 * トースト表示を1箇所にまとめる。
 * デザイン: mock `isLogin` の構成（ロゴ＋キャッチ＋下部アクション）。
 */
export function AuthScreenLayout({
  testID,
  heroSubtitle,
  heroCaption,
  toast,
  children,
}: AuthScreenLayoutProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <View testID={testID} style={[styles.root, { paddingTop: insets.top + 44 }]}>
      <View style={styles.hero}>
        <AuthHero subtitle={heroSubtitle} caption={heroCaption} />
      </View>
      <View style={[styles.actions, { paddingBottom: insets.bottom + 24 }]}>{children}</View>

      <ToastOverlay message={toast.message} visible={toast.visible} bottom={insets.bottom + 24} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceTint,
    paddingHorizontal: theme.layout.pageGutter + 14,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    gap: theme.spacing[3],
  },
}));
