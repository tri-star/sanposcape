import { type ReactNode, useState } from "react";
import { Text, View } from "react-native";

import { Badge } from "@/components/ui/badge/Badge";
import { Button } from "@/components/ui/button/Button";
import { Card } from "@/components/ui/card/Card";
import { Checkbox } from "@/components/ui/checkbox/Checkbox";
import { Icon } from "@/components/ui/icon/Icon";
import { IconButton } from "@/components/ui/icon-button/IconButton";
import { Input } from "@/components/ui/input/Input";
import { MapPin } from "@/components/ui/map-pin/MapPin";
import { ProgressBar } from "@/components/ui/progress-bar/ProgressBar";
import { StatBlock } from "@/components/ui/stat-block/StatBlock";
import { Tag } from "@/components/ui/tag/Tag";
import { makeStyles } from "@/theme/makeStyles";
import { useTheme } from "@/theme/useTheme";

/**
 * デザインシステムの一覧（`DesignSystemGallery`）の、部品ごとの見本の節。
 * 開閉する Overlay・画面のテーマの切り替えなど、画面全体の状態を持つ節は `DesignSystemGallery` に残す。
 */

const TAG_ITEMS = [
  { label: "公園", category: "park", icon: "trees" },
  { label: "カフェ", category: "cafe", icon: "coffee" },
  { label: "施設", category: "culture", icon: "landmark" },
  { label: "駅", category: "station", icon: "train-front" },
] as const;

/**
 * 見た目の確認だけが目的で、押しても何も起きないのが正しいコントロール用。
 * プロダクトのコードでは使わないこと（ハンドラを必須にしている意味が無くなる）。
 */
const noop = () => {};

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.row}>{children}</View>;
}

export function ButtonSection() {
  return (
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
  );
}

export function IconButtonSection() {
  return (
    <Section title="IconButton">
      <Row>
        <IconButton icon="crosshair" label="現在地" onPress={noop} />
        <IconButton icon="settings-2" label="設定" variant="tinted" onPress={noop} />
        <IconButton icon="footprints" label="ナビ" variant="filled" onPress={noop} />
        <IconButton icon="x" label="閉じる" variant="ghost" onPress={noop} />
        <IconButton icon="crosshair" label="現在地(小)" size="sm" onPress={noop} />
        <IconButton icon="plus" label="追加(無効)" disabled onPress={noop} />
      </Row>
    </Section>
  );
}

export function BadgeTagSection() {
  const [selectedTag, setSelectedTag] = useState<string>("公園");
  return (
    <Section title="Badge / Tag">
      <Row>
        <Badge dot>ナビゲーション中</Badge>
        <Badge tone="success">GPS良好</Badge>
        <Badge tone="warning">一時停止中</Badge>
        <Badge tone="danger">圏外</Badge>
        <Badge tone="neutral">下書き</Badge>
      </Row>
      <Row>
        {TAG_ITEMS.map((item) => (
          <Tag
            key={item.label}
            category={item.category}
            icon={item.icon}
            selected={selectedTag === item.label}
            onPress={() => setSelectedTag(item.label)}
          >
            {item.label}
          </Tag>
        ))}
      </Row>
      {/* onPress を渡さない静的なタグ（Pressable を使わず role も付かない） */}
      <Row>
        <Tag category="park" icon="trees">
          静的タグ
        </Tag>
      </Row>
    </Section>
  );
}

export function StatSection() {
  const styles = useStyles();
  return (
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
  );
}

export function FormSection() {
  const [checked, setChecked] = useState(true);
  const [stationChecked, setStationChecked] = useState(false);
  const [name, setName] = useState("");
  return (
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
        <Checkbox label="駅" checked={stationChecked} onChange={setStationChecked} />
        <Checkbox label="施設" checked disabled onChange={noop} />
      </Row>
    </Section>
  );
}

export function MapPinSection() {
  return (
    <Section title="MapPin">
      <Row>
        <MapPin category="park" />
        <MapPin category="cafe" />
        <MapPin category="culture" />
        <MapPin category="station" />
        {/* 地図のアイコン用に足した色（雨・避暑地の水色、猫の茶色）。 */}
        <MapPin category="sky" icon="cloud-rain" />
        <MapPin category="brown" icon="cat" />
        <MapPin category="goal" size={44} label="川辺駅" />
        {/* 登録済みピンの既定の見た目（地図のアイコン pin）。 */}
        <MapPin category="park" icon="map-pin" size={30} />
      </Row>
    </Section>
  );
}

export function IconSection() {
  const theme = useTheme();
  return (
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
  );
}

const useStyles = makeStyles((theme) => ({
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
}));
