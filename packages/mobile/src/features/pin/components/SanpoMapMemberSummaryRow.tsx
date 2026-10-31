import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon/Icon";
import { SanpoMapMemberAvatar } from "@/features/pin/components/SanpoMapMemberAvatar";
import {
  formatSanpoMapMemberCount,
  splitSanpoMapMemberAvatars,
} from "@/features/pin/lib/sanpoMapMember";
import type { QueryLoadStatus } from "@/features/pin/lib/queryLoadStatus";
import type { SanpoMapMember } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

export type SanpoMapMemberSummaryRowProps = {
  members: SanpoMapMember[];
  status: QueryLoadStatus;
  onPress: () => void;
};

/**
 * SanpoMapMemberSummaryRow — 地図詳細の情報カードの「メンバー」の行（SS-249）。アバターを重ねて並べ、
 * 人数を出す。押すとメンバー画面へ。読み込み中・失敗でも押せる（メンバー画面で再試行できる）。
 */
export function SanpoMapMemberSummaryRow({
  members,
  status,
  onPress,
}: SanpoMapMemberSummaryRowProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { shown, overflow } = splitSanpoMapMemberAvatars(members);
  const label = status === "ready" ? formatSanpoMapMemberCount(members.length) : "メンバー";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}。メンバーを見る`}
      testID="sanpo-map-detail-members"
      style={({ pressed }) => [styles.root, pressed ? styles.pressed : null]}
    >
      <View style={styles.avatars}>
        {shown.map((member, index) => (
          <View key={member.userId} style={index === 0 ? null : styles.overlap}>
            <SanpoMapMemberAvatar member={member} size={28} />
          </View>
        ))}
        {overflow > 0 ? (
          <Text style={styles.overflow} allowFontScaling={false}>
            +{overflow}
          </Text>
        ) : null}
      </View>
      {status === "loading" ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : null}
      <Text style={styles.label} testID="sanpo-map-detail-member-count">
        {label}
      </Text>
      <Icon name="chevron-right" size={18} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 44,
    paddingVertical: theme.spacing[1],
  },
  pressed: {
    opacity: 0.6,
  },
  avatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  overlap: {
    marginLeft: -8,
  },
  overflow: {
    marginLeft: theme.spacing[1],
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  label: {
    flex: 1,
    fontSize: theme.typography.size.md,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weight.bold,
  },
}));
