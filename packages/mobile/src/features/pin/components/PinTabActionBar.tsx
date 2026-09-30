import type { ReactNode } from "react";
import { View } from "react-native";

import { makeStyles } from "@/theme/makeStyles";

export type PinTabActionBarProps = {
  /** 並べるボタン（`Button size="sm"` を想定）。右寄せで横に並び、入りきらなければ折り返す。 */
  children: ReactNode;
  testID?: string;
};

/**
 * PinTabActionBar — ピンタブの「ボタン配置エリア」（SS-146）。
 * 地図の下・タブバーの上に通常フローで置き、地図に重ねない。
 *
 * ボタンの出し分け条件は呼び出し側（`PinTabView`）が持つ。データ駆動（配列 + 判定関数）にしないのは、
 * 並べるボタンと条件が未確定で、children の方が変更に強いため（SS-146）。
 * ピンタブ専用なので `features/pin` に置く（2機能ルール）。
 * `accessibilityRole` は付けない（ただのレイアウト。中の `Button` がそれぞれ button として露出する）。
 */
export function PinTabActionBar({ children, testID }: PinTabActionBarProps) {
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
