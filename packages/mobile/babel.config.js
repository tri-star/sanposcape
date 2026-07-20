module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Unistyles: src 配下のスタイルをコンパイル時に処理する
      ["react-native-unistyles/plugin", { root: "src" }],
    ],
  };
};
