import { Text, View } from "react-native";

import { IconButton } from "@/components/ui/icon-button/IconButton";
import { NameSearchField } from "@/features/sanpo-map/shared/components/NameSearchField";
import { makeStyles } from "@/theme/makeStyles";

export type SanpoMapListHeaderProps = {
  onBack: () => void;
  /** 「招待リンクで参加」を出すか（サインイン中だけ。SS-250）。 */
  showJoin: boolean;
  onJoin: () => void;
  /** 名前の検索欄を出すか（地図が1件以上取れたときだけ）。 */
  showSearch: boolean;
  query: string;
  onChangeQuery: (query: string) => void;
};

/** 地図一覧（`SanpoMapListView`）の上端（戻る・見出し・招待リンクで参加）と、名前の検索欄。 */
export function SanpoMapListHeader({
  onBack,
  showJoin,
  onJoin,
  showSearch,
  query,
  onChangeQuery,
}: SanpoMapListHeaderProps) {
  const styles = useStyles();
  return (
    <>
      <View style={styles.header}>
        <IconButton
          icon="chevron-left"
          label="戻る"
          variant="ghost"
          onPress={onBack}
          testID="sanpo-map-list-back"
        />
        <Text accessibilityRole="header" style={styles.title}>
          地図一覧
        </Text>
        {showJoin ? (
          <IconButton
            icon="link"
            label="招待リンクで参加"
            variant="ghost"
            onPress={onJoin}
            testID="sanpo-map-list-join-invitation"
          />
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      {showSearch ? (
        <View style={styles.search}>
          <NameSearchField
            value={query}
            onChangeText={onChangeQuery}
            placeholder="地図の名前で検索"
            accessibilityLabel="地図の名前で検索"
            testID="sanpo-map-list-search-input"
          />
        </View>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((theme) => ({
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
  search: {
    paddingHorizontal: theme.layout.pageGutter,
    paddingBottom: theme.spacing[2],
  },
}));
