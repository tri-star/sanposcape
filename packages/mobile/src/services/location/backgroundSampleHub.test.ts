import { describe, expect, it, vi } from "vitest";

import { createBackgroundSampleHub } from "@/services/location/backgroundSampleHub";
import type { BackgroundSampleHubEvent } from "@/services/location/backgroundSampleHub";
import { encodeLocationSamples } from "@/services/location/locationSample";
import { createMemorySampleBufferStorage } from "@/services/location/sampleBufferStorage.memory";
import type { SampleBufferStorage } from "@/services/location/types";

function data(...points: Array<[number, number, number]>) {
  return {
    locations: points.map(([lat, lng, t]) => ({
      coords: { latitude: lat, longitude: lng, accuracy: 5 },
      timestamp: t,
    })),
  };
}

function setup(storageOverride?: Partial<SampleBufferStorage>, now: () => number = () => 0) {
  const memory = createMemorySampleBufferStorage();
  const storage: SampleBufferStorage = { ...memory, ...storageOverride };
  const errors: Array<{ event: BackgroundSampleHubEvent; detail: Record<string, unknown> }> = [];
  const hub = createBackgroundSampleHub(storage, {
    onError: (event, detail) => errors.push({ event, detail }),
    now,
  });
  return { hub, memory, errors };
}

