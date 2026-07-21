import { type ReactNode, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge } from "@/components/ui/badge/Badge";
import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Checkbox } from "@/components/ui/checkbox/Checkbox";
import { Dialog } from "@/components/ui/dialog/Dialog";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { Input } from "@/components/ui/input/Input";
import { MapPin } from "@/components/ui/map-pin/MapPin";
import { ProgressBar } from "@/components/ui/progress-bar/ProgressBar";
import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { Switch } from "@/components/ui/switch/Switch";
import { TabBar } from "@/components/ui/tab-bar/TabBar";
import { Tabs } from "@/components/ui/tabs/Tabs";
import { Tag } from "@/components/ui/tag/Tag";
import { Toast } from "@/components/ui/toast/Toast";
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
  const [checked, setChecked] = useState(true);
  const [name, setName] = useState("");
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

        <Section title="Button">
          <Row>
            <Button onPress={() => {}}>散歩を始める</Button>
            <Button variant="secondary" onPress={() => {}}>
              一時停止
            </Button>
          </Row>
          <Row>
            <Button variant="outline" icon="map-pin" onPress={() => {}}>
              ピン追加
            </Button>
            <Button variant="ghost" onPress={() => {}}>
              あとで
            </Button>
          </Row>
          <Row>
            <Button variant="danger" icon="trash-2" onPress={() => {}}>
              削除
            </Button>
            <Button disabled onPress={() => {}}>
              目的地を選ぶ
            </Button>
          </Row>
          <Button variant="primary" icon="footprints" fullWidth size="lg" onPress={() => {}}>
            散歩を始める
          </Button>
        </Section>

        <Section title="IconButton">
          <Row>
            <IconButton icon="crosshair" label="現在地" />
            <IconButton icon="settings-2" label="設定" variant="tinted" />
            <IconButton icon="footprints" label="ナビ" variant="filled" />
            <IconButton icon="x" label="閉じる" variant="ghost" />
            <IconButton icon="crosshair" label="現在地(小)" size="sm" />
          </Row>
        </Section>

        <Section title="Badge / Tag">
          <Row>
            <Badge dot>ナビゲーション中</Badge>
            <Badge tone="success">GPS良好</Badge>
            <Badge tone="warning">一時停止中</Badge>
            <Badge tone="danger">圏外</Badge>
            <Badge tone="neutral">下書き</Badge>
          </Row>
          <Row>
            <Tag category="park" icon="trees" selected>
              公園
            </Tag>
            <Tag category="cafe" icon="coffee">
              カフェ
            </Tag>
            <Tag category="culture" icon="landmark">
              施設
            </Tag>
            <Tag category="station" icon="train-front">
              駅
            </Tag>
          </Row>
        </Section>

        <Section title="StatBlock / ProgressBar">
          <Card>
            <View style={styles.statRow}>
              <StatBlock size="sm" value="00:28:34" label="経過時間" />
              <StatBlock size="sm" value="2.1" unit="km" label="歩行距離" />
              <StatBlock size="sm" value="3,240" unit="歩" label="歩数" />
            </View>
          </Card>
          <Card>
            <StatBlock value="12" unit="日連続" label="継続日数" align="start" />
          </Card>
          <Card>
            <ProgressBar value={6240} max={8000} label="今日の目標歩数" />
          </Card>
        </Section>

        <Section title="Tabs / TabBar">
          <Tabs items={PERIOD_ITEMS} value={period} onChange={setPeriod} />
          <TabBar items={TAB_ITEMS} value={tab} onChange={setTab} />
        </Section>

        <Section title="Form">
          <Input
            label="名前"
            placeholder="例：桜のトンネル"
            value={name}
            onChangeText={setName}
            helper="あとから変更できます"
          />
          <Input label="メモ" placeholder="この場所のメモ" multiline />
          <Input label="タグ" placeholder="タグを追加" icon="tag" error="同じタグがあります" />
          <Row>
            <Checkbox label="公園" checked={checked} onChange={setChecked} />
            <Checkbox label="駅" checked={false} />
            <Checkbox label="施設" checked disabled />
          </Row>
        </Section>

        <Section title="MapPin">
          <Row>
            <MapPin category="park" />
            <MapPin category="cafe" />
            <MapPin category="culture" />
            <MapPin category="station" />
            <MapPin category="goal" size={44} label="川辺駅" />
          </Row>
        </Section>

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

        <Section title="Icon">
          <Row>
            <Icon name="footprints" />
            <Icon name="search" />
            <Icon name="bar-chart-2" />
            <Icon name="map-pin" color={theme.colors.primary} />
            <Icon name="flag" color={theme.map.station} />
            <Icon name="trees" color={theme.map.park} />
          </Row>
        </Section>
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
        <Checkbox label="コンビニ" checked />
        <Checkbox label="スーパー" checked />
        <Checkbox label="公園" checked />
        <Checkbox label="駅" />
        <Button fullWidth onPress={() => setSheetOpen(false)}>
          5件のスポットを表示
        </Button>
      </BottomSheet>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.row}>{children}</View>;
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
  section: {
    gap: theme.spacing[3],
  },
  sectionTitle: {
    fontSize: theme.typography.size.xs,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textTertiary,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dialogBody: {
    fontSize: theme.typography.size.md,
    color: theme.colors.textSecondary,
  },
}));
