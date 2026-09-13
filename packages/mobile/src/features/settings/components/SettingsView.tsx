import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { AccountDeleteDialog } from "@/features/settings/components/AccountDeleteDialog";
import { useAccountDeletion } from "@/features/settings/hooks/useAccountDeletion";
import {
  ACCOUNT_DELETE_BUTTON_LABEL,
  ACCOUNT_DELETE_SECTION_DESCRIPTION,
  ACCOUNT_DELETE_SECTION_TITLE,
} from "@/features/settings/lib/accountDeleteCopy";
import { canDeleteAccount, resolveSettingsSection } from "@/features/settings/lib/settingsSection";
import { authService } from "@/services/auth";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * 設定画面。SS-11 時点ではログアウト導線のみを提供していたが、SS-57 でゲスト散歩を解禁した
 * ことで `/settings` にゲストも到達できるようになったため、ゲストのときはログアウトの代わりに
 * サインイン導線を出す（押しても何も起きない「ログアウト」を見せない）。
 * 認証全体のルートガードは `AuthGate`（`app/_layout.tsx`）が担う（SS-13 / ADR-009）。
 *
 * `features/settings` は `.oxlintrc.json` の `no-restricted-imports` override 対象外
 * （対象は `src/features/walk/**` / `src/features/history/**` のみ）なので、
 * `useAuthSessionStore` を直接参照してよい（`authService.getCurrentUser()` は見ない。ADR-009 決定2）。
 *
 * `status` は `"loading" | "authenticated" | "guest"` の3値（`loading` はまだ「認証済み/未認証」
 * を判定してはいけない起動時のセッション復元中）。これを `status === "authenticated"` の boolean
 * に潰すと `loading` が `guest` 扱いになり、復元完了前に一瞬サインイン導線が出てしまう
 * （PR #50 Copilot レビュー指摘）。そのため `resolveSettingsSection()` で3値のまま分岐する。
 * `AuthGate` は `loading` を最優先で `allow` にするため、ディープリンクや歯車ボタンからの直後
 * 遷移では `SettingsView` が `loading` のままレンダリングされうる（実害の窓は数百ms程度）。
 *
 * SS-62 でアカウント削除（不可逆）を追加した。ログアウト（可逆）と `variant` / 配置 / 文言で
 * 区別する（誤操作防止）。削除後の遷移は `AuthGate` が担うため、この画面は `router` を触らない
 * （ログアウトと同じ方針）。
 */
export function SettingsView() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useStyles();
  const status = useAuthSessionStore((state) => state.status);
  const section = resolveSettingsSection(status);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [accountDeleteDialogOpen, setAccountDeleteDialogOpen] = useState(false);
  const deletion = useAccountDeletion();

  const closeLogoutDialog = () => setLogoutDialogOpen(false);

  const closeAccountDeleteDialog = () => {
    setAccountDeleteDialogOpen(false);
    // 失敗表示を残したまま再オープンしないよう、閉じるタイミングで mutation もリセットする
    // （WalkDetailView.closeDeleteDialog と同じ）。
    deletion.reset();
  };

  const handleConfirmLogout = () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    // signOut() は認証状態を guest に更新する。遷移と履歴スタックの破棄は AuthGate に一元化する。
    // 現在の実装は失敗を吸収するが、将来の実装が reject してもダイアログを操作不能にしない。
    void authService.signOut().catch(() => {
      setIsSigningOut(false);
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

        {section === "loading" ? (
          <View style={styles.loadingSection} testID="settings-loading">
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : section === "authenticated" ? (
          <View style={styles.authenticatedSection}>
            {/* 可逆な操作 */}
            <View style={styles.logoutBlock}>
              <Text style={styles.logoutDescription}>この端末からサインアウトします。</Text>
              <Button
                variant="outline"
                fullWidth
                onPress={() => setLogoutDialogOpen(true)}
                testID="settings-open-logout-dialog"
              >
                ログアウト
              </Button>
            </View>

            {/* 不可逆な操作（危険ゾーン）。canDeleteAccount(section) はこの分岐内では常に true
                だが、判定を lib 側の関数に通す形にしておく（settingsSection.test.ts が実挙動と
                同じ関数を検証できる／将来ゲスト可否が変わったときの変更点が1箇所になる）。 */}
            {canDeleteAccount(section) ? (
              <View style={styles.dangerZone} testID="settings-danger-zone">
                <Text style={styles.dangerZoneTitle}>{ACCOUNT_DELETE_SECTION_TITLE}</Text>
                <Text style={styles.dangerZoneDescription}>
                  {ACCOUNT_DELETE_SECTION_DESCRIPTION}
                </Text>
                <Button
                  variant="danger"
                  fullWidth
                  onPress={() => setAccountDeleteDialogOpen(true)}
                  testID="settings-open-account-delete-dialog"
                >
                  {ACCOUNT_DELETE_BUTTON_LABEL}
                </Button>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.logoutSection}>
            <Text style={styles.logoutDescription}>
              ゲストで利用中です。サインインすると、歩いた記録を保存できます。
            </Text>
            <Button
              variant="primary"
              fullWidth
              testID="settings-sign-in"
              onPress={() => router.replace("/(auth)/sign-in")}
            >
              サインイン
            </Button>
          </View>
        )}
      </ScrollView>

      {/*
        マウント条件は `open` の boolean（`logoutDialogOpen`）だけにする。`section` の値で
        条件付きマウントすると、ログアウト成功で section が "authenticated" から "guest" に
        変わった瞬間 Dialog 自体がアンマウントされ、AuthGate の退避（router.replace）が完了する
        までの一瞬ちらつきうる（SS-57 ローカルレビュー対応）。guest / loading はこの Dialog を
        開く導線（`settings-open-logout-dialog`）自体を持たないため、常にマウントしても実害は無い。
      */}
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

      {/*
        マウント条件は `open` の boolean（`accountDeleteDialogOpen`）だけにする。理由は上の
        ログアウトダイアログと同じ: 削除成功で section が "authenticated" から "guest" に
        変わった瞬間にアンマウントすると、AuthGate の退避（dismissAll + replace）が完了する
        までの一瞬ちらつく。成功後 status は "deleted" のまま AuthGate の遷移でアンマウント
        される（isSigningOut と同じで意図的にリセットしない）。
      */}
      <AccountDeleteDialog
        open={accountDeleteDialogOpen}
        status={deletion.status}
        errorCode={deletion.errorCode}
        onCancel={closeAccountDeleteDialog}
        onConfirm={deletion.deleteAccount}
      />
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
  loadingSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutSection: {
    flex: 1,
    justifyContent: "flex-end",
    gap: theme.spacing[3],
  },
  // authenticated 節（ログアウト + アカウント削除）用。ログアウトブロックと危険ゾーンの間を
  // theme.spacing[6] で広く取り、誤操作防止のため視覚的に分離する（SS-62）。
  authenticatedSection: {
    flex: 1,
    justifyContent: "flex-end",
    gap: theme.spacing[6],
  },
  logoutBlock: {
    gap: theme.spacing[3],
  },
  logoutDescription: {
    fontSize: theme.typography.size.sm,
    textAlign: "center",
    color: theme.colors.textSecondary,
  },
  dangerZone: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    backgroundColor: theme.colors.dangerTint,
    borderRadius: theme.radius.md,
  },
  dangerZoneTitle: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.danger,
  },
  dangerZoneDescription: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  dialogBody: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
  },
}));
