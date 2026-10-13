import { Text, View } from "react-native";

import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { Button } from "@/components/ui/button/Button";
import { Checkbox } from "@/components/ui/checkbox/Checkbox";
import { Switch } from "@/components/ui/switch/Switch";
import {
  canUncheckPinVisitFilterOption,
  isPinVisitFilterOptionChecked,
  type PinMapFilter,
  type PinVisitFilterOption,
} from "@/features/pin/lib/pinMapFilter";
import { PIN_UNVISITED_LABEL, PIN_VISITED_LABEL } from "@/features/pin/lib/pinStatus";
import { makeStyles } from "@/theme/makeStyles";

export type PinMapFilterSheetProps = {
  open: boolean;
  onClose: () => void;
  filter: PinMapFilter;
  onChangeIncludeArchived: (includeArchived: boolean) => void;
  onChangeVisitOption: (option: PinVisitFilterOption, checked: boolean) => void;
  /**
   * 例: "pin-tab-pin-filter"。シートは `${testIDPrefix}-sheet`、スイッチは `${testIDPrefix}-archived-switch`、
   * チェックボックスは `${testIDPrefix}-unvisited` / `${testIDPrefix}-visited`、閉じるは `${testIDPrefix}-done`。
   */
  testIDPrefix: string;
};

const VISIT_OPTIONS: readonly { option: PinVisitFilterOption; label: string }[] = [
  { option: "unvisited", label: PIN_UNVISITED_LABEL },
  { option: "visited", label: PIN_VISITED_LABEL },
];

/**
 * PinMapFilterSheet — 地図に描く登録済みピンの絞り込み（SS-174）。操作はその場で地図に効く
 * （下書き + 適用にしない。`CategorySheet` と違い、確定で重い取得が走るわけではないため）。
 * 訪問状況の最後の1つは外せない（チェックボックスを無効にして案内文を出す）。
 */
export function PinMapFilterSheet({
  open,
  onClose,
  filter,
  onChangeIncludeArchived,
  onChangeVisitOption,
  testIDPrefix,
}: PinMapFilterSheetProps) {
  const styles = useStyles();

  return (
    <BottomSheet
      open={open}
      title="表示するピン"
      onClose={onClose}
      testID={`${testIDPrefix}-sheet`}
    >
      <View style={styles.section}>
        <Switch
          label="アーカイブ済みも表示"
          checked={filter.includeArchived}
          onChange={onChangeIncludeArchived}
          testID={`${testIDPrefix}-archived-switch`}
        />
        <Text style={styles.helper}>アーカイブ済みのピンは薄く表示します</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>訪問状況</Text>
        {VISIT_OPTIONS.map(({ option, label }) => {
          const checked = isPinVisitFilterOptionChecked(filter, option);
          return (
            <Checkbox
              key={option}
              label={label}
              checked={checked}
              onChange={(next) => onChangeVisitOption(option, next)}
              disabled={checked && !canUncheckPinVisitFilterOption(filter, option)}
              testID={`${testIDPrefix}-${option}`}
            />
          );
        })}
        <Text style={styles.helper}>少なくとも1つ選んでください</Text>
      </View>
      <Button variant="secondary" fullWidth onPress={onClose} testID={`${testIDPrefix}-done`}>
        閉じる
      </Button>
    </BottomSheet>
  );
}

const useStyles = makeStyles((theme) => ({
  section: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[5],
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
