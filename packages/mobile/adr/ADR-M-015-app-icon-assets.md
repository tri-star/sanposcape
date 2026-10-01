# ADR-M-015: アプリアイコンは採用PNGとAndroidの専用レイヤーを使う

## 日付

2026-10-01（SS-87）

## コンテキスト

SS-87で、青空・雲・木々のある道と、顔のない中性的な歩行者のイラストを採用した。
既存設定はExpoのサンプル画像で、iOSはIcon Composer、AndroidはAdaptive Iconの前景・背景・単色レイヤーを指定していた。
採用画像を両OSに反映し、小さな表示やAndroidのマスクでも人物を識別できる必要がある。

## 決定

- 静的なパスは[ADR-M-007](./ADR-M-007-expo-config-and-maps-key-injection.md)に従い`app.json`に指定する。
- 共通`icon`と`ios.icon`は`assets/app-icons/sanposcape-icon-1024.png`を指定する。不透明・正方形の採用PNGを使い、角丸はOSに任せる。
- iOSはサンプルの`expo.icon`を使わず、ExpoのPNG入力からネイティブアイコンを生成する。独自のdark/tinted画像は今回用意しない。
- Androidは採用画像から画像生成ツールで分離した人物と景色を専用レイヤーにする。単色レイヤーは人物のアルファ形状を使う。
- 人物は1024pxキャンバスの中央に置き、108dpキャンバスの中央66dpの円内にアルファが収まるよう余白を調整する。
- 開発・本番は同じアイコンを使う。スプラッシュとWeb faviconはこの変更の対象にしない。
- 原画像・分離した画像・サイズ展開・再生成スクリプトを保持する。生成元と設定への導線は`assets/app-icons/README.md`に記載する。

## 検討した選択肢

- **iOSのPNG入力（採用）**: 承認された完成画像をそのまま使え、Linuxでも素材の検証・再生成ができる。
- **Icon Composerを更新**: レイヤーや見た目別の調整ができるが、完成した1枚絵に追加効果を加える要件はなく、macOSでの編集・検証が必要になる。
- **Androidの完成画像を前景に指定**: 簡単だが、マスクによる人物の欠けや、テーマ用にサンプルアイコンが残る問題を避けにくい。

## 決定理由

採用された人物と景色を中心に据え、各OSの入力形式とマスクに合わせる。iOSの高度なレイヤー効果より、承認済み画像への忠実さと再現可能な生成を優先する。

## 影響

- アイコン更新にはネイティブアプリの再ビルド・再インストールが必要。MetroのFast RefreshやOTAだけでは反映されない。
- Androidの景色レイヤーは人物除去後に再構成されるため、完成PNGと完全に同じピクセルにはならない。合成プレビューと端末で見え方を確認する。
- iOSのdark/tinted表示とAndroidの各ランチャーによる見え方はOSにも依存する。実機未確認ならその制約を報告する。

## 関連情報

- [Expo: App icon](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)
- [Android: Adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)
- [ADR-M-003: development build](./ADR-M-003-development-build-and-dev-loop.md)
