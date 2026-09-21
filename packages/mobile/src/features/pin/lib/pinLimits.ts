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
 * 1枚の上限（加工後）の**フォールバック**。正は枠発行応答の `max_byte_size`（サーバーの設定値）。
 * 枠を申請する前に明らかな超過を弾くためだけに使う。
 */
export const PIN_PHOTO_MAX_BYTES_FALLBACK = 10 * 1024 * 1024;
export const UNTITLED_PIN_LABEL = "無題のピン";
/** backend の FIRST_SANPO_MAP_NAME と一致させる。 */
export const FIRST_SANPO_MAP_NAME = "最初の地図";
