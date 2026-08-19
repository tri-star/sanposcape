---
name: sanposcape_project
description: Plane上のSanposcapeプロジェクトの識別子・IDと立ち上げ計画（Module/WorkItem）の構成
metadata:
  type: project
---

Plane上のプロジェクト「Sanposcape」（散歩支援アプリ）の情報。

- project identifier: `SS`
- project_id: `691f5939-9065-4141-aa69-6b43b2750080`
- workspace_id: `2336fce3-9046-4d35-861c-88aee339d017`
- ワークスペース内に他にも「Sample(SAM)」「TaskFlow(TSKFL)」「Tasche(TCH)」「ChaseLight(CHASE、Planeデモ)」が存在するため、プロジェクト名だけで曖昧検索せず identifier や id で確定させること。

## 2026-07-19 立ち上げ計画登録

以下の5 Moduleと各4件、計20件のWorkItemを作成済み（`docs/milestones.md` を情報源とした計画）。

- M1: 開発基盤の整備 (module_id: 5b415687-70f1-44d3-9f17-dffa2d66363a)
- M2: デザイン取り込み・UI基盤 (module_id: d850d555-b5f3-41bb-99a9-15088e79885b)
- M3: 認証・アプリ骨格 (module_id: fcafdb25-b598-4883-8388-c0526949fbef)
- M4: 探索・散歩開始 (module_id: 6c344907-195f-45b2-bb9e-09b37e980eaa)
- M5: 散歩記録・履歴 (module_id: a59e23c2-590e-4ae9-81d0-d9f7bc6ae63d)

**Why:** MVPまでの開発ロードマップをPlaneのModule/WorkItemとして可視化し、AI・人間双方が進捗を追えるようにするため。
**How to apply:** 今後この計画に対するタスク追加・進捗更新・状態変更の依頼が来たら、上記のmodule_idを使って `list_module_work_items` 等で現状を確認してから操作する。「散歩ルート」はExpo Router等のroute概念とは別（歩いた道のり）である点に注意（ユーザーからの明示的注意事項）。

## states（project_id: 691f5939-9065-4141-aa69-6b43b2750080）

- Backlog: `fb407070-fc92-4f00-a159-f41b7197af6c` (group=backlog, default)
- Todo: `804c35b6-522f-4c76-b1b2-f38700cf9b3c` (group=unstarted)
- In Progress: `81c7939b-725c-4c0b-bb92-77b24ec48377` (group=started)
- Review: `65b14f74-6fd7-4129-9fab-60908f844572` (group=started)
- Done: `1e596b34-de54-46e1-a9c4-b61c21cc8ef0` (group=completed)
- Cancelled: `2abacd9b-3593-4423-a77f-d0eb64dde66a` (group=cancelled)

**Why:** 状態変更依頼のたびに `list_states` を呼ぶ手間を省くため。
**How to apply:** 「完了にして」「進行中にして」等の依頼が来たら、まず上記IDが現行と一致するか `list_states` で軽く確認し、変わっていなければ直接 `update_work_item(state=...)` に使う。2026-07-20時点でM1配下の全4件が初期状態Backlogだった点に注意（新規作成タスクはTodoではなくBacklogがデフォルト）。

## その他の構成（2026-07-20確認）

- `work_item_types` 機能はこのプロジェクトで**無効**（`get_features` → `work_item_types: false`）。`list_work_item_types` を呼ぶと HTTP 402 Payment Required が返る。Epic等のtype機能はワークスペースのプランで使えないため、typeを使う依頼が来たら「プラン都合で使えない」旨を案内する。全WorkItemの type/type_id は null。
- ラベル（Label）は0件（未整備）。
- priorityは全WorkItemが `none` のまま未設定。Plane標準の固定値は `urgent/high/medium/low/none`（プロジェクト固有のカスタム値ではない）。
- モジュール別WorkItem件数（2026-07-21時点、全25件）: M1=5件（SS-2,3,4,5,22）, M2=8件（SS-1,6,7,8,9,23,24,25）, M3=4件（SS-10〜13）, M4=4件（SS-14〜17）, M5=4件（SS-18〜21）。SS-1はM2所属でState=Review、SS-6はM2所属でState=Cancelled。SS-23〜25はSS-1の実機確認で見つかった残課題（Unistyles×Reanimated非互換／ロゴ・イラスト実アセット差し替え／DS軽微差異）としてBacklogで追加。
- **画面実装タスクの割り振り方針**: 横断的なUI基盤・共通コンポーネント・静的画面実装はM2、機能固有の画面（認証系→M3、探索/地図/散歩開始系→M4、記録/履歴系→M5）はそれぞれの機能モジュールに割り当てるのが一貫性がある。

## 2026-07-23確認: SS-1完了・ADR-005によるUnistyles撤去とSS-23の陳腐化リスク

- SS-1（PR #3 `feat/ss-1-design-import-stylesheet` マージ済み）は本日付でState=Doneに更新済み（更新日時2026-07-23T08:53、対応時点で既にDone化されており追加のupdate_work_itemは不要だった）。
- リポジトリ確認の結果、`packages/mobile/src/components/ui/` 配下に badge/bottom-sheet/button/card/checkbox/dialog/icon/icon-button/input/map-pin/progress-bar/stat-block/switch/tab-bar/tabs/tag/toast が既に実装済み（SS-7の対象範囲がSS-1のPRでほぼ完了している）。ただしTextコンポーネント単体は未確認（見当たらず）。`packages/mobile/app/` はまだ `_layout.tsx` と `index.tsx` のみでMVP画面・ルーティングは未着手（SS-8は未着手）。
- **重要**: `packages/mobile/adr/ADR-005-styling-without-unistyles.md`（2026-07-22採用）により react-native-unistyles は**完全に撤去**され、RN標準StyleSheet + テーマContext(`src/theme/makeStyles.ts`等)に置き換わった。現行コードに`unistyles`/`useUnistyles`の参照はゼロ（`git grep`で確認）。
- この結果、SS-23「mobile: Unistyles × Reanimated の非互換を根本解決する」は**問題の前提（Unistyles使用）自体が消滅しており事実上陳腐化している可能性が高い**。SS-23/SS-24の本文は、破棄されたブランチ `feat/ss-1-design-tokens`（Unistylesベースの別実装、同一目的の別ADR-005文書を含む）を情報源に書かれた可能性がある。特にSS-24が前提とする`IllustrationSlot`コンポーネントは現行mainには存在しない（`feat/ss-1-design-tokens`ブランチのコミット3c3b5acのみに存在、mainの祖先ではない）。
- **How to apply**: 今後SS-23/SS-24を扱う際は、まず現行コードで前提が今も成り立つか（Unistyles使用の有無、IllustrationSlotの実在）を確認すること。ユーザーに「ADR-005によりSS-23は陳腐化の可能性がある」「SS-24の本文はUnistyles版ブランチの記述を引き継いでいる可能性がある」と伝え、内容の見直し（Cancelled化や本文修正）を提案するのが望ましい。SS-25（DSとの軽微差異）はスタイリング方式に依存しない内容なので陳腐化の懸念は無い。

