import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Share, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { useSanpoMapInvitations } from "@/features/pin/hooks/invitation/useSanpoMapInvitations";
import {
  INVITATION_SEND_LABEL,
  INVITATION_SHEET_POINTS,
  INVITATION_SHARE_FAILED_MESSAGE,
  INVITATION_SHEET_TITLE,
  formatInvitationExpiry,
  invitationErrorMessage,
  invitationShareMessage,
} from "@/features/pin/lib/invitation/invitation";
import { createPendingShare } from "@/features/pin/lib/invitation/pendingShare";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapInviteSectionProps = {
  sanpoMapId: string;
  sanpoMapName: string;
};

/**
 * SanpoMapInviteSection — メンバー画面の owner 向けの招待（SS-250）。「メンバーを招待」で招待シート
 * （ダイアログ）を開き、「招待リンクを送る」で発行して OS の共有シート（`Share.share`）に渡す。
 * 下に有効な招待リンク（期限）と「取り消す」を並べる。出すのはフラグ `map_invitation` が ON の
 * owner だけ（呼び出し側で判定する）。発行したリンクの URL は共有シートに渡したら持たない（一覧には出さない）。
 * iOS では招待シートが閉じ終えてから共有シートを開く（SS-264。`pendingShare.ts`）。
 */
export function SanpoMapInviteSection({ sanpoMapId, sanpoMapName }: SanpoMapInviteSectionProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const openShareSheet = (message: string) => {
    Share.share({ message }).catch(() => setShareFailed(true));
  };
  // 初回の描画の openShareSheet を握るが、中で使う setShareFailed は描画をまたいで同じなので問題ない。
  const [pendingShare] = useState(() => createPendingShare(openShareSheet));
  // 閉じ終える前に画面を離れたら、預けた本文（トークン入りの URL）を開かずに捨てる。
  useEffect(() => () => pendingShare.discard(), [pendingShare]);
  const resetCreateRef = useRef<() => void>(() => {});
  const invitations = useSanpoMapInvitations(sanpoMapId, {
    enabled: true,
    onCreated: (created) => {
      const message = invitationShareMessage({ sanpoMapName, url: created.url });
      // 発行の応答（トークン入りの URL）を mutation の状態に残さない（台帳 3.8）。
      resetCreateRef.current();
      setOpen(false);
      if (Platform.OS === "ios") {
        // iOS は閉じている途中の Modal の上に共有シートを出せず、黙って何も表示しない。
        // 閉じ終えた（Dialog の onDismiss）ところで開く。Android は Intent で開くのですぐでよい。
        pendingShare.hold(message);
      } else {
        openShareSheet(message);
      }
    },
  });
  const { resetCreate } = invitations;
  resetCreateRef.current = resetCreate;
  const close = () => {
    if (invitations.creating) return;
    setOpen(false);
    resetCreate();
  };

  return (
    <View style={styles.root}>
      <Button
        variant="primary"
        icon="user"
        fullWidth
        onPress={() => {
          setShareFailed(false);
          setOpen(true);
        }}
        testID="sanpo-map-members-invite"
      >
        {INVITATION_SHEET_TITLE}
      </Button>
      {shareFailed ? (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID="sanpo-map-invite-share-error"
        >
          {INVITATION_SHARE_FAILED_MESSAGE}
        </Text>
      ) : null}
      {invitations.invitations.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.heading}>有効な招待リンク</Text>
          {invitations.invitations.map((invitation, index) => (
            <View
              key={invitation.id}
              style={[styles.row, index === 0 ? null : styles.rowDivider]}
              testID={`sanpo-map-invitation-${index}`}
            >
              <Text style={styles.rowText}>{formatInvitationExpiry(invitation.expiresAt)}</Text>
              <Button
                variant="outline"
                size="sm"
                disabled={invitations.revokingId === invitation.id}
                onPress={() => invitations.revoke(invitation.id)}
                accessibilityLabel={`招待リンクを取り消す（${formatInvitationExpiry(invitation.expiresAt)}）`}
                testID={`sanpo-map-invitation-revoke-${index}`}
              >
                取り消す
              </Button>
            </View>
          ))}
        </View>
      ) : invitations.status === "loading" ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : null}
      <Dialog
        open={open}
        title={INVITATION_SHEET_TITLE}
        onClose={close}
        onDismiss={pendingShare.flush}
        dismissDisabled={invitations.creating}
        testID="sanpo-map-invite-dialog"
        actions={
          // 「招待リンクを送る」は横に2つ並べるとダイアログの幅に収まらず右へはみ出すので、
          // 受諾画面と同じく主ボタンを上にして縦に積む。
          <View style={styles.actions}>
            <Button
              variant="primary"
              fullWidth
              disabled={invitations.creating}
              onPress={invitations.create}
              testID="sanpo-map-invite-send"
            >
              {invitations.creating ? "準備しています…" : INVITATION_SEND_LABEL}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              disabled={invitations.creating}
              onPress={close}
              testID="sanpo-map-invite-cancel"
            >
              キャンセル
            </Button>
          </View>
        }
      >
        {INVITATION_SHEET_POINTS.map((point) => (
          <Text key={point} style={styles.point}>
            ・{point}
          </Text>
        ))}
        {invitations.createErrorCode !== null ? (
          <Text
            style={styles.error}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID="sanpo-map-invite-error"
          >
            {invitationErrorMessage(invitations.createErrorCode)}
          </Text>
        ) : null}
      </Dialog>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    gap: theme.spacing[3],
  },
  list: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceCard,
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
  },
  heading: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  rowText: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textPrimary,
  },
  actions: {
    flex: 1,
    gap: theme.spacing[3] - 2,
  },
  point: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
  },
  error: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.danger,
  },
}));
