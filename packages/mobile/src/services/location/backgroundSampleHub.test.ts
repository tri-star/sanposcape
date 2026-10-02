import { describe, expect, it, vi } from "vitest";

import { createBackgroundSampleHub } from "@/services/location/backgroundSampleHub";
import type { BackgroundSampleHubEvent } from "@/services/location/backgroundSampleHub";
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

function setup(storageOverride?: Partial<SampleBufferStorage>) {
  const memory = createMemorySampleBufferStorage();
  const storage: SampleBufferStorage = { ...memory, ...storageOverride };
  const errors: Array<{ event: BackgroundSampleHubEvent; detail: Record<string, unknown> }> = [];
  const hub = createBackgroundSampleHub(storage, {
    onError: (event, detail) => errors.push({ event, detail }),
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

  it("onError の detail に座標が含まれない", () => {
    const { hub, errors } = setup({
      append: () => {
        throw new Error("disk full");
      },
    });
    hub.beginSession("w1");
    hub.handleTaskData(data([35.123456, 139.654321, 1]), null);
    hub.handleTaskData(null, { code: "E", message: "m" });
    const text = JSON.stringify(errors.map((e) => e.detail));
    expect(text).not.toContain("35.123456");
    expect(text).not.toContain("139.654321");
  });
});
