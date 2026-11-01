import { useNavigation, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/button/Button";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { PinStateCard } from "@/features/pin/components/PinStateCard";
import { SanpoMapIconBadge } from "@/features/pin/components/SanpoMapIconBadge";
import { useInvitationAccept } from "@/features/pin/hooks/useInvitationAccept";
import {
  INVITATION_ACCEPT_POINTS,
  invitationErrorMessage,
  invitationInviterLabel,
  invitationJoinedMessage,
  invitationVisibleNameNote,
  hasSignInScreenInStack,
  isRetriableInvitationError,
  openJoinedSanpoMap,
} from "@/features/pin/lib/invitation";
import { useScreenBack } from "@/hooks/useScreenBack";
import { setFlashMessage } from "@/lib/flashMessage";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type InvitationAcceptViewProps = {
  /** ルートで形を検証したトークン。不正・無しなら null（「使えないリンク」を出す）。 */
  token: string | null;
  signedIn: boolean;
  /** 自分の表示名（参加したときメンバーにどう見えるかを先に示す）。ゲストは null。 */
  myDisplayName: string | null;
  /** フラグ `map_invitation`（ルートが読む）。 */
  mapInvitationEnabled: boolean;
  /** サインイン画面を開く（サインイン後はこの画面へ戻る。`returnTo: "invitation"`。二重発火のラッチは呼び出し側が持つ）。 */
  onSignIn: () => void;
};

/**
 * InvitationAcceptView — 招待の受諾画面（`/invitations/accept`。SS-250）。招待リンクから開く。
 * 地図の名前・アイコン・招待した人と、参加するとできること・自分の名前の見え方を示し、
 * 「参加する」を押したときだけ参加する（リンクを開いただけでは参加しない。ADR-009 決定39）。
 * 参加したら地図詳細を開き（下にサインイン画面が残っていればピンタブの上に積む。`openJoinedSanpoMap`）、トーストで知らせる。使えないリンクは理由を区別しない文言にする。
 */
export function InvitationAcceptView({
  token,
  signedIn,
  myDisplayName,
  mapInvitationEnabled,
  onSignIn,
}: InvitationAcceptViewProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = useScreenBack({ fallbackHref: "/(tabs)" });
  const navigation = useNavigation();
  const openMap = (sanpoMapId: string) =>
    back.runOnce(() =>
      openJoinedSanpoMap(
        {
          canDismiss: router.canDismiss,
          dismissAll: router.dismissAll,
          replace: router.replace,
          push: router.push,
          replaceWithSanpoMap: (id) =>
            router.replace({ pathname: "/sanpo-maps/[sanpoMapId]", params: { sanpoMapId: id } }),
        },
        sanpoMapId,
        {
          // 押した時点の、受諾画面が載っているスタック（ルートの Stack）を読む。ログアウト後のゲストなら下にサインイン画面がある。
          // `getRootState()` は expo-router の `__root` を挟むので使わない。
          signInScreenBelow: hasSignInScreenInStack(
            (navigation.getState()?.routes ?? []).map((route) => route.name),
          ),
        },
      ),
    );
  const invitation = useInvitationAccept(mapInvitationEnabled ? token : null, {
    signedIn,
    onAccepted: (sanpoMap) => {
      setFlashMessage(invitationJoinedMessage(sanpoMap.name));
      openMap(sanpoMap.id);
    },
  });

  const renderBody = () => {
    if (!mapInvitationEnabled) {
      return (
        <PinStateCard
          testID="invitation-accept-disabled"
          icon="alert-circle"
          title={invitationErrorMessage("disabled")}
          action={{ label: "閉じる", onPress: back.goBack }}
        />
      );
    }
    if (invitation.previewStatus === "loading") {
      return <ActivityIndicator color={theme.colors.primary} />;
    }
    if (invitation.preview === null) {
      const code = invitation.previewErrorCode ?? "unknown";
      return (
        <PinStateCard
          testID="invitation-accept-error"
          icon="alert-circle"
          tone="danger"
          title={invitationErrorMessage(code)}
          action={
            isRetriableInvitationError(code)
              ? { label: "再試行", onPress: invitation.retryPreview }
              : { label: "閉じる", onPress: back.goBack }
          }
        />
      );
    }
    const preview = invitation.preview;
    return (
      <View style={styles.content}>
        <View style={styles.mapRow}>
          <SanpoMapIconBadge icon={preview.sanpoMapIcon} size={56} />
          <Text style={styles.mapName} testID="invitation-accept-map-name">
            {preview.sanpoMapName}
          </Text>
        </View>
        <Text style={styles.inviter}>{invitationInviterLabel(preview.inviterDisplayName)}</Text>
        {preview.membership === "member" && preview.sanpoMapId !== null ? (
          <>
            <Text style={styles.note}>すでにこの地図のメンバーです。</Text>
            <Button
              variant="primary"
              fullWidth
              onPress={() => openMap(preview.sanpoMapId as string)}
              testID="invitation-accept-open-map"
            >
              地図を開く
            </Button>
          </>
        ) : (
          <>
            <View style={styles.points}>
              {INVITATION_ACCEPT_POINTS.map((point) => (
                <Text key={point} style={styles.point}>
                  ・{point}
                </Text>
              ))}
            </View>
            {signedIn ? (
              <>
                <Text style={styles.note}>{invitationVisibleNameNote(myDisplayName)}</Text>
                {invitation.acceptErrorCode !== null ? (
                  <Text
                    style={styles.error}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    testID="invitation-accept-failed"
                  >
                    {invitationErrorMessage(invitation.acceptErrorCode)}
                  </Text>
                ) : null}
                <Button
                  variant="primary"
                  fullWidth
                  disabled={invitation.accepting}
                  onPress={invitation.accept}
                  testID="invitation-accept-join"
                >
                  {invitation.accepting ? "参加しています…" : "参加する"}
                </Button>
              </>
            ) : (
              <>
                <Text style={styles.note}>参加するにはサインインが必要です。</Text>
                <Button
                  variant="primary"
                  fullWidth
                  onPress={onSignIn}
                  testID="invitation-accept-sign-in"
                >
                  サインインして参加
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              fullWidth
              disabled={invitation.accepting}
              onPress={back.goBack}
              testID="invitation-accept-dismiss"
            >
              今はしない
            </Button>
          </>
        )}
      </View>
    );
  };

  return (
    <View
      testID="invitation-accept-screen"
      style={[styles.root, { paddingTop: insets.top + theme.spacing[2] }]}
    >
      <View style={styles.header}>
        <IconButton
          icon="x"
          label="閉じる"
          variant="ghost"
          onPress={back.goBack}
          testID="invitation-accept-close"
        />
        <Text accessibilityRole="header" style={styles.title}>
          地図への招待
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + theme.spacing[6] }]}
      >
        {renderBody()}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.layout.pageGutter,
    paddingBottom: theme.spacing[2],
  },
  title: {
    fontSize: theme.typography.size.xl,
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  headerSpacer: {
    width: theme.control.md,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: theme.layout.pageGutter,
  },
  content: {
    gap: theme.spacing[3],
  },
  mapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  mapName: {
    flex: 1,
    fontSize: theme.typography.size["2xl"],
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  inviter: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  points: {
    gap: theme.spacing[1],
  },
  point: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
  },
  note: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  error: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.danger,
  },
}));