## 2026-07-25確認: トリアージ時点のState別内訳とSS-26〜28の新規発見

- 全28件（前回2026-07-21確認時は25件）。State別: Review=1（SS-8のみ）、In Progress=0、Todo=0（未使用のstate）、Backlog=21、Done=5（SS-1〜5）、Cancelled=1（SS-6）。
- **SS-26/27/28が新規に追加されていた**（いずれもBacklog・優先度low・5モジュールのどれにも未所属）: SS-26「spacingトークンに無い10pxが5ファイルに複製」(30047c93-bb5e-41b7-afb4-35d703e0cac0)、SS-27「BottomSheetのスクリムがシートと一緒にせり上がる」(9bb76f1c-dfe6-469d-8f34-1af023f40647)、SS-28「Badgeのトーン別配色のコントラスト比を検証」(d1f6922d-6774-40c2-8ddf-e86d6a82c966)。SS-1系のPRレビューで見つかった軽微な改善項目と推測される。
- SS-8（M2「MVP主要画面の静的実装・ルーティング配線」）はState=ReviewでPR #4のリンク登録済み（`https://github.com/tri-star/sanposcape/pull/4`）、コメント0件。ブランチ`feat/ss-8-mvp-screens`の最新コミット（散歩サマリ画面のelapsedSec/stepsクラッシュ修正）はこのPR #4に対応するフォローアップ修正。
- **2026-07-25 01:49追記**: GitHub側確認でPR #4は2026-07-24T16:45:11Z（JST 01:45）マージ済み、フォローアップ修正コミット(1a7922a)もマージ時刻より前でPR #4に含まれると判明したため、SS-8をDone（`1e596b34-de54-46e1-a9c4-b61c21cc8ef0`）に更新済み。以後M2の残BacklogタスクはSs-7/SS-9/SS-23〜25のみで、Review/In Progressは0件に戻った。
- **How to apply**: 今後のトリアージ依頼では、モジュール未所属のBacklogタスクが存在しうる点に注意（`list_module_work_items`を5モジュール分呼ぶだけでは全件を捕捉できない。必ず`list_work_items`の総数と突き合わせること）。Review状態のPRがマージ済みと判明した場合はDone化して報告する運用（task-triageルール）。

## 2026-07-25確認: 「関連付け(relates to)」等のカスタムリレーションは402で利用不可

- `list_work_item_relation_definitions` はこのワークスペースで **HTTP 402 Payment Required** を返す（`list_work_item_types` と同じプラン制約）。カスタムリレーション定義（「関連する」等）は取得も利用も不可。
- `create_work_item_relation` の `relation_type` に組み込み値以外（例: `relates_to`）を渡すとツール側バリデーションで拒否される。使える`relation_type`は `blocking / blocked_by / start_before / start_after / finish_before / finish_after` の6種類のみで、いずれも「関連する(relates to)」の意味には合わない。
- **How to apply**: 「SS-XXと関連付けて」等の依頼が来ても、本プロジェクトでは緩い関連付け（relates to）を表現する手段がない。依存関係が明確な場合のみ`blocking`/`blocked_by`等の6種を検討し、それ以外は本文中に関連課題番号を明記する運用で代替する（実際にSS-29ではSS-9/SS-4/SS-12/SS-14/SS-18への言及を本文に記載する形にした）。

## 2026-07-25追加: SS-29「data/スタブ→Orval生成MSWモック移行」をM1に追加

- SS-29（work_item_id: `888431fa-1105-4cc6-ba8a-c8bfdba2740b`）を新規作成し、M1「開発基盤の整備」(`5b415687-70f1-44d3-9f17-dffa2d66363a`)に追加、State=Backlog。SS-9/SS-4/SS-12/SS-14/SS-18への言及を本文に含む横断的なテスト基盤整備タスク。
- **Why**: 手書きスタブ(SS-9)からOrval生成MSWモックへの移行が各機能課題に埋もれるリスクを避けるため独立課題として起票（ユーザー指示）。

## 2026-07-25追加: SS-30/SS-31（doc-maintainer発見のドキュメント乖離）をM1に追加

- SS-30「docs: ADR-005(スタイリング方針)決定後もUnistyles前提の記述が全面的に残存している」(work_item_id: `39795435-1af8-46c5-bf41-df22ded042f5`) と SS-31「docs: ローカル環境構築のドキュメントリンクが古い設計メモを指している」(work_item_id: `cdb487a7-5e06-4ca3-b5c7-4855d0b95575`) を新規作成し、いずれもM1「開発基盤の整備」に追加、State=Backlog。
- **Why**: SS-9のドキュメント整合性チェック（doc-maintainerエージェント）で発見された、SS-9の変更範囲外だが放置すべきでない既存の乖離（README.md/docs/milestones.md等のUnistyles残存記述、local-env-design.mdへの古いリンク）を独立課題として起票（ユーザー指示）。
- モジュール別件数の更新: M1は本追加でSS-2,3,4,5,22,29,30,31の8件になった（2026-07-25 02:57時点のSS-29追加に続く追加）。

## 2026-07-25確認: PR URLの記録先はカスタムプロパティではなく標準Link機能

