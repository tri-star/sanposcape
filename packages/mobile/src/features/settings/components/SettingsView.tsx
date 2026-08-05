import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { authService } from "@/services/auth";
import { makeStyles } from "@/theme/makeStyles";

/**
 * 設定画面。SS-11 時点ではログアウト導線のみを提供する。
 * 認証全体のルートガードは `AuthGate`（`app/_layout.tsx`）が担う（SS-13 / ADR-009）。
 */
export function SettingsView() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const closeLogoutDialog = () => setLogoutDialogOpen(false);

  const handleConfirmLogout = () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    void authService.signOut().finally(() => {
      // 後始末（walk 系ストア / Query キャッシュ）は認証状態が guest に落ちた時点で
      // useAuthSessionStore が実行する（ADR-008 決定6 の追補 / ADR-009）。
      // ここは「設定画面より前の認証済み画面へ戻れないようスタックを畳む」導線だけを担う。
      router.dismissAll();
      router.replace("/(auth)/sign-in");
    });
  };

  return (
    <View testID="settings-screen" style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <IconButton
            icon="chevron-left"
            label="戻る"
            variant="ghost"
            onPress={() => router.back()}
          />
          <Text style={styles.title}>設定</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.logoutSection}>
          <Text style={styles.logoutDescription}>この端末からサインアウトします。</Text>
          <Button
            variant="danger"
            fullWidth
            onPress={() => setLogoutDialogOpen(true)}
            testID="settings-open-logout-dialog"
          >
            ログアウト
          </Button>
        </View>
      </ScrollView>

      <Dialog
        open={logoutDialogOpen}
        title="ログアウトしますか？"
        onClose={closeLogoutDialog}
        dismissDisabled={isSigningOut}
        testID="logout-dialog"
        actions={
          <>
            <Button
              variant="secondary"
              fullWidth
              disabled={isSigningOut}
              onPress={closeLogoutDialog}
            >
              キャンセル
            </Button>
            <Button
              variant="danger"
              fullWidth
              disabled={isSigningOut}
              onPress={handleConfirmLogout}
              testID="settings-confirm-logout"
            >
              {isSigningOut ? "ログアウト中..." : "ログアウト"}
            </Button>
          </>
        }
      >
        <Text style={styles.dialogBody}>再度利用するには、もう一度サインインが必要です。</Text>
      </Dialog>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.pageGutter,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: theme.typography.size.xl,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  headerSpacer: {
    width: theme.control.md,
  },
  logoutSection: {
    flex: 1,
    justifyContent: "flex-end",
    gap: theme.spacing[3],
  },
  logoutDescription: {
    fontSize: theme.typography.size.sm,
    textAlign: "center",
    color: theme.colors.textSecondary,
  },
  dialogBody: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
  },
}));
