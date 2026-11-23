import { Text, View } from "react-native";

import { Badge } from "@/components/ui/badge/Badge";
import { Button } from "@/components/ui/button/Button";
import { SanpoMapMemberAvatar } from "@/features/sanpo-map/map/components/SanpoMapMemberAvatar";
import {
  SANPO_MAP_LEAVE_LABEL,
  canRemoveSanpoMapMember,
  sanpoMapMemberDisplayName,
  sanpoMapMemberRoleLabel,
} from "@/features/sanpo-map/map/lib/sanpoMapMember";
import type { SanpoMapMember } from "@/features/sanpo-map/shared/types";
import { makeStyles } from "@/theme/makeStyles";

export type SanpoMapMemberListProps = {
  members: readonly SanpoMapMember[];
  /** 見ている人の、この地図での役割。 */
  viewerRole: SanpoMapMember["role"];
  /** サインイン中の利用者の ID。 */
  currentUserId: string | null;
  /** owner が自分以外の行の「外す」を押した。 */
  onRemove: (member: SanpoMapMember) => void;
  /** editor が「この地図から抜ける」を押した（自分の行を渡す）。 */
  onLeave: (me: SanpoMapMember) => void;
};

/**
 * 地図のメンバー画面（`SanpoMapMembersView`）のメンバーの一覧と、editor の「この地図から抜ける」（SS-249）。
 * owner は自分以外を「外す」、editor は抜けるだけ（`canRemoveSanpoMapMember`）。
 */
export function SanpoMapMemberList({
  members,
  viewerRole,
  currentUserId,
  onRemove,
  onLeave,
}: SanpoMapMemberListProps) {
  const styles = useStyles();
  return (
    <>
      <View style={styles.list}>
        {members.map((member, index) => {
          const name = sanpoMapMemberDisplayName(member);
          const isMe = member.userId === currentUserId;
          const removable = canRemoveSanpoMapMember({
            viewerRole,
            viewerUserId: currentUserId,
            member,
          });
          return (
            <View
              key={member.userId}
              style={[styles.row, index === 0 ? null : styles.rowDivider]}
              testID={`sanpo-map-member-${index}`}
            >
              <SanpoMapMemberAvatar member={member} size={36} />
              <View style={styles.rowText}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {name}
                  {isMe ? <Text style={styles.me}>（あなた）</Text> : null}
                </Text>
                <View style={styles.badges}>
                  <Badge tone={member.role === "owner" ? "info" : "neutral"}>
                    {sanpoMapMemberRoleLabel(member.role)}
                  </Badge>
                </View>
              </View>
              {removable ? (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => onRemove(member)}
                  accessibilityLabel={`${name}さんを外す`}
                  testID={`sanpo-map-member-remove-${index}`}
                >
                  外す
                </Button>
              ) : null}
            </View>
          );
        })}
      </View>
      {viewerRole === "editor" && currentUserId !== null ? (
        <Button
          variant="danger"
          fullWidth
          onPress={() => {
            const me = members.find((member) => member.userId === currentUserId);
            if (me !== undefined) onLeave(me);
          }}
          testID="sanpo-map-members-leave"
          style={styles.leave}
        >
          {SANPO_MAP_LEAVE_LABEL}
        </Button>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((theme) => ({
  list: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceCard,
    paddingHorizontal: theme.spacing[3],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    minHeight: 56,
    paddingVertical: theme.spacing[2],
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  rowText: {
    flex: 1,
    gap: theme.spacing[1],
  },
  memberName: {
    fontSize: theme.typography.size.md,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },
  me: {
    fontWeight: theme.typography.weight.regular,
    color: theme.colors.textSecondary,
  },
  badges: {
    flexDirection: "row",
  },
  leave: {
    marginTop: theme.spacing[3],
  },
}));