- `list_work_item_properties(project_id=...)` は空配列を返す（work_item_types機能が無効なプロジェクトのため、URL型等のカスタムプロパティは未整備・作成不可の可能性が高い）。
- PRのURLなど外部リンクを記録したい場合は、カスタムプロパティではなく **`create_work_item_link` / `list_work_item_links`**（work itemの標準Link機能）を使うこと。SS-8にPR #4のURLをこの方法で登録済み（link_id: `36999d74-c648-4724-a180-f0ec793bd32e`）。
- **How to apply**: 今後「PRのURLを記録して」等の依頼が来たら、まずカスタムプロパティを探すより先に標準Link機能の利用を検討する（本プロジェクトではこちらが実質唯一の選択肢）。

## 2026-07-25確認: Milestone機能は0件・「マイルストーン」呼称はModuleのM1〜M5を指す

- `list_milestones(project_id)` は空配列を返す。本プロジェクトではPlaneの「Milestone」機能は使われておらず、ユーザーが「マイルストーンM-2」等と呼ぶ場合は実体としてはModule「M2: デザイン取り込み・UI基盤」等を指している。
- **How to apply**: 「マイルストーンM-N」の依頼が来たら、まず`list_milestones`が空であることを確認しつつ、`list_modules`で名称が近い「M-N: ...」のModuleを提示する（今回はM-2→module_id `d850d555-b5f3-41bb-99a9-15088e79885b` で正しく解決できた）。
- 2026-07-25時点でのM2内訳（再確認）: SS-1=Done, SS-6=Cancelled, SS-7=Backlog, SS-8=Done, SS-9=Review, SS-23=**Cancelled**(前回メモの「陳腐化リスク」懸念は解消済み・キャンセル済みだった), SS-24=Backlog, SS-25=Backlog。つまりM2のBacklogは SS-7 / SS-24 / SS-25 の3件のみ。

## 2026-07-25追加: SS-9をReview化・PR #5リンク登録

- SS-9（work_item_id: `aa81b4f0-686b-44e0-92e4-8a86b1039ff3`）をIn Progress→Review（`65b14f74-6fd7-4129-9fab-60908f844572`）に更新し、`create_work_item_link`でPR #5（`https://github.com/tri-star/sanposcape/pull/5`）を登録（link_id: `0e1943fa-08de-4cd2-add2-62dd80313a84`）。`list_work_item_properties`は再確認時も空配列で、SS-8の時と同じく標準Link機能が唯一の選択肢だった。

## 2026-07-25追加: SS-7・SS-25をDoneに更新（実質完了判断）

- SS-7（work_item_id: `e4ee3cbe-28b4-46e0-9599-0f732528541c`）: `src/components/ui/`に必要なプリミティブが実装済みで、DS一覧のAvatar/Select/Radio/TooltipはMVPスコープ外のため実質完了と判断しDone化。
- SS-25（work_item_id: `c86a7219-5320-40ea-9d9f-4cd398aadaba`）: 本文に記載の3点の差異（Toast文字太さ/StatBlock prop名/IconButton active配色）はSS-1レビュー対応コミット(4c6a538, d131020, 1b3871f)で解消済みと確認しDone化。
- **Why**: どちらもユーザー確認済みの背景説明があり、コメント（`create_work_item_comment`）にも同内容を記録済み。
- **How to apply**: これによりM2「デザイン取り込み・UI基盤」の残Backlogは **SS-24のみ**（SS-1,7,8,9=Done, SS-6,23=Cancelled, SS-25=Done）。update_work_item直後のレスポンスは`state`がUUID更新済みでも`state_group`が旧グループのまま返ることがある（キャッシュ遅延）。確証が必要な場合は`retrieve_work_item(expand="state")`で再取得すると正しい`state_group`が返る。

## 2026-07-25追加: SS-10をIn Progressに更新（認証方式ADR確定）

- SS-10（work_item_id: `3bc2b4d4-2a17-46a1-9611-d3f2517372e2`、M3「認証・アプリ骨格」所属）をBacklog→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に更新し、認証方式確定の設計サマリをコメントに記録。
- 決定内容: IdPはGoogle直結（Auth0不採用）、モバイルはpublic clientとしてGoogle ID token取得→backendで自前セッショントークン（短命access JWT + opaque refresh token）に交換。スタブは`real/dev/mock`の3モードで継ぎ目はトークン発行元のみ。ADRは`docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md`。作業ブランチは`feat/ss-10-auth-real-stub`、PRはbackend先行→mobileの2本に分割方針。
- **Why**: 設計議論の結論を課題側にも残し、進捗状況（着手中）を可視化するため（ユーザー指示）。

## 2026-07-25追加: SS-10をReview化・PR #7(backend側)リンク登録

- SS-10（work_item_id: `3bc2b4d4-2a17-46a1-9611-d3f2517372e2`）をIn Progress→Review（`65b14f74-6fd7-4129-9fab-60908f844572`）に更新し、`create_work_item_link`でPR #7（`https://github.com/tri-star/sanposcape/pull/7`、link_id: `cbe87556-b289-4f2a-9ed0-be75d13f93b2`）を登録。コメントにスコープ（backendのみ、mobileは別PRで後続対応）・ADR-002概要・実装内容・レビュー対応結果（Security High 1件含む）を記録済み。
- **Why**: SS-10はbackend/mobileの2PR分割方針（前回メモ参照）。backend側PRが先行してレビュー待ちに入ったための状態更新（ユーザー指示、Doneにはしない）。
- **How to apply**: mobile側PRが出た際は、同じSS-10に追加のリンク・コメントを積み増す運用になる見込み（別work_itemを立てる指示は出ていない）。両PRがマージされた時点でDone化を検討する。

## 2026-07-26確認: SS-10 backend PR #7マージ済みだがPlane未更新／SS-32を新規発見

