import { beforeEach, describe, expect, it, vi } from "vitest";

// expo-location の背景記録 API だけを差し替える（他は vitest 用 alias の最小モック）。
const locationMocks = vi.hoisted(() => ({
  start: vi.fn<(taskName: string, options: unknown) => Promise<void>>(),
  stop: vi.fn<(taskName: string) => Promise<void>>(),
  hasStarted: vi.fn<(taskName: string) => Promise<boolean>>(),
}));

// 通知権限の要求（Android 13 以上）。既定は iOS 扱い（ダイアログを出さない）。
const rnMocks = vi.hoisted(() => ({
  platform: { OS: "ios", Version: "17.0" as number | string },
  check: vi.fn<(permission: string) => Promise<boolean>>(),
  request: vi.fn<(permission: string) => Promise<string>>(),
}));

vi.mock("react-native", () => ({
  Platform: rnMocks.platform,
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS" },
    check: rnMocks.check,
    request: rnMocks.request,
  },
}));

vi.mock("expo-location", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  startLocationUpdatesAsync: locationMocks.start,
  stopLocationUpdatesAsync: locationMocks.stop,
  hasStartedLocationUpdatesAsync: locationMocks.hasStarted,
}));

// ファイル実装ではなくメモリ実装の hub を共有 singleton として使う。
vi.mock("@/services/location/backgroundLocationTask", async () => {
  const { createBackgroundSampleHub: create } =
    await import("@/services/location/backgroundSampleHub");
  const { createMemorySampleBufferStorage: createMemory } =
    await import("@/services/location/sampleBufferStorage.memory");
  return {
    BACKGROUND_LOCATION_TASK_NAME: "test-task",
    backgroundSampleHub: create(createMemory(), { now: () => 0, onError: () => {} }),
  };
});

import { backgroundSampleHub as hub } from "@/services/location/backgroundLocationTask";
import { createRealLocationService } from "@/services/location/location.real";

function taskData(timestamp: number) {
  return { locations: [{ coords: { latitude: 35, longitude: 139, accuracy: 5 }, timestamp }] };
}

beforeEach(() => {
  hub.endSession();
  locationMocks.start.mockReset().mockResolvedValue(undefined);
  locationMocks.stop.mockReset().mockResolvedValue(undefined);
  locationMocks.hasStarted.mockReset().mockResolvedValue(false);
  rnMocks.platform.OS = "ios";
  rnMocks.platform.Version = "17.0";
  rnMocks.check.mockReset().mockResolvedValue(false);
  rnMocks.request.mockReset().mockResolvedValue("granted");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("createRealLocationService: startBackgroundTracking", () => {
  it("新しい sessionId ではセッションを始め、タスクを開始する", async () => {
    const service = createRealLocationService();
    await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    expect(hub.activeSessionId).toBe("w1");
    expect(locationMocks.start).toHaveBeenCalledTimes(1);
  });

  it("タスクが届いた点はリスナーに配られ、readRecordedSamples で読める", async () => {
    const service = createRealLocationService();
    const listener = vi.fn();
    const sub = await service.startBackgroundTracking({ sessionId: "w1", listener });
    hub.handleTaskData(taskData(1), null);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(sub.readRecordedSamples()).toHaveLength(1);
  });

  it("同じ sessionId でタスクが動いていれば、開始し直さずバッファも消さない（再マウント）", async () => {
    const service = createRealLocationService();
    await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    hub.handleTaskData(taskData(1), null);
    locationMocks.start.mockClear();
    locationMocks.hasStarted.mockResolvedValue(true);

    const sub = await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    expect(locationMocks.start).not.toHaveBeenCalled();
    expect(sub.readRecordedSamples()).toHaveLength(1);
  });

  it("同じ sessionId でもタスクが止まっていれば開始し直す", async () => {
    const service = createRealLocationService();
    await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    locationMocks.start.mockClear();
    locationMocks.hasStarted.mockResolvedValue(false);
    await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    expect(locationMocks.start).toHaveBeenCalledTimes(1);
  });

  it("別の sessionId ではバッファを空にして始める", async () => {
    const service = createRealLocationService();
    await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    hub.handleTaskData(taskData(1), null);
    const sub = await service.startBackgroundTracking({ sessionId: "w2", listener: vi.fn() });
    expect(hub.activeSessionId).toBe("w2");
    expect(sub.readRecordedSamples()).toEqual([]);
  });

  it("開始に失敗したら LocationError に変換して reject し、リスナーとセッションを巻き戻す", async () => {
    const service = createRealLocationService();
    const listener = vi.fn();
    locationMocks.start.mockRejectedValue(new Error("not allowed"));
    await expect(
      service.startBackgroundTracking({ sessionId: "w1", listener }),
    ).rejects.toMatchObject({ name: "LocationError" });
    expect(hub.activeSessionId).toBeNull();
    hub.beginSession("other");
    hub.handleTaskData(taskData(1), null);
    expect(listener).not.toHaveBeenCalled();
  });

  it("detach はリスナーだけ外し、記録は止めない。何度呼んでも安全", async () => {
    const service = createRealLocationService();
    const listener = vi.fn();
    const sub = await service.startBackgroundTracking({ sessionId: "w1", listener });
    sub.detach();
    sub.detach();
    hub.handleTaskData(taskData(1), null);
    expect(listener).not.toHaveBeenCalled();
    expect(locationMocks.stop).not.toHaveBeenCalled();
    expect(sub.readRecordedSamples()).toHaveLength(1);
  });

  it("開始と停止は呼び出し順に1つずつ実行される（起動時の停止が散歩の開始を巻き込まない）", async () => {
    const service = createRealLocationService();
    const order: string[] = [];
    let releaseHasStarted!: () => void;
    locationMocks.hasStarted.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseHasStarted = () => {
            order.push("stop:checked");
            resolve(false);
          };
        }),
    );
    locationMocks.start.mockImplementation(async () => {
      order.push("start");
    });

    const stopping = service.stopBackgroundTracking();
    const starting = service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    await vi.waitFor(() => expect(locationMocks.hasStarted).toHaveBeenCalledTimes(1));
    expect(order).toEqual([]);
    releaseHasStarted();
    await Promise.all([stopping, starting]);
    expect(order).toEqual(["stop:checked", "start"]);
    expect(hub.activeSessionId).toBe("w1");
  });
});

