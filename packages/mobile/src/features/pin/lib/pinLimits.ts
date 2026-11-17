/**
 * API 契約の値（backend `pins/schemas.py` の定数と一致させる）。
 * `pinLimits.test.ts` は作らず、不変条件（下記）は `photoDraft.test.ts` の冒頭で1ケースとして固定する。
 */
export const PIN_NAME_MAX_LENGTH = 50;
export const PIN_MEMO_MAX_LENGTH = 1000;
export const PIN_TAG_MAX_LENGTH = 20;
export const PIN_TAGS_MAX_COUNT = 10;
/** 1リクエスト（POST /pins・POST /pins/{id}/photos）で紐付けられる写真の上限。ピン全体の枚数は無制限。 */
export const PIN_PHOTOS_PER_REQUEST_MAX = 10;
/**
 * backend の未使用枠（発行済み・未紐付け）の同時保有上限（`PIN_PHOTO_MAX_PENDING_UPLOADS` の既定値）の写し。
 * 超えると枠発行が 429。値そのものはテストの不変条件にだけ使う（mobile は 429 を受けても壊れない設計）。
 */
export const BACKEND_PENDING_UPLOADS_MAX = 30;
/**
 * 選択直後に先行アップロードしてよい「未紐付けの枠」の最大数。backend 上限より 10 小さくして、
 * 放棄した別の登録画面・別端末が残した未使用枠（紐付け期限 6 時間）の分の余裕を持たせる。
 * 2 リクエスト分（20 枚）が先に上がっていれば、20 枚までの登録は保存ボタンから紐付けだけで終わる。
 * 不変条件: PIN_PHOTOS_PER_REQUEST_MAX <= PIN_PHOTO_PREUPLOAD_MAX < BACKEND_PENDING_UPLOADS_MAX。
 */
export const PIN_PHOTO_PREUPLOAD_MAX = 20;
/**
 * 端末側の極端な超過だけを弾く安全弁（PR #93 T9）。正は枠発行応答の `max_byte_size`
 * （`pinPhotoTransfer.ts` が枠発行後に比較する）で、サーバーの設定値が変わっても
 * アプリの更新が要らない。ここでの足切りは「枠を申請するだけ無駄なほど明らかに大きい」
 * ものに限る（バグで生の写真がそのまま渡った場合の保険）ため、通常の上限（10 MiB）より
 * 十分に大きい値にする。
 */
export const PIN_PHOTO_MAX_BYTES_HARD_CAP = 50 * 1024 * 1024;
/**
 * 先行アップロード済み（`uploaded`）の枠を、保存時にそのまま紐付けに使ってよい経過時間の上限（SS-126）。
 * backend の紐付け期限（`PIN_PHOTO_UPLOAD_ATTACH_TTL_SECONDS`、既定 6 時間。応答には出ない）より 1 時間短くし、
 * 枠の発行から送信完了までの差（最大 60 秒）・端末の時計のずれ・保存中の処理時間を見込む。
 * 超えた枠は捨てて新しい枠で送り直す。期限の設定が変わってこの値を外れても、紐付けの 409 を受けたら
 * 以前からの枠を送り直して1回だけやり直すので回復する（`pinSaveRunner.ts`）。
 */
export const PIN_PHOTO_UPLOAD_REUSE_MAX_AGE_MS = 5 * 60 * 60 * 1000;
/** backend の FIRST_SANPO_MAP_NAME と一致させる。 */
export const FIRST_SANPO_MAP_NAME = "最初の地図";