- git log確認でPR #7は既にmainへマージ済み（コミット`7cd8272`）と判明したが、SS-10のPlane上の状態はReviewのまま・コメントにもmobile側PRへの言及なし（`list_work_item_comments`で確認）。**mobile側は未着手**（着手コメント・PRリンクとも無し）。ユーザー指示により状態更新（Done化等）は保留し、現状報告のみ実施。
- **SS-32「backend: Dockerコンテナを非rootのapp_userで実行する」**（work_item_id: `4676b762-23d3-4d25-a2d1-6dae2c824784`）を新規発見。State=In Progress、モジュール未所属、priority=none。created_at 2026-07-25T16:10、updated_at 2026-07-26T00:17と直近更新あり。過去のメモリに記録が無く、本エージェント経由でない（ユーザー自身か別経路での）作成・着手と推測される。
- 2026-07-26時点のstate_group="started"（In Progress+Review）は SS-32とSS-10の2件のみ。Backlog総数18件（`list_work_items(pql='state_group = "backlog"')`で確認、total_count=18）。
- M3「認証・アプリ骨格」のBacklog残り3件はSS-11（mobile サインイン/サインアップ画面）、SS-12（backend ユーザーモデル・認証API）、SS-13（認証状態と探索ロジックの分離）で、SS-10 backend完了を受けた次の着手候補。
- **How to apply**: 今後のトリアージでは、SS-32のようにモジュール未所属かつ本エージェント経由でない新規タスクが増える可能性があるため、`list_work_items`の総数を都度確認し、モジュール別集計だけに頼らないこと（既存メモの注意点を再確認）。

## 2026-07-30確認: SS-14/SS-15（M4）が共にReview化・PR #14リンク登録済み

- SS-14「backend: Places/Routesプロキシ・キャッシュ層」(work_item_id: `bc6398ac-ac08-4716-bcb6-71f2daeadc08`)、SS-15「mobile: 地図表示・往復範囲指定UI・候補表示」(work_item_id: `ed2ed727-bb29-41d3-887e-05c968343871`)がいずれもState=Review。SS-15にはPR #14（`https://github.com/tri-star/sanposcape/pull/14`、link_id `647a7d53-adac-4929-ba2c-d6cb8e4ae64f`）がリンク済み、コメント0件、親子関係・リレーションなし。
- 本エージェント経由の更新記録がないため、ユーザー自身か別経路での更新と推測。M4の残Backlogは本確認時点でSS-16・SS-17のみの可能性が高い（要再確認）。

## 2026-07-30追加: SS-15にPR #15を追加リンク・並行実装比較コメントを記録

- SS-15（work_item_id: `ed2ed727-bb29-41d3-887e-05c968343871`）は本作業時点で既にState=Review（更新不要）。既存のPR #14リンク（link_id `647a7d53-adac-4929-ba2c-d6cb8e4ae64f`）は削除せず残したまま、`create_work_item_link`でPR #15（`https://github.com/tri-star/sanposcape/pull/15`、branch: tri-star/ss-15-claude、link_id `3b0b08b1-79ed-4876-9137-5ee55a9ad97b`）を追加登録。
- コメント（comment_id `999438e3-cc11-4f2c-ba39-96f7e33fe953`）で、SS-15にPR #14（branch: feat/ss-15-google-map）とPR #15の2つの独立した並行実装が存在すること、比較検討の上どちらか一方をクローズする必要があることを記録。
- **Why**: ユーザー指示による並行実装比較のため、同一work itemに複数PRリンクを併存させる運用（ユーザー指示）。
- **How to apply**: 今後SS-15を扱う際は、まず`list_work_item_links`でPR #14/#15双方の存在を確認してから作業すること。どちらかがクローズされた後は、残った方のPRリンクのみを残す/コメントで結果を追記する運用になる見込み。

## 2026-08-01追加: SS-16をIn Progress→Review化・PR #16リンク登録

- SS-16「mobile: スポット選択→散歩ルート提示→散歩開始・散歩中表示」(work_item_id: `0f60a14d-33d9-46f1-88c4-ea23991ba11f`、M4所属)をIn Progress→Review（`65b14f74-6fd7-4129-9fab-60908f844572`）に更新。`list_work_item_properties`は空配列（変わらず）、`list_work_item_links`も0件だったため、`create_work_item_link`でPR #16（`https://github.com/tri-star/sanposcape/pull/16`、link_id: `413975ad-8ea9-4193-9612-a55a99d04abf`）を新規登録（コメントではなく標準Link機能を優先する既存方針を継続）。

## 2026-08-01追加: トリアージ結果 — SS-16/SS-32とも既にDone、Review/In Progressは0件

- SS-16（`0f60a14d-33d9-46f1-88c4-ea23991ba11f`）は本トリアージ開始時点で既にState=Done（completed_at 2026-08-01T03:57:58）だった。直前メモ（同日早い時刻）の「Review化・PR #16リンク登録」の後、別セッションでDone化済みだったと推測される。追加のupdate_work_itemは不要だった。
- **SS-32「backend: Dockerコンテナを非rootのapp_userで実行する」も既にDone**（`4676b762-23d3-4d25-a2d1-6dae2c824784`、completed_at 2026-07-26T11:04:50、モジュール未所属のまま）。2026-07-26メモの「In Progressのまま要再確認」は解消済み——本トリアージ時点でIn Progress/Reviewの2状態はどちらも0件（`list_work_items(pql='state = "<state_id>"')`で確認）。
- 全35件のState内訳（2026-08-01時点）: Backlog=15, Done=17, Cancelled=3, Review=0, In Progress=0。
- Backlog内訳: M1=SS-22,29,30,31, M3=SS-13, M4=SS-33(モジュール未所属)/34/35, M5=SS-18,19,20,21, モジュール未所属=SS-26,27,28,33。
- **M4「探索・散歩開始」はコア4件（SS-14,15,16,17）が全てDone**。残るSS-33/34/35はSS-16の後続改善タスクで、SS-33は本文に明記の通り「MVP（M5完了）のブロッカーではない」。
- **M5「散歩記録・履歴」はSS-18/19/20/21の4件が全てBacklogのまま未着手** — MVP完成に向けて残る最後の主要モジュール。SS-18（backend: Walkモデル・ルート保存・履歴取得API）が他2件（SS-19 mobile終了処理、SS-20 履歴画面）の土台となる。
- **How to apply**: 次回トリアージでは、まずReview/In Progressの2状態を`list_work_items(pql='state = "<id>"')`で確認するのが確実（過去のメモリの「要再確認」項目は都度この方法で解消できる）。M5が未着手のままだとMVP完成に至らないため、次の着手優先度はM5 > M4残タスク（SS-34/35）> その他、という認識で良い。

