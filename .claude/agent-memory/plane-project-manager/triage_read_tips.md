---
name: triage_read_tips
description: トリアージ(読み取り)時の実務Tips。workitem listの巨大出力対策(jq)、relation一覧の取り方、現行ラベルID
metadata:
  type: reference
  scope: durable
---

## 大量取得時の出力上限(2026-09-19確認)

- `workitem list` に `per_page=100` を渡すと description_html 込みで 12万〜30万文字になり、ツール結果が上限超過してファイルに退避される（Todo21件で約31万文字）。
- 退避先ファイルは `jq` で絞ると確実に読める。例: `jq -r '.result.results[] | [("SS-"+(.sequence_id|tostring)), .name, .priority, (.min_module_name // "-"), (.labels|join(",")), (.start_date // "-"), (.target_date // "-")] | @tsv' <file>`
- **How to apply**: トリアージで全件表を作るときは list の生出力を読まず、退避ファイルを jq で要約する。`fields` パラメータで本文を除外できるかは未検証。
- **2026-09-19追記: `fields` パラメータは list / retrieve の両方で効く。** `fields="sequence_id,name,state_group,priority"` で本文を除外でき、49件でも小さく収まる。本文だけ欲しいときは `retrieve` に `fields="sequence_id,name,description_stripped,..."`（HTMLより短い）。state名が欲しいときは `expand="state"` を併用。
- **PQL は条件5個まで**（`text ~ "a" OR text ~ "b" ...` を5個以上並べると "Filter nesting is too deep" で失敗。`stateGroup IN openStates() AND (…OR×4)` も6扱いで失敗）。キーワード検索は3〜4個ずつに分けて並列実行する。エラー応答にPQLリファレンス全文が付いてくる（`get_pql_reference` は action 必須エラーで使えない）。`text ~` は既定でDone/Cancelled込み（アーカイブ除く）。
- 件数の突き合わせは `workitem count`（`group_by=state_id`）と `pql='stateGroup IN openStates()'` の総数で行える（`group_by=state` は不可、`state_id` が正）。

## blocking / relates to の取得

- 一覧APIにはrelationが含まれない。`workitem_relation list(project_id, workitem_id)` をタスク単位で呼ぶ（レスポンスは小さい）。並列で50件程度まとめて呼べる。
- `dependencies.blocking / blocked_by` と `custom["relates to"]` の両方が返る。相手のstateも含まれるので、blocked_byの相手がDone/Cancelledなら実質解消済みと判断できる。

## 現行ラベルID（2026-09-19時点、9件）

ci=`ff51c67a-f0c5-4667-be48-641e40674ee2` / mobile=`8e0afc4a-3f8c-40fe-8ce4-bf2e700ab0fe` / backend=`ccedb8de-8544-47d2-a696-18c7e63a3732` / bugfix=`b14a634a-8edf-494a-8007-15b822c60ef7` / infra=`b61a803d-33b8-4a91-a7a1-c9b20afbf50d` / manual-required=`13422045-cdaa-4e32-b47b-ac897be19481` / small=`a1222627-e9a6-488d-a38e-82c4c81d7088` / docs=`c43d7aca-d5e3-4a5c-a84b-4b0617225392` / ready=`c55d541f-4c4b-4516-8832-ff151225f4e9`

## 本文が巨大なwork item(SS-80)への追記は全文再送が必要(2026-09-19確認)

- SS-80 の description_html は約186KB（Planeエディタの class / data-id 属性と、表の空セル・リストの空li・空pの変換アーティファクトが大半。属性除去後でも約42KB）。`workitem update` は本文の全置換のみで「末尾追記」APIが無いため、追記するには全文を再送する必要がある。
- 属性除去や空セル除去で再送すると表・リスト構造が変わるため、「既存本文をそのまま保持」の指示とは両立しない。SS-80 本文への追記は未実施のまま、コメントのみ残してユーザー判断待ちにした。
- **How to apply**: 本文追記の依頼では、先に `retrieve` の `fields="sequence_id,description_stripped"` などで本文サイズを確認する。巨大なら全文再送せず、コメントで代替するか、構造変更を許容するかをユーザーに確認する。小さい本文（SS-89/102 級）は `<div>` 末尾に追記して全文 update で問題なし。

- **2026-09-19追記: SS-80 の `workitem update`（state のみ）は応答に本文が全部載り約21万文字でエラー表示になるが、更新自体は成功している。** 退避ファイルを `jq -c '.result | {sequence_id, state, updated_at}'` で確認し、その後 `retrieve` に `fields="sequence_id,name,state,state_group"` + `expand="state"` を付けて再確認する。SS-80 は Cancelled 済み（state `2abacd9b-3593-4423-a77f-d0eb64dde66a`、取り下げコメントあり）。

## その他

- `get_pql_reference` は「requires an action. It takes: read.」を返して実行できなかった（2026-09-19）。PQLは `state = "<uuid>"` / `stateGroup IN openStates()` が動作確認済み。
- **2026-09-20追記**: `label IN ("id1","id2")` も動作確認済み（複数ラベルのOR検索）。`stateGroup IN openStates() AND label IN (...)` の組み合わせでも「条件5個まで」の壁に引っかからなかった（IN句全体で1条件扱いの模様）。ラベル横断のタスク棚卸しはこれが第一候補。
