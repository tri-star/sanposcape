import type { ReactNode } from "react";
import { View } from "react-native";

import { makeStyles } from "@/theme/makeStyles";

export type TabActionBarProps = {
  /** 並べるボタン（`Button size="sm"` を想定）。右寄せで横に並び、入りきらなければ折り返す。 */
  children: ReactNode;
  testID?: string;
};

/**
 * TabActionBar — タブ画面の下端（タブバーの上）に通常フローで置くボタン配置エリア。
 * 中身と出し分けは呼び出し側が持つ。データ駆動（配列 + 判定関数）にしないのは、
 * 並べるボタンと条件が画面ごとに違い、children の方が変更に強いため（SS-146）。
 * SS-146 でピンタブ用に作り、SS-148 でアカウントタブでも使うため `src/components/layout/` に昇格した。
 * `accessibilityRole` は付けない（ただのレイアウト。中の `Button` がそれぞれ button として露出する）。
 */
export function TabActionBar({ children, testID }: TabActionBarProps) {
  const styles = useStyles();
  return (
    <View testID={testID} style={styles.root}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    paddingHorizontal: theme.layout.pageGutter,
    paddingVertical: theme.spacing[2],
    // タブバーと同じ面にして「タブバーの上の帯」に見せる。
    backgroundColor: theme.colors.surfaceCard,
    borderTopWidth: theme.layout.hairline,
    borderTopColor: theme.colors.borderSubtle,
  },
}));