## 2026-08-01確認: mcp_tooling_changes.md（issue系ツール名・403エラー）は本セッションで再現せず

- 同日過去のセッションで報告された「`list_work_items`等が使えず`get_issue_using_readable_identifier`等のissue系ツールに置き換わっていた／全ツール呼び出しがHTTP 403」という状況は、本セッション（2026-08-01、時刻が進んだ後）では**再現しなかった**。`retrieve_work_item`/`list_work_items`等の従来のwork_item系ツールが正常に動作した。
- **How to apply**: 一時的な認証エラーだった可能性が高い。`mcp_tooling_changes.md`の内容は鵜呑みにせず、まず通常通り`list_work_items`等を試し、実際に失敗した場合のみ代替手段を検討すること。

## 2026-08-01追加: SS-18をIn Progressに更新（backend実装着手）

- SS-18「backend: 散歩(Walk)モデル・散歩ルート保存・履歴取得API（ユーザー紐付け・認可）」(work_item_id: `dfde4093-08cb-45aa-bae9-bb3aa2ddab6d`、M5所属)をBacklog→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に更新。M5の4件(SS-18〜21)のうち最初の着手。
- **Why**: M5「散歩記録・履歴」はMVP完成に向けて残る最後の主要モジュール（2026-08-01トリアージメモ参照）。SS-18は他2件(SS-19/20)の土台となるため優先着手（ユーザー指示）。

## 2026-08-02追加: SS-19をIn Progressに更新（mobile側着手）

- SS-19「mobile: 散歩終了処理・散歩ルート保存」(work_item_id: `e91c7a28-a58e-4ea3-898c-5c804bf0fdcc`、M5所属)をBacklog→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に更新。SS-18(backend: Walkモデル・保存API、2026-08-01にIn Progress化)に続くM5の2件目の着手。
- update_work_item直後のレスポンスは`state`は新IDになっているが`state_group`は旧グループ("backlog")のまま返るキャッシュ遅延を再確認（既知の挙動、SS-7/SS-25メモ参照）。

## 2026-08-02追加: SS-19をReview化・PR #20登録、フォローアップSS-36を新規作成

- SS-19（work_item_id: `e91c7a28-a58e-4ea3-898c-5c804bf0fdcc`）をIn Progress→Review（`65b14f74-6fd7-4129-9fab-60908f844572`）に更新し、`create_work_item_link`でPR #20（`https://github.com/tri-star/sanposcape/pull/20`、link_id: `9af9b0c0-4204-44f0-9753-e01f3c72240b`）を登録。`list_work_item_properties`は今回も空配列で、標準Link機能が唯一の選択肢という既存方針を継続。
- SS-36「mobile: 進行中の散歩と未送信の散歩記録をローカル永続化して復帰できるようにする」(work_item_id: `c9d51cbc-bb59-4e67-b773-297263845245`)を新規作成、M5「散歩記録・履歴」に追加、State=Backlog。SS-19からのフォローアップ（ADR-003/ADR-008のスコープ外事項）。
- `list_work_item_relation_definitions`は本日も**HTTP 402再現**（`relation_definitions_402.md`の内容は引き続き有効）。SS-36↔SS-19の関連は本文中の「派生元: SS-19」記載で代替。

## 2026-08-02追加: SS-19フォローアップ3件(SS-37/38/39)を新規作成・SS-36に追記

- SS-36（`c9d51cbc-bb59-4e67-b773-297263845245`）に「SS-19のsessionCleanup.ts追加」を踏まえた追記セクションを追加（永続化データもサインアウト時の後始末対象に含める必要がある旨）。
- SS-37「mobile: 散歩保存が unauthorized で失敗した際にサインイン画面へ導く CTA を追加する」(`99bf40df-6398-4e03-b98e-fc7409262ba2`)、SS-38「backend: /walks エンドポイントにレート制限を追加する」(`6346228e-537a-43f5-b1f8-5c0829a7b604`、labelは`ready`)、SS-39「backend: 冪等キー衝突時に内容差分を検知してサーバーログに警告を出す」(`1d575b61-fa24-4952-a41d-f9e52d9ecf9c`、labelは`ready`)を新規作成。いずれもM5「散歩記録・履歴」に追加、State=Backlog、priority=low。
- ラベル`ready`のlabel_id: `c55d541f-4c4b-4516-8832-ff151225f4e9`（プロジェクトに既存）。
- `list_work_item_relation_definitions`は本日も**HTTP 402再現**（2回目の確認、`relation_definitions_402.md`参照）。SS-19との関連は全て本文中の「派生元: SS-19 / PR: ...」記載で代替（実際のrelates_to設定は不可のため実施せず、ユーザーに報告）。

## 2026-08-02追加: SS-20をIn Progressに更新（mobile側着手）

- SS-20「mobile: 散歩履歴一覧・詳細画面」(work_item_id: `c321f2f2-48ea-4a88-ae07-072302ef30c8`、M5所属)をBacklog→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に更新。SS-18(In Progress)・SS-19(Review)に続くM5の3件目の着手。update_work_item直後のレスポンスは`state`は新IDだが`state_group`は`backlog`のままの既知キャッシュ遅延を再確認。

## 2026-08-02追加: SS-20をReview化・PR #21登録

- SS-20（work_item_id: `c321f2f2-48ea-4a88-ae07-072302ef30c8`）をIn Progress→Review（`65b14f74-6fd7-4129-9fab-60908f844572`）に更新し、`create_work_item_link`でPR #21（`https://github.com/tri-star/sanposcape/pull/21`、link_id: `5ae93e6c-acbc-417d-840d-1dc648c2dfab`）を登録。`list_work_item_properties`は今回も空配列で、標準Link機能が唯一の選択肢という既存方針を継続。M5の4件中SS-18(In Progress)・SS-19(Review)・SS-20(Review)まで着手、残るSS-21が未着手。

## 2026-08-04追加: SS-44「backend: E2E用fake Maps provider(MAPS_MODE)」をM5に追加