describe("createBackgroundSampleHub", () => {
  it("セッション開始前の handleTaskData は捨てる", () => {
    const { hub, memory } = setup();
    const listener = vi.fn();
    hub.addListener(listener);
    hub.handleTaskData(data([35, 139, 1]), null);
    expect(memory.peek()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it("beginSession 後はバッファへ追記し、readSamples で読め、リスナーに配る", () => {
    const { hub } = setup();
    const listener = vi.fn();
    hub.beginSession("w1");
    hub.addListener(listener);
    hub.handleTaskData(data([35, 139, 1]), null);
    expect(hub.activeSessionId).toBe("w1");
    expect(hub.readSamples()).toHaveLength(1);
    expect(listener).toHaveBeenCalledWith([
      { latitude: 35, longitude: 139, timestampMs: 1, accuracyMeters: 5 },
    ]);
  });

  it("追記は累積する", () => {
    const { hub } = setup();
    hub.beginSession("w1");
    hub.handleTaskData(data([35, 139, 1]), null);
    hub.handleTaskData(data([35.1, 139.1, 2], [35.2, 139.2, 3]), null);
    expect(hub.readSamples().map((s) => s.timestampMs)).toEqual([1, 2, 3]);
  });

  it("error 付きの呼び出しは onError だけで、何も書かない", () => {
    const { hub, memory, errors } = setup();
    hub.beginSession("w1");
    const listener = vi.fn();
    hub.addListener(listener);
    hub.handleTaskData(data([35, 139, 1]), { code: "E_X", message: "boom" });
    expect(errors.map((e) => e.event)).toEqual(["background_location_task_error"]);
    expect(errors[0]!.detail.code).toBe("E_X");
    expect(memory.peek()).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it("append が throw しても throw せず onError に通知し、リスナーには配る", () => {
    const { hub, errors } = setup({
      append: () => {
        throw new Error("disk full");
      },
    });
    const listener = vi.fn();
    hub.beginSession("w1");
    hub.addListener(listener);
    expect(() => hub.handleTaskData(data([35, 139, 1]), null)).not.toThrow();
    expect(errors.map((e) => e.event)).toEqual(["location_sample_buffer_write_failed"]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("リスナーの1つが throw しても他は呼ばれ、onError に通知する", () => {
    const { hub, errors } = setup();
    const second = vi.fn();
    hub.beginSession("w1");
    hub.addListener(() => {
      throw new Error("bad listener");
    });
    hub.addListener(second);
    hub.handleTaskData(data([35, 139, 1]), null);
    expect(second).toHaveBeenCalledTimes(1);
    expect(errors.map((e) => e.event)).toEqual(["location_sample_listener_failed"]);
  });

  it("beginSession(別ID) でバッファが空になる。endSession で空・null・リスナー解除", () => {
    const { hub, memory } = setup();
    const listener = vi.fn();
    hub.beginSession("w1");
    hub.addListener(listener);
    hub.handleTaskData(data([35, 139, 1]), null);
    hub.beginSession("w2");
    expect(hub.readSamples()).toEqual([]);
    expect(hub.activeSessionId).toBe("w2");

    hub.handleTaskData(data([35, 139, 2]), null);
    hub.endSession();
    expect(memory.peek()).toBeNull();
    expect(hub.activeSessionId).toBeNull();
    hub.beginSession("w3");
    listener.mockClear();
    hub.handleTaskData(data([35, 139, 3]), null);
    expect(listener).not.toHaveBeenCalled();
  });

  it("addListener の戻り値で外せる（2回呼んでも安全）", () => {
    const { hub } = setup();
    const listener = vi.fn();
    hub.beginSession("w1");
    const remove = hub.addListener(listener);
    remove();
    remove();
    hub.handleTaskData(data([35, 139, 1]), null);
    expect(listener).not.toHaveBeenCalled();
  });

  it("storage.read が throw したら readSamples は [] と onError", () => {
    const { hub, errors } = setup({
      read: () => {
        throw new Error("io");
      },
    });
    expect(hub.readSamples()).toEqual([]);
    expect(errors.map((e) => e.event)).toEqual(["location_sample_buffer_read_failed"]);
  });

  it("clear の失敗は onError に通知し、状態の更新は続ける", () => {
    const { hub, errors } = setup({
      clear: () => {
        throw new Error("io");
      },
    });
    hub.beginSession("w1");
    expect(hub.activeSessionId).toBe("w1");
    hub.endSession();
    expect(hub.activeSessionId).toBeNull();
    expect(errors.map((e) => e.event)).toEqual([
      "location_sample_buffer_clear_failed",
      "location_sample_buffer_clear_failed",
    ]);
  });

  it("onError の detail は code / errorName / errorMessage のキーだけで、座標を持たない", () => {
    const { hub, errors } = setup({
      append: () => {
        throw new Error("disk full");
      },
    });
    hub.beginSession("w1");
    hub.handleTaskData(data([35.123456, 139.654321, 1]), null);
    hub.handleTaskData(null, { code: "E", message: "m" });
    expect(errors).toHaveLength(2);
    for (const { detail } of errors) {
      const allowed = new Set(["code", "errorName", "errorMessage"]);
      expect(Object.keys(detail).every((key) => allowed.has(key))).toBe(true);
    }
  });

  it("locations が空・不正なデータは追記しない（空の append をしない）", () => {
    const append = vi.fn();
    const { hub } = setup({ append });
    hub.beginSession("w1");
    hub.handleTaskData({ locations: [] }, null);
    hub.handleTaskData({ locations: "x" }, null);
    hub.handleTaskData(undefined, null);
    expect(append).not.toHaveBeenCalled();
  });

  it.each([
    ["文字列", "boom"],
    ["code の無い object", {}],
  ])("error が%sでも throw せず onError に通知する", (_label, error) => {
    const { hub, errors } = setup();
    hub.beginSession("w1");
    expect(() => hub.handleTaskData(null, error)).not.toThrow();
    expect(errors.map((e) => e.event)).toEqual(["background_location_task_error"]);
  });

  it("配信中にリスナーが自分を外しても、残りのリスナーには配る", () => {
    const { hub } = setup();
    const second = vi.fn();
    hub.beginSession("w1");
    const removeFirst = hub.addListener(() => removeFirst());
    hub.addListener(second);
    hub.handleTaskData(data([35, 139, 1]), null);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("endSession は全リスナーを外す。同じ hub で次の beginSession をしても旧リスナーには配られない", () => {
    const { hub } = setup();
    const oldListener = vi.fn();
    hub.beginSession("w1");
    hub.addListener(oldListener);
    hub.endSession();
    hub.beginSession("w2");
    hub.handleTaskData(data([35, 139, 1]), null);
    expect(oldListener).not.toHaveBeenCalled();
  });

  describe("セッション開始より前の測位時刻の点", () => {
    it("バッファの削除に失敗して前の散歩の点が残っても、readSamples では返さない", () => {
      const memory = createMemorySampleBufferStorage();
      const { hub, errors } = setup(
        {
          ...memory,
          clear: () => {
            throw new Error("io");
          },
        },
        () => 5000,
      );
      // 前の散歩の点（開始時刻より前）が消せないまま残っている。
      memory.append(
        encodeLocationSamples([
          { latitude: 35, longitude: 139, timestampMs: 4000, accuracyMeters: 5 },
        ]),
      );
      hub.beginSession("w2");
      hub.handleTaskData(data([36, 140, 5000], [36.1, 140.1, 5001]), null);
      expect(hub.readSamples().map((s) => s.timestampMs)).toEqual([5000, 5001]);
      expect(errors.map((e) => e.event)).toContain("location_sample_buffer_clear_failed");
    });

    it("handleTaskData でも捨てる（書かず、リスナーにも配らない）", () => {
      const { hub, memory } = setup(undefined, () => 5000);
      const listener = vi.fn();
      hub.beginSession("w1");
      hub.addListener(listener);
      hub.handleTaskData(data([35, 139, 4999]), null);
      expect(memory.peek()).toBeNull();
      expect(listener).not.toHaveBeenCalled();
      hub.handleTaskData(data([35, 139, 4999], [35.1, 139.1, 5000]), null);
      expect(listener).toHaveBeenCalledWith([
        { latitude: 35.1, longitude: 139.1, timestampMs: 5000, accuracyMeters: 5 },
      ]);
    });
  });
});
