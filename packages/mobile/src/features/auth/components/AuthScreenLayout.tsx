import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
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
  /** 下部のアクション（iOS の Apple ボタン・Google ボタン・ゲスト導線 等）。 */
  children: ReactNode;
};

/**
 * AuthScreenLayout — 認証画面の共通レイアウト。
 * スタイル（root/hero/actions）とトースト表示を1箇所にまとめる（SS-221 までは
 * サインイン/サインアップの2画面で共有していた）。
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
    <View testID={testID} style={styles.root}>
      {/*
        小さい端末（375×667 級で iOS の Apple ボタンが加わる場合）や文字サイズの拡大時に、
        下部の同意文言・規約リンクが画面外へ出るため、収まらないときだけスクロールできるようにする（SS-187）。
        収まるときは flexGrow で画面いっぱいに広げ、従来どおりヒーローを中央・アクションを下部に置く。
      */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 44, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <AuthHero subtitle={heroSubtitle} caption={heroCaption} />
        </View>
        <View style={styles.actions}>{children}</View>
      </ScrollView>

      <ToastOverlay message={toast.message} visible={toast.visible} bottom={insets.bottom + 24} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceTint,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.pageGutter + 14,
    // スクロールになったときも、ヒーローとアクションが密着しないようにする
    gap: theme.spacing[4],
  },
  hero: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    gap: theme.spacing[3],
  },
}));
