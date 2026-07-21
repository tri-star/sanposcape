/**
 * アプリのエントリポイント。
 *
 * 現状は Expo Router を読み込むだけだが、起動前に初期化が必要な処理
 * （ポリフィル・計測の初期化など）を差し込めるよう `package.json` の
 * `main` はこのファイルを指したままにしている。
 */
import "expo-router/entry";