- SS-44（work_item_id: `71feef70-803f-40e1-b61a-0bdf976177c0`）を新規作成、M5「散歩記録・履歴」に追加、State=Backlog、priority=medium。SS-21（MVP主要フローのE2E・Maestro）のブロッカーとして起票（ユーザー指示のMarkdown本文をそのままHTML変換して登録）。
- `create_work_item`のURLはPlaneのweb UIパス`https://app.plane.so/sanposcape/projects/<project_id>/issues/<work_item_id>`形式で報告している（workspace slugは`sanposcape`と推測、実際のURL形式は未検証——ワークスペースslugを確実に知りたい場合は今後`retrieve_project`等のレスポンスやユーザー提示のURLで確認すること）。

## 2026-08-04追加: SS-21をIn Progressに、SS-20をDoneに更新

- SS-21「MVP主要フローのE2E（Maestro）・仕上げ」(work_item_id: `9a72fd30-cb14-4072-be71-d127ded98b5c`、M5所属)をTodo→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に更新。実装着手のため（ユーザー指示）。start_date=2026-08-05, target_date=2026-08-07が既に設定済みだった。
- SS-20「mobile: 散歩履歴一覧・詳細画面」(work_item_id: `c321f2f2-48ea-4a88-ae07-072302ef30c8`)をReview→Done（`1e596b34-de54-46e1-a9c4-b61c21cc8ef0`）に更新。PR #21マージ済み（`gh pr view`でMERGED確認済みとユーザーから報告）を根拠にユーザー指示で実施。
- これによりM5「散歩記録・履歴」4件(SS-18〜21)の状況: SS-18=In Progress, SS-19=Review, SS-20=Done, SS-21=In Progress。M5の未着手はゼロになった。
- SS-21のレスポンスで`state`は新IDに更新されているが`state_group`が旧グループ("unstarted")のまま返るキャッシュ遅延を再確認（既知の挙動、繰り返しなので今後は都度断りを入れず簡潔に触れる程度でよい）。

## 2026-08-04追加: SS-45「mobile: 認証ガードの無いルートをディープリンクから直接開ける」をM3に追加

- SS-45（work_item_id: `1b140724-8e63-44fe-a2a4-682f5dfd51db`）を新規作成、State=Backlog、priority=low。SS-21のセキュリティレビュー（mobile-security-reviewer）で発見された既存ギャップ、対応はSS-13スコープに委ねる方針。
- 「SS-13と同じモジュールがあれば」という指示だったため、まず`retrieve_work_item_by_identifier`でSS-13の所属を確認（M3「認証・アプリ骨格」、module_id `fcafdb25-b598-4883-8388-c0526949fbef`）してから同モジュールに追加した。

## 2026-08-04追加: SS-21をReview化・PR #22リンク登録

- SS-21（work_item_id: `9a72fd30-cb14-4072-be71-d127ded98b5c`）をIn Progress→Review（`65b14f74-6fd7-4129-9fab-60908f844572`）に更新し、`create_work_item_link`でPR #22（`https://github.com/tri-star/sanposcape/pull/22`、link_id: `a233a55d-2d49-4120-a439-163eb3f085be`）を登録。`list_work_item_properties`は今回も空配列で、標準Link機能が唯一の選択肢という既存方針を継続。
- M5「散歩記録・履歴」4件(SS-18〜21)の状況: SS-18=In Progress, SS-19=Review, SS-20=Done, SS-21=Review。

## 2026-08-01確認: 作成時の命名・Module 割り当て方針

- WorkItem は対象領域を明示する `mobile:` / `backend:` 接頭辞を用い、本文は「背景」「ゴール」「技術的な検討事項」「前提」「位置づけ」「スコープ外」の見出しで記述する。
- M4/M5 などのマイルストーンは Plane の Module で表現する。MVP を直接ブロックしない課題（例: SS-33）は Module を未設定とすることがあり、設定漏れとは限らない。
- 通常の SS 作業では既知の project/state ID を利用できるが、長期間隔が空いた場合や API が失敗した場合は、状態とプロジェクトを再取得して確認する。

## 2026-08-05追加: SS-34をIn Progressに更新（mobile側着手）

- SS-34「mobile: 散歩開始前に探索・記録へ戻れる導線を追加」(work_item_id: `ad15c9d5-3076-4f59-90bb-47faefb86673`、M4所属)をTodo→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に更新。SS-16の後続タスク。start_date=2026-08-10, target_date=2026-08-11が既に設定済みだった。

## 2026-08-08追加: SS-44をReview化・PR #25リンク登録

- SS-44（work_item_id: `71feef70-803f-40e1-b61a-0bdf976177c0`、M5所属）をIn Progress→Review（`65b14f74-6fd7-4129-9fab-60908f844572`）に更新し、`create_work_item_link`でPR #25（`https://github.com/tri-star/sanposcape/pull/25`、link_id: `5ed256cb-8047-40d3-8372-add546424ed5`）を登録。`list_work_item_properties`は今回も空配列で、標準Link機能が唯一の選択肢という既存方針を継続。
- コメント（comment_id: `e5988133-0b85-4a7a-ba25-6763ad13204a`）に実装内容・チケット記載との差分・申し送り事項を記録。**申し送り要点**: `.github/workflows/mobile-e2e.yml`の`--exclude-tags=maps-required`はSS-44では未解除（MVPフローが実機/エミュレータで未検証のため）。解除はSS-21または後続issue側の対応が必要——次回SS-21関連のトリアージ時に要確認。

## 2026-08-09追加: SS-42をIn Progressに更新（mobile側着手）

- SS-42「mobile: 記録タブの週/月集計・連続日数・歩数を実装する」(work_item_id: `144b7ef8-9ad0-4181-a99c-9f79c492ad5d`、M5所属)をBacklog→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に更新。SS-20（PR #21）で見送られたフォローアップタスク。

## 2026-08-11追加: SS-35をIn Progressに更新（mobile側着手）

- SS-35「mobile: 散歩開始後の現在地起点ルート再計算を追加」(work_item_id: `568ff048-400a-45d9-8c62-3a10b5c4afec`、M4所属)をTodo→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に更新。SS-16・SS-17の後続タスク。start_date=2026-08-12, target_date=2026-08-14が既に設定済みだった。

## 2026-08-11確認: 5モジュール(M1〜M5)はいずれもstart_date/target_date未設定

