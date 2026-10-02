import * as TaskManager from "expo-task-manager";

import { createBackgroundSampleHub } from "@/services/location/backgroundSampleHub";
import { createFileSampleBufferStorage } from "@/services/location/sampleBufferStorage.file";

/**
 * 散歩の位置記録タスクの名前。
 * 変えると、旧バージョンが登録したタスクを起動時に止められなくなるので変えない。
 */
export const BACKGROUND_LOCATION_TASK_NAME = "sanposcape.walk-location";

/** real の位置記録が共有する hub（タスクの executor と location.real.ts が同じものを見る）。 */
export const backgroundSampleHub = createBackgroundSampleHub(createFileSampleBufferStorage());

/**
 * `expo-task-manager` を import してよい唯一のファイル（ADR-M-006 / ADR-M-018）。
 * `expo-location` は import しない（データの解釈は `toLocationSamples` が構造を見て行う）。
 *
 * グローバルスコープで定義する（`index.ts` から最初に import される）。
 * 未定義のタスク名にイベントが届くと expo-task-manager がそのタスクを登録解除するため、
 * ここを React のライフサイクルの中へ移してはいけない。
 */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK_NAME, async ({ data, error }) => {
  backgroundSampleHub.handleTaskData(data, error);
});
