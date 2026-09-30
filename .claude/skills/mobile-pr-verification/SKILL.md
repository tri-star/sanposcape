---
name: mobile-pr-verification
description: "mobile(React Native / Expo)の画面変更を含むPRを作成・更新した後に、Androidエミュレータで動作確認し、そのスクリーンショットを gh の --attach でPRへコメントとして添付するスキル。task-workflow のPR作成・review-fix の push の直後に自動で呼ばれる。「PRに動作確認のスクショを貼って」「#123 の画面をエミュレータで確認してPRに添付して」のように直接指示された場合にも使用する。画面変更を含まないPRでは何もせず終了し、adb や gh の --attach が使えない環境では省略して理由を報告する。"
argument-hint: "[PR番号] [issue-id(option)]"
allowed-tools: Bash, Read
---

# mobile PR 動作確認の添付スキル

レビュアーは実際の画面を見られないため、mobile の画面変更を含むPRでは
エミュレータでの動作確認結果（スクリーンショット）をPRにコメントとして添付する。

エミュレータの起動・画面操作・スクリーンショット取得は [mobile-local-verification](../mobile-local-verification/SKILL.md) の手順と
`scripts/mobile-tools/` をそのまま使う。このスキルは「実行するかの判定」「省略の判断」「PRへの添付」を担当する。

## パラメータ

- `[PR番号]` : 添付先のPR番号。省略時は `gh pr view --json number` で現在のブランチのPRを使う
- `[issue-id]` : 作業ディレクトリ `<task-root>` = `<project-root>/tmp/<issue-id>` を決めるために使う。
  無い場合は `<project-root>/tmp/pr-<PR番号>`

## 基本方針

- **このスキルの失敗でPR作成や呼び出し元のワークフローを止めない。** 各手順でできないことが分かったら、
  そこで省略し、「省略した旨」と「理由」を呼び出し元（最終的にはユーザー）へ報告して終了する。
- 自律実行中はユーザーへの問い合わせで止まらない（APIキー未設定などユーザー作業が必要な場合も、省略して報告する）。

## 手順

### 1. 画面変更を含むか判定する

PRのベースブランチとの差分から判定する。

```bash
BASE=$(gh pr view <PR番号> --json baseRefName -q .baseRefName)
git fetch origin "$BASE"
git diff --name-only "origin/${BASE}...HEAD" -- packages/mobile \
  | grep -E '^packages/mobile/(app/|src/.*\.tsx$|src/theme/|design/tokens/|assets/)' \
  | grep -v -E '\.test\.tsx?$|^packages/mobile/src/api/generated/'
```

- 1件以上出力された → 「画面に関する変更あり」。出力されたファイルを手順3の確認対象にする
- 出力が空 → **このスキルは何もせず終了する**（省略ではなく対象外。報告は「画面変更なしのため対象外」の1行でよい）

判定基準（テストファイルと Orval 生成物 `src/api/generated/` は除く）:

| 対象 | 理由 |
|---|---|
| `packages/mobile/app/**` | Expo Router の画面・レイアウト |
| `packages/mobile/src/**/*.tsx` | 画面を構成するコンポーネント（`features/*/components`、`components/ui` など） |
| `packages/mobile/src/theme/**`、`packages/mobile/design/tokens/**` | 全画面の見た目に影響するテーマ・デザイントークン |
| `packages/mobile/assets/**` | 画面に表示される画像・アイコン |

`.ts` だけの変更（hooks・lib・api・services など）は対象外とする。ただし、PRの目的が表示内容や画面遷移の変更である
（例: hooks の修正でローディング・エラー表示の出し分けが変わる）と明らかな場合は、判断のうえ対象に含めてよい。
その場合は判断理由を報告に含める。

**review-fix の push で呼ばれた場合**は、PR全体ではなく今回 push したコミットの範囲（`<push前のHEAD>..HEAD`）で判定し、
画面に影響する修正があったときだけ、その画面を撮り直して新しいコメントとして添付する。

### 2. 前提を確認する（重い起動処理より先に行う）

```bash
adb version                                          # 失敗 → 省略（adb が利用できない）
gh pr comment --help 2>/dev/null | grep -q -- '--attach' \
  || gh --version                                    # 該当なし → 省略（gh が --attach 非対応）
```

| 状況 | 扱い | 報告する理由の例 |
|---|---|---|
| `adb version` が失敗する（コマンドが無い・Windows 側の adb.exe が見つからない） | 省略 | `adb が利用できないため、エミュレータでの動作確認とPRへの添付を省略しました` |
| `gh pr comment --help` に `--attach` が無い | 省略 | `gh <バージョン> が --attach に対応していないため、PRへの添付を省略しました` |

- **`adb version` はサンドボックス外（`dangerouslyDisableSandbox: true`）で実行する。** サンドボックス内では
  `%LOCALAPPDATA%` が解決できず、adb が入っている環境でも `adb.exe が見つかりません` で失敗する（実測）。
  サンドボックス内での失敗を「adb が利用できない」と判定して省略しないこと。
- `gh` だけが非対応の場合も、動作確認のためだけにエミュレータを起動しない（このスキルの目的はPRへの添付のため）。