- `retrieve_module`で全5モジュール(M1〜M5)を確認したところ、statusはいずれも`"planned"`固定、`start_date`/`target_date`は全てnull（モジュール自体の期間は運用上使われていない）。日程管理はモジュール単位ではなくWorkItem個別のstart_date/target_dateで行われている模様（例: SS-22等一部のTodoタスクには日付設定あり、大半のBacklogタスクは未設定）。
- **How to apply**: 「モジュールの開始日・終了日」を尋ねられたら、全てnullである旨をそのまま報告してよい（取得漏れではない）。日程確認が必要な場合はWorkItem側のstart_date/target_dateを見るよう案内する。

## 2026-08-11追加: SS-35をReview化・PR #28リンク登録

- SS-35（work_item_id: `568ff048-400a-45d9-8c62-3a10b5c4afec`）をIn Progress→Review（`65b14f74-6fd7-4129-9fab-60908f844572`）に更新し、`create_work_item_link`でPR #28（`https://github.com/tri-star/sanposcape/pull/28`、link_id: `6fe7e7f0-a363-48ac-b3b1-547f626127ab`）を登録。`list_work_item_properties`は今回も空配列で、標準Link機能が唯一の選択肢という既存方針を継続。

## 2026-08-11追加: SS-54「CI: MVP主要フロー（maps-required）のE2E常時実行を有効化する」をM5に新規発見（本エージェント経由でない作成）

- SS-54（work_item_id: `b047bc3f-8879-45a6-be08-dc0083a71569`）はState=Todo、priority=medium、M5「散歩記録・履歴」所属、担当者・ラベル・親子・コメントいずれも無し。SS-21（Done）の後続でCIワークフロー(`mobile-e2e.yml`)の`--exclude-tags=maps-required`解除が主目的。SS-44コメントの申し送り（2026-08-08メモ参照）に対応する形の課題と推測される。
- **`list_work_item_relations`は`custom`キーに`relates to`/`duplicate`/`implements`/`implemented by`のラベルを返すようになっていた**（値はいずれも空配列）。ただし`list_work_item_relation_definitions`自体は本日も引き続きHTTP 402（`relation_definitions_402.md`の内容は変わらず有効）。個別work itemの`list_work_item_relations`はエラーにならず定義ラベルの枠だけ見えている状態と判明——実際に`create_work_item_relation`でこれらのカスタムラベルが使えるかは未検証。
- PQLで`parent = "<uuid>"`によるフィルタは`HTTP 400 Filtering on field 'parent' is not allowed`で拒否される。子タスク一覧取得は`pql='childOf("SS-54")'`（識別子形式）を使うこと。
- SS-54は2026-08-11中にTodo→In Progress→Reviewまで進行。PR #29（link_id: `f7620ba9-669e-4e87-a68a-12412bb95cba`）登録、コメント（comment_id: `01febf5f-e663-434a-b549-f60c780eb128`）に実装内容・申し送り事項を記録。申し送り: mvp-walk-flow.yaml/walk-route-recalculate.yamlの通し実行が未確認のままレビュー着手（マージ前に手動ワークフロー起動が必要）。
- PQLで`name icontains "..."`は無効（`title ~ "..."`または`text ~ "..."`を使うこと。`text`はtitle+description対象）。

## 2026-08-11追加: SS-55「ci: Dependabotで依存関係の自動アップデートを導入する」を新規作成

