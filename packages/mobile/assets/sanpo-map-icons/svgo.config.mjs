// 地図のアイコン（Noto Emoji の SVG）を react-native-svg の parse で描ける形に軽くする設定。
// Illustrator の書き出しに含まれる DOCTYPE・メタデータ・style 属性を落とし、表示の属性に直す。
export default {
  multipass: true,
  plugins: [
    { name: "preset-default", params: { overrides: { removeViewBox: false } } },
    // 大きさは描画側（width / height の上書き）で決める。
    "removeDimensions",
    // react-native-svg の parse は style 属性の一部しか解釈しないので、表示の属性に直す。
    "convertStyleToAttrs",
    "removeXMLNS",
  ],
};