describe("createRealLocationService: stopBackgroundTracking", () => {
  it("動いていれば止めてから、セッションを終了してバッファを消す", async () => {
    const service = createRealLocationService();
    await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    hub.handleTaskData(taskData(1), null);
    locationMocks.hasStarted.mockResolvedValue(true);
    locationMocks.stop.mockImplementation(async () => {
      // 止めた時点ではまだセッションが生きている（止める → 消す の順序）。
      expect(hub.activeSessionId).toBe("w1");
    });

    await service.stopBackgroundTracking();
    expect(locationMocks.stop).toHaveBeenCalledTimes(1);
    expect(hub.activeSessionId).toBeNull();
    expect(hub.readSamples()).toEqual([]);
  });

  it("動いていなければ stop を呼ばず、それでもセッションは終わる（冪等）", async () => {
    const service = createRealLocationService();
    await service.stopBackgroundTracking();
    await service.stopBackgroundTracking();
    expect(locationMocks.stop).not.toHaveBeenCalled();
    expect(hub.activeSessionId).toBeNull();
  });

  it("stop が1回失敗しても再試行して止める", async () => {
    const service = createRealLocationService();
    locationMocks.hasStarted.mockResolvedValue(true);
    locationMocks.stop.mockRejectedValueOnce(new Error("busy")).mockResolvedValue(undefined);
    await expect(service.stopBackgroundTracking()).resolves.toBeUndefined();
    expect(locationMocks.stop).toHaveBeenCalledTimes(2);
  });

  it("再試行も失敗したら throw せず、セッションは終了する。停止未了は次の新規セッション開始で止め直す", async () => {
    const service = createRealLocationService();
    await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    locationMocks.hasStarted.mockResolvedValue(true);
    locationMocks.stop.mockRejectedValue(new Error("busy"));

    await expect(service.stopBackgroundTracking()).resolves.toBeUndefined();
    expect(locationMocks.stop).toHaveBeenCalledTimes(2);
    expect(hub.activeSessionId).toBeNull();

    // 次の散歩の開始前に止め直す。今度は成功する。
    locationMocks.stop.mockReset().mockResolvedValue(undefined);
    await service.startBackgroundTracking({ sessionId: "w2", listener: vi.fn() });
    expect(locationMocks.stop).toHaveBeenCalledTimes(1);
    expect(locationMocks.start).toHaveBeenCalledTimes(2);
    expect(hub.activeSessionId).toBe("w2");
  });

  it("停止に失敗していなければ、新規セッション開始前に stop を呼ばない", async () => {
    const service = createRealLocationService();
    await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    await service.startBackgroundTracking({ sessionId: "w2", listener: vi.fn() });
    expect(locationMocks.stop).not.toHaveBeenCalled();
  });

  it("停止後に遅れて届いた点は書かれない", async () => {
    const service = createRealLocationService();
    const listener = vi.fn();
    await service.startBackgroundTracking({ sessionId: "w1", listener });
    await service.stopBackgroundTracking();
    hub.handleTaskData(taskData(1), null);
    expect(listener).not.toHaveBeenCalled();
    expect(hub.readSamples()).toEqual([]);
  });
});

