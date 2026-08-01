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

## 2026-08-01確認: 作成時の命名・Module 割り当て方針

- WorkItem は対象領域を明示する `mobile:` / `backend:` 接頭辞を用い、本文は「背景」「ゴール」「技術的な検討事項」「前提」「位置づけ」「スコープ外」の見出しで記述する。
- M4/M5 などのマイルストーンは Plane の Module で表現する。MVP を直接ブロックしない課題（例: SS-33）は Module を未設定とすることがあり、設定漏れとは限らない。
- 通常の SS 作業では既知の project/state ID を利用できるが、長期間隔が空いた場合や API が失敗した場合は、状態とプロジェクトを再取得して確認する。
