import { Text, View } from "react-native";

import { Switch } from "@/components/ui/switch/Switch";
import {
  PIN_ARCHIVE_HELPER,
  PIN_ARCHIVE_LOCKED_HELPER,
  PIN_ARCHIVE_SWITCH_LABEL,
  PIN_VISITED_SWITCH_LABEL,
} from "@/features/pin/lib/pinStatus";
import { makeStyles } from "@/theme/makeStyles";

export type PinStatusFieldsProps = {
  visited: boolean;
  archived: boolean;
  onChangeVisited: (visited: boolean) => void;
  onChangeArchived: (archived: boolean) => void;
  /** 保存中 or 権限なし。 */
  visitedDisabled: boolean;
  archivedDisabled: boolean;
  /** アーカイブの権限が無い（案内文を PIN_ARCHIVE_LOCKED_HELPER に替える）。 */
  archiveLocked: boolean;
  /** 例: "pin-edit-status"。スイッチは `${testID}-visited-switch` / `${testID}-archived-switch`。 */
  testID: string;
};

/** PinStatusFields — 編集画面の「状態」セクション（訪問済み・アーカイブのスイッチと案内文。SS-173）。 */
export function PinStatusFields({
  visited,
  archived,
  onChangeVisited,
  onChangeArchived,
  visitedDisabled,
  archivedDisabled,
  archiveLocked,
  testID,
}: PinStatusFieldsProps) {
  const styles = useStyles();

  return (
    <View style={styles.root} testID={testID}>
      <Text style={styles.heading}>状態</Text>
      <Switch
        label={PIN_VISITED_SWITCH_LABEL}
        checked={visited}
        onChange={onChangeVisited}
        disabled={visitedDisabled}
        testID={`${testID}-visited-switch`}
      />
      <Switch
        label={PIN_ARCHIVE_SWITCH_LABEL}
        checked={archived}
        onChange={onChangeArchived}
        disabled={archivedDisabled}
        testID={`${testID}-archived-switch`}
      />
      <Text style={styles.helper} testID={`${testID}-archive-helper`}>
        {archiveLocked ? PIN_ARCHIVE_LOCKED_HELPER : PIN_ARCHIVE_HELPER}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    paddingHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[3],
  },
  heading: {
    fontSize: theme.typography.size.sm,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textSecondary,
  },
  helper: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textTertiary,
  },
}));
