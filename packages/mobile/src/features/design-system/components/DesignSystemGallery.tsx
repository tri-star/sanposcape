import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Checkbox } from "@/components/ui/checkbox/Checkbox";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { Switch } from "@/components/ui/switch/Switch";
import { TabBar } from "@/components/ui/tab-bar/TabBar";
import { Tabs } from "@/components/ui/tabs/Tabs";
import { Toast } from "@/components/ui/toast/Toast";
import {
  BadgeTagSection,
  ButtonSection,
  FormSection,
  IconButtonSection,
  IconSection,
  MapPinSection,
  Row,
  Section,
  StatSection,
} from "@/features/design-system/components/DesignSystemGallerySections";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme, useThemeMode } from "@/theme/useTheme";

const TAB_ITEMS = [
  { label: "ナビ", value: "nav", icon: "footprints" },
  { label: "検索", value: "search", icon: "search" },
  { label: "記録", value: "record", icon: "bar-chart-2" },
] as const;

const PERIOD_ITEMS = [
  { label: "1週間", value: "week" },
  { label: "1ヶ月", value: "month" },
] as const;

const SPOT_FILTERS = ["コンビニ", "スーパー", "公園", "駅"] as const;

/**
 * デザインシステムの一覧。取り込んだトークンとUIプリミティブを実機で確認するための画面。
 * 画面フローが実装されるまでの動作確認用で、プロダクトの画面ではない。
 */
export function DesignSystemGallery() {
  const theme = useTheme();
  const { mode, setMode } = useThemeMode();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<(typeof TAB_ITEMS)[number]["value"]>("nav");
  const [period, setPeriod] = useState<(typeof PERIOD_ITEMS)[number]["value"]>("week");
  const [visibleSpots, setVisibleSpots] = useState<readonly string[]>([
    "コンビニ",
    "スーパー",
    "公園",
  ]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isDark = theme.name === "dark";

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + theme.spacing[4], paddingBottom: theme.spacing[10] },
        ]}
      >
        <View>
          <Text style={styles.title}>Sanpo Design System</Text>
          <Text style={styles.subtitle}>取り込んだトークンとUIプリミティブの確認用</Text>
        </View>

        <Card>
          <Switch
            label={`テーマ: ${mode === "system" ? "端末設定" : mode}`}
            checked={isDark}
            onChange={(next) => setMode(next ? "dark" : "light")}
          />
        </Card>

        <ButtonSection />

        <IconButtonSection />

        <BadgeTagSection />

        <StatSection />

        <Section title="Tabs / TabBar">
          <Tabs items={PERIOD_ITEMS} value={period} onChange={setPeriod} />
          <TabBar items={TAB_ITEMS} value={tab} onChange={setTab} />
        </Section>

        <FormSection />

        <MapPinSection />

        <Section title="Overlay / Toast">
          <Row>
            <Button variant="secondary" onPress={() => setDialogOpen(true)}>
              Dialog を開く
            </Button>
            <Button variant="secondary" onPress={() => setSheetOpen(true)}>
              BottomSheet を開く
            </Button>
          </Row>
          <Toast message="散歩を記録しました" />
          <Toast message="ピンを保存しました" tone="success" />
          <Toast message="保存に失敗しました" tone="danger" />
        </Section>

        <IconSection />
      </ScrollView>

      <Dialog
        open={dialogOpen}
        title="散歩を終了しますか？"
        onClose={() => setDialogOpen(false)}
        actions={
          <>
            <Button variant="secondary" fullWidth onPress={() => setDialogOpen(false)}>
              続ける
            </Button>
            <Button fullWidth onPress={() => setDialogOpen(false)}>
              終了して記録
            </Button>
          </>
        }
      >
        <Text style={styles.dialogBody}>経過時間 00:28:34 を今日の記録に保存します。</Text>
      </Dialog>

      <BottomSheet open={sheetOpen} title="表示するスポット" onClose={() => setSheetOpen(false)}>
        {SPOT_FILTERS.map((spot) => (
          <Checkbox
            key={spot}
            label={spot}
            checked={visibleSpots.includes(spot)}
            onChange={(next) =>
              setVisibleSpots((prev) =>
                next ? [...prev, spot] : prev.filter((item) => item !== spot),
              )
            }
          />
        ))}
        <Button fullWidth onPress={() => setSheetOpen(false)}>
          {visibleSpots.length}件のスポットを表示
        </Button>
      </BottomSheet>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surfaceApp,
  },
  content: {
    paddingHorizontal: theme.layout.pageGutter,
    gap: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.size["2xl"],
    fontWeight: theme.typography.weight.heavy,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    marginTop: theme.spacing[1],
    fontSize: theme.typography.size.sm,
    color: theme.colors.textSecondary,
  },
  dialogBody: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
  },
}));