describe("createRealLocationService: 通知権限（Android 13 以上。ADR-M-018 決定15）", () => {
  function useAndroid(version: number) {
    rnMocks.platform.OS = "android";
    rnMocks.platform.Version = version;
  }

  it("Android 13 以上では、新しい散歩の開始前に通知権限を求め、その後にタスクを開始する", async () => {
    useAndroid(34);
    const order: string[] = [];
    rnMocks.request.mockImplementation(async () => {
      order.push("request");
      return "granted";
    });
    locationMocks.start.mockImplementation(async () => {
      order.push("start");
    });

    await createRealLocationService().startBackgroundTracking({
      sessionId: "w1",
      listener: vi.fn(),
    });
    expect(rnMocks.request).toHaveBeenCalledWith("android.permission.POST_NOTIFICATIONS");
    expect(order).toEqual(["request", "start"]);
  });

  it("拒否されても背景記録は開始する", async () => {
    useAndroid(34);
    rnMocks.request.mockResolvedValue("never_ask_again");
    const sub = await createRealLocationService().startBackgroundTracking({
      sessionId: "w1",
      listener: vi.fn(),
    });
    expect(locationMocks.start).toHaveBeenCalledTimes(1);
    expect(hub.activeSessionId).toBe("w1");
    expect(sub.readRecordedSamples()).toEqual([]);
  });

  it("要求が例外を投げても背景記録は開始する", async () => {
    useAndroid(34);
    rnMocks.request.mockRejectedValue(new Error("no activity"));
    await createRealLocationService().startBackgroundTracking({
      sessionId: "w1",
      listener: vi.fn(),
    });
    expect(locationMocks.start).toHaveBeenCalledTimes(1);
  });

  it("開始に失敗して再試行しても、ダイアログは出し直さない（fallback 経路）", async () => {
    useAndroid(34);
    rnMocks.request.mockResolvedValue("denied");
    const service = createRealLocationService();
    locationMocks.start.mockRejectedValueOnce(new Error("background start refused"));
    await expect(
      service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() }),
    ).rejects.toMatchObject({ name: "LocationError" });
    // 失敗でセッションは巻き戻るので、再試行は「新しい散歩」と同じ経路を通る。
    await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    expect(rnMocks.request).toHaveBeenCalledTimes(1);
    expect(locationMocks.start).toHaveBeenCalledTimes(2);
  });

  it("画面の再マウント（同じ sessionId）や次の散歩でも、ダイアログは出し直さない", async () => {
    useAndroid(34);
    rnMocks.request.mockResolvedValue("denied");
    const service = createRealLocationService();
    await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    locationMocks.hasStarted.mockResolvedValue(true);
    await service.startBackgroundTracking({ sessionId: "w1", listener: vi.fn() });
    await service.startBackgroundTracking({ sessionId: "w2", listener: vi.fn() });
    expect(rnMocks.request).toHaveBeenCalledTimes(1);
  });

  it("すでに許可されていれば求めない", async () => {
    useAndroid(34);
    rnMocks.check.mockResolvedValue(true);
    await createRealLocationService().startBackgroundTracking({
      sessionId: "w1",
      listener: vi.fn(),
    });
    expect(rnMocks.request).not.toHaveBeenCalled();
  });

  it("Android 12 以下では求めない", async () => {
    useAndroid(32);
    await createRealLocationService().startBackgroundTracking({
      sessionId: "w1",
      listener: vi.fn(),
    });
    expect(rnMocks.request).not.toHaveBeenCalled();
  });

  it("iOS では求めない", async () => {
    await createRealLocationService().startBackgroundTracking({
      sessionId: "w1",
      listener: vi.fn(),
    });
    expect(rnMocks.check).not.toHaveBeenCalled();
    expect(rnMocks.request).not.toHaveBeenCalled();
  });
});
