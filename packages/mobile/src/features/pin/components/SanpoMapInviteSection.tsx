import { useRef, useState } from "react";
import { ActivityIndicator, Share, Text, View } from "react-native";

import { Button } from "@/components/ui/button/Button";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { useSanpoMapInvitations } from "@/features/pin/hooks/useSanpoMapInvitations";
import {
  INVITATION_SEND_LABEL,
  INVITATION_SHEET_POINTS,
  INVITATION_SHEET_TITLE,
  formatInvitationExpiry,
  invitationErrorMessage,
  invitationShareMessage,
} from "@/features/pin/lib/invitation";
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
 */
export function SanpoMapInviteSection({ sanpoMapId, sanpoMapName }: SanpoMapInviteSectionProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const resetCreateRef = useRef<() => void>(() => {});
  const invitations = useSanpoMapInvitations(sanpoMapId, {
    enabled: true,
    onCreated: (created) => {
      setOpen(false);
      const message = invitationShareMessage({ sanpoMapName, url: created.url });
      // 発行の応答（トークン入りの URL）を mutation の状態に残さない（台帳 3.8）。
      resetCreateRef.current();
      void Share.share({ message });
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
        onPress={() => setOpen(true)}
        testID="sanpo-map-members-invite"
      >
        {INVITATION_SHEET_TITLE}
      </Button>
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
        dismissDisabled={invitations.creating}
        testID="sanpo-map-invite-dialog"
        actions={
          <>
            <Button
              variant="secondary"
              fullWidth
              disabled={invitations.creating}
              onPress={close}
              testID="sanpo-map-invite-cancel"
            >
              キャンセル
            </Button>
            <Button
              variant="primary"
              fullWidth
              disabled={invitations.creating}
              onPress={invitations.create}
              testID="sanpo-map-invite-send"
            >
              {invitations.creating ? "準備しています…" : INVITATION_SEND_LABEL}
            </Button>
          </>
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
  point: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
  },
  error: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.danger,
  },
}));