### 3. エミュレータで動作確認する

[mobile-local-verification](../mobile-local-verification/SKILL.md) のステップ0〜3に従う（サンドボックス外で実行するコマンドの扱いも同スキルに従う）。

1. `bash scripts/mobile-tools/dev-doctor.sh` で状態を確認する
   - `GOOGLE_MAPS_SERVER_API_KEY` が未設定の場合、ユーザーに設定を依頼して待つことはしない。
     確認対象の画面が backend に依存しなければ `SKIP_BACKEND=1` で進め、依存するなら省略して理由を報告する
2. `bash scripts/mobile-tools/dev-up.sh` で起動する。**PRのブランチ（現在の HEAD）のコードが Metro から配信されていること**を前提にする
   - 起動に失敗し、mobile-local-verification の落とし穴の表で解消できなければ、省略して理由を報告する（エラー内容の要約を添える）
3. 手順1で検出したファイルから、変更の影響を受ける画面と状態を洗い出し、画面を操作して確認する
   - ルートへは `ui.sh open <ルート>` か画面操作でたどる。画面カタログ（`ui.sh open dev-screens`）も使える
   - 変更の要点が伝わる状態（通常表示に加えて、変更した空表示・エラー表示・ダイアログなど）を撮る
4. スクリーンショットを `<task-root>/screenshots/` に、連番と内容が分かる名前で保存する

   ```bash
   bash scripts/mobile-tools/ui.sh screenshot <task-root>/screenshots/01-sanpo-map-list.png
   ```

5. 撮った画像はすべて Read で開いて確認する
   - 意図した画面・状態が写っているか（開発メニューや Expo の歯車・ログオーバーレイが重なっていないか）
   - トークン・メールアドレス・実在の位置情報など、PRに載せるべきでない情報が写っていないか（写っていれば撮り直す）

枚数は変更の要点が分かる範囲に絞る（目安は 1 画面あたり 1〜3 枚、合計 10 枚程度まで。`--attach` は 1 回 50 ファイルまで）。

### 4. PRにコメントとして添付する

PR本文は後続の手順（task-workflow の「知識の収穫」追記など）で編集されるため、本文ではなく**コメント**に添付する。

本文を `<task-root>/pr-verification.md` に書く:

```markdown
## 動作確認（Android エミュレータ）

- 対象コミット: <git rev-parse --short HEAD>
- 環境: <AVD名> / development build / backend: <実API | MAPS_MODE=fake | SKIP_BACKEND>
- 確認した変更: <手順1で検出した画面・コンポーネントの要約>

| # | 確認内容 | 結果 |
|---|---|---|
| 1 | <操作と期待値> | OK / NG（NG なら内容） |

<確認できなかった操作・状態があれば、その理由>
```

```bash
gh pr comment <PR番号> \
  --body-file <task-root の絶対パス>/pr-verification.md \
  --attach '<task-root の絶対パス>/screenshots/01-sanpo-map-list.png#地図一覧: 通常表示' \
  --attach '<task-root の絶対パス>/screenshots/02-sanpo-map-list-empty.png#地図一覧: 空表示'
```

- 本文から画像を参照しなくてよい。添付した画像は alt テキスト（`#` の後ろ）付きでコメント末尾に追加される
- パスは**絶対パス**で渡す（`gh` がサンドボックス外で動く場合も同じファイルを指すため）
- `gh` が非ゼロ終了しても、コメントが作成済みの場合がある（`gh pr create` / `gh pr edit` のヘルプには
  「一部の添付だけ失敗しても成功分で作成・更新して非ゼロ終了する」とある。`gh pr comment` のヘルプには記載が無い）。
  そのまま再実行せず、まず `gh pr view <PR番号> --comments` でコメントの有無と添付された画像を確認する。
  コメントが無ければ1回だけ再実行し、コメントがあれば欠けた画像だけを別コメントで1回だけ再添付する。それでも失敗した分は報告する
- 動作確認で NG（不具合）を見つけた場合も結果はそのまま記録して添付し、不具合の内容を呼び出し元へ報告する

### 5. 報告する

呼び出し元（最終的にはユーザー）へ次のいずれかを報告する。

- 添付した: コメントの URL、添付した枚数、確認結果（NG があればその内容）
- 対象外: 画面変更なし
- 省略した: 省略した手順と理由（例: `adb が利用できないため省略`、`gh 2.40.0 が --attach 非対応のため省略`）

呼び出し元に `<task-root>/handover-notes.md` がある場合は、省略・NG・確認できなかった操作を追記する。
スクリーンショットと `pr-verification.md` は `<task-root>` 配下に置くので、PRへのアップロード後は
task-workflow の完了処理（knowledge-harvest）で `<task-root>` とともに削除されてよい。

エミュレータ・Metro・backend は起動したままにしてよい（停止方法は mobile-local-verification のステップ4）。

## 関連

- [mobile-local-verification](../mobile-local-verification/SKILL.md) — エミュレータ起動から画面操作・スクリーンショットまでの手順と落とし穴
- [task-workflow](../task-workflow/SKILL.md) — PR作成（手順9）の直後にこのスキルを呼ぶ
