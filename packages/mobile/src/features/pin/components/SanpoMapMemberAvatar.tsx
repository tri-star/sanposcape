import { Text, View } from "react-native";

import { sanpoMapMemberInitial } from "@/features/pin/lib/sanpoMapMember";
import type { SanpoMapMember } from "@/features/pin/types";
import { makeStyles } from "@/theme/makeStyles";

export type SanpoMapMemberAvatarProps = {
  member: Pick<SanpoMapMember, "displayName" | "role">;
  /** 丸の直径（px）。既定 32。 */
  size?: number;
};

/**
 * SanpoMapMemberAvatar — メンバーの表示名の頭文字を丸に入れて出す（SS-249）。プロフィール画像は
 * 他のメンバーに渡さない（ポリシー 1-8）ので使わない。owner は濃い色で区別する。
 * 装飾なので読み上げ対象にしない（名前は親の行が持つ）。
 */
export function SanpoMapMemberAvatar({ member, size = 32 }: SanpoMapMemberAvatarProps) {
  const styles = useStyles();
  const isOwner = member.role === "owner";
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.root,
        isOwner ? styles.owner : styles.editor,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text
        style={[isOwner ? styles.ownerText : styles.editorText, { fontSize: size * 0.42 }]}
        allowFontScaling={false}
      >
        {sanpoMapMemberInitial(member)}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.surfaceCard,
  },
  owner: {
    backgroundColor: theme.colors.primary,
  },
  editor: {
    backgroundColor: theme.colors.primaryTint,
  },
  ownerText: {
    color: theme.colors.onPrimary,
    fontWeight: theme.typography.weight.heavy,
  },
  editorText: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weight.heavy,
  },
}));