- SS-55（work_item_id: `dff028fd-f26a-41bd-b43a-b3ed9896016a`）をState=Backlog、priority=medium、モジュール未所属で新規作成。SS-54(PR #29)のCI実行で発覚したactions非推奨警告がきっかけ。Dependabot設定（github-actions/uv/npm 3ecosystem、cooldown default-days:2でpnpm-workspace.yamlのminimumReleaseAge方針と統一）が主内容。
- **Why**: ユーザーからの直接依頼。重複確認は`search_work_items`＋`list_work_items(title~/text~)`でSSプロジェクト内に該当なしを確認済み（他プロジェクトTCH/CHASEには類似のDependabot課題が存在するが無関係）。
- **【2026-08-11実装完了に伴う訂正】起票時の本文にあった`cooldown default-days: 2`（pnpm-workspace.yamlのminimumReleaseAge 2日と揃える意図）は、実装では採用されず**3日**になった。詳細は下記「SS-55実装完了」の項を参照。

## 2026-08-11追加: SS-55をIn Progressに更新（実装着手）

- SS-55（work_item_id: `dff028fd-f26a-41bd-b43a-b3ed9896016a`、M1「開発基盤の整備」所属）をTodo→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に更新。実装着手のため（ユーザー指示）。

## 2026-08-11追加: SS-55実装完了・PR #30登録（Review化）

- SS-55（work_item_id: `dff028fd-f26a-41bd-b43a-b3ed9896016a`）をIn Progress→Review（`65b14f74-6fd7-4129-9fab-60908f844572`）に更新し、`create_work_item_link`でPR #30（`https://github.com/tri-star/sanposcape/pull/30`、link_id: `a74c7a7d-e746-42df-9ef0-e0dd52cc3b3a`）を登録。`list_work_item_properties`は今回も空配列で、標準Link機能が唯一の選択肢という既存方針を継続。
- PR #30で`.github/dependabot.yml`を新規追加し、github-actions / uv / npm の3 ecosystemを有効化した。
- **起票時の本文にあった技術的前提のうち2点が、実際のDependabot仕様と食い違っていたため実装では採用しなかった**（起票時メモの該当箇所を参照、本項が訂正内容）:
  - (a) `cooldown: default-days: 2`（pnpm-workspace.yamlのminimumReleaseAge 2日と揃える意図）は採用せず**3日**にした。Dependabotには2026-07-14以降「cooldown未設定でも3日待つ」という既定があり、2日と書くと既定より緩めることになるため。majorのみ`semver-major-days: 7`。
  - (b) `github-actions`のecosystemは**cooldown非対応**（GitHubのoptions referenceのサポート表で`default-days`自体が×）。課題本文では「default-daysのみ対応」としていたが誤り。そのためgithub-actions entryにはcooldownを書いていない。
- npmはmonthly（pnpm-lock.yamlの変更が@expo/fingerprintのハッシュを変え、mainへのpushでmobile-e2e.ymlの約35分のAPKフルビルドを誘発するため）。Expo SDKが固定するパッケージ群（expo* / react* / react-native* / @react-native-community/*）はignoreし`expo install --fix`に委ねる。
- あわせてmobile-ci.ymlのpathsに`pnpm-lock.yaml`を追加した（推移的依存のみの更新ではCIが1つも走らず、Dependabot PRが無検証でマージできる穴があったため）。
- **マージ後にリポジトリ側で確認が必要**: Insights > Dependency graph > DependabotでのGSC設定パース結果、初回PRの量、Dependabot PRでのCI通過。
- **スコープ外として残したもの**: Docker ecosystem（backendのDockerfile / compose.yamlのイメージ）、Dependabot security updatesの有効化。別課題化の候補。
- **How to apply**: 今後Dependabot関連の課題（別ecosystem追加やcooldown調整）を扱う際は、本項の(a)(b)を前提として引き継ぐこと。特に「pnpm-workspace.yamlの日数とDependabotのcooldownを完全一致させる」という単純な発想は誤りになりやすい（Dependabot側の既定値・ecosystem別サポート状況を都度確認する）。

## 2026-08-11追加: SS-29をIn Progressに更新（着手）

- SS-29「mobile: data/スタブから Orval生成MSWモックへの移行と単体テスト整備」(work_item_id: `888431fa-1105-4cc6-ba8a-c8bfdba2740b`、M1所属)をBacklog→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に更新。start_date=2026-08-17/target_date=2026-08-20は既存設定のまま。

## 2026-08-11確認: SS-12/SS-14/SS-18は全てDone

- SS-12(9ce6a916-53b6-4e15-8fdd-bf2d05ced095, M3所属)はcompleted_at 2026-07-26、SS-14(bc6398ac..., M4所属)はcompleted_at 2026-07-31、SS-18(dfde4093..., M5所属)はcompleted_at 2026-08-02でいずれもDone確認済み。SS-18は2026-08-04メモ時点でIn Progressだったが、その後別セッションでDone化されていた。

## 2026-08-11追加: SS-29をReview化・PR #45リンク登録

- SS-29（work_item_id: `888431fa-1105-4cc6-ba8a-c8bfdba2740b`）をIn Progress→Review（`65b14f74-6fd7-4129-9fab-60908f844572`）に更新し、`create_work_item_link`でPR #45（`https://github.com/tri-star/sanposcape/pull/45`、link_id: `ac8097df-305f-4b62-aba0-de8cb9312bd4`）を登録。`list_work_item_properties`は今回も空配列で、標準Link機能が唯一の選択肢という既存方針を継続。

## 2026-08-11追加: スケジュール反映（SS-46/47/50/51/52/53/55）

- SS-55を Todo・start=2026-08-11/target=2026-08-13・M1に追加。SS-47をBacklog→Todo、start=2026-08-11/target=2026-08-13（M1のまま）。SS-50をBacklog→Todo、start=2026-08-24/target=2026-08-26（M3のまま）。SS-46はBacklogのまま、start=2026-09-03/target=2026-09-05（参考日程、M2のまま）。SS-51/52/53（いずれもM5）は状態Todoのまま、start=2026-09-03/target=2026-09-10で統一設定。
- **How to apply**: `manage_module_work_items`でモジュール追加した直後は、その`update_work_item`のレスポンスに`min_module_name`が反映されない（別呼び出しのため）。モジュール反映確認は必ず`retrieve_work_item_by_identifier`等で再取得すること。

## 2026-08-12追加: SS-53をIn Progressに更新（実装着手）

- SS-53「backend: 散歩記録の削除API（DELETE /walks/{walk_id}）を追加する」(work_item_id: `c6d79e92-46c8-4521-a0e6-0ad9cf305788`、M5所属)をTodo→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に更新。start_date=2026-09-03/target_date=2026-09-10は既存設定のまま。SS-42/PR #26のフォローアップ課題。
- その後同日中にReview化・PR #47リンク登録済み（link_id: `08ed8323-72ba-433c-9f85-b3a7a9332dfc`）。

## 2026-08-13追加: SS-53をReview→In Progressに再更新（PR #47レビュー指摘対応）

- SS-53をReview→In Progress（`81c7939b-725c-4c0b-bb92-77b24ec48377`）に再更新し、コメント（comment_id: `7a4017ad-1e42-4936-a456-dd6dd526a415`）に「PR #47へのレビュー指摘対応のための再着手」である旨を記録。PR #47のリンクは既存のまま維持（削除・追加操作なし）。
- **Why**: レビュー指摘を受けた再着手であることを状態変更だけでは残せないため、理由をコメントに明記する運用（Review→In Progress等の“出戻り”系更新では毎回コメントで理由を残すのが望ましい）。

## 2026-08-13追加: SS-53をIn Progress→Reviewに再更新（レビュー指摘対応完了）

- SS-53をIn Progress→Review（`65b14f74-6fd7-4129-9fab-60908f844572`）に再更新し、コメント（comment_id: `b332702d-8863-46eb-8ed0-f006c6377293`）に「PR #47のレビュー指摘対応完了・レビュースレッド2件返信/resolve済み」を記録。PR #47のリンク（link_id: `08ed8323-72ba-433c-9f85-b3a7a9332dfc`）は既存のまま流用（重複登録なし、事前確認のみ実施）。
- **How to apply**: Review→In Progress→Review のような出戻り往復では、都度コメントで理由・完了報告を残す運用を継続する（前回メモと同じ方針）。PRリンクが既に登録済みか毎回`list_work_item_links`で確認してから、無ければ追加・あれば流用する。

## 2026-08-16追加: SS-60をIn Progressに更新(実装着手)

- SS-60「mobile: 散歩履歴を削除するUIを実装」(work_item_id: `a25a601b-a6a2-4f67-98fa-303ff16c1352`、M5所属)をTodo→In Progress(`81c7939b-725c-4c0b-bb92-77b24ec48377`)に更新。SS-53(backend: DELETE /walks/{walk_id})を受けたmobile側削除導線の実装着手。ADR-003のSS-53追補を参照する課題。
