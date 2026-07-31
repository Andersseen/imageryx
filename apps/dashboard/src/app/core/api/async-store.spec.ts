import { ImageryxApiError } from "@imageryx/sdk";
import { describe, expect, it } from "vitest";
import { AsyncStore } from "./async-store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("AsyncStore", () => {
  it("starts idle with no data and no error", () => {
    const store = new AsyncStore<string>();
    expect(store.status()).toBe("idle");
    expect(store.data()).toBeNull();
    expect(store.hasError()).toBe(false);
  });

  it("reports 'loading' for a first load and 'success' once resolved", async () => {
    const store = new AsyncStore<string>();
    const first = deferred<string>();

    const pending = store.load(() => first.promise);
    expect(store.status()).toBe("loading");
    expect(store.isLoading()).toBe(true);
    expect(store.isRefreshing()).toBe(false);

    first.resolve("value");
    await pending;

    expect(store.status()).toBe("success");
    expect(store.data()).toBe("value");
  });

  it("reports 'refreshing' — not 'loading' — when data is already on screen", async () => {
    const store = new AsyncStore<string>();
    await store.load(async () => "first");

    const second = deferred<string>();
    const pending = store.load(() => second.promise);

    expect(store.isRefreshing()).toBe(true);
    expect(store.isLoading()).toBe(false);
    // The previous rows stay visible while the refresh is in flight.
    expect(store.data()).toBe("first");

    second.resolve("second");
    await pending;
    expect(store.data()).toBe("second");
  });

  it("drops a superseded response so a slow earlier request cannot overwrite a newer one", async () => {
    const store = new AsyncStore<string>();
    const slow = deferred<string>();
    const fast = deferred<string>();

    const slowLoad = store.load(() => slow.promise);
    const fastLoad = store.load(() => fast.promise);

    fast.resolve("newest");
    await fastLoad;
    expect(store.data()).toBe("newest");

    // The stale request resolves last, and must be ignored entirely.
    slow.resolve("stale");
    await expect(slowLoad).resolves.toBeNull();
    expect(store.data()).toBe("newest");
    expect(store.status()).toBe("success");
  });

  it("drops a superseded rejection so a stale failure cannot blank a good page", async () => {
    const store = new AsyncStore<string>();
    const failing = deferred<string>();
    const succeeding = deferred<string>();

    const failingLoad = store.load(() => failing.promise);
    const succeedingLoad = store.load(() => succeeding.promise);

    succeeding.resolve("good");
    await succeedingLoad;

    failing.reject(
      new ImageryxApiError("Gone.", { status: 500, code: "server_error" }),
    );
    await failingLoad;

    expect(store.hasError()).toBe(false);
    expect(store.data()).toBe("good");
  });

  it("records a normalized error and clears data on a failed first load", async () => {
    const store = new AsyncStore<string>();
    await store.load(() => {
      throw new ImageryxApiError("Project not found.", {
        status: 404,
        code: "not_found",
      });
    });

    expect(store.status()).toBe("error");
    expect(store.error()?.kind).toBe("not-found");
    expect(store.error()?.detail).toBe("Project not found.");
    expect(store.data()).toBeNull();
  });

  it("clears the previous error when a new load starts", async () => {
    const store = new AsyncStore<string>();
    await store.load(() => {
      throw new ImageryxApiError("Down.", {
        status: 500,
        code: "server_error",
      });
    });
    expect(store.hasError()).toBe(true);

    await store.load(async () => "recovered");
    expect(store.hasError()).toBe(false);
    expect(store.data()).toBe("recovered");
  });

  it("discards stale data on a failed refresh by default", async () => {
    const store = new AsyncStore<string>();
    await store.load(async () => "first");
    await store.load(() => {
      throw new ImageryxApiError("Down.", {
        status: 500,
        code: "server_error",
      });
    });
    expect(store.data()).toBeNull();
  });

  it("keeps stale data on a failed refresh when asked to", async () => {
    const store = new AsyncStore<string>({ keepDataOnRefreshError: true });
    await store.load(async () => "first");
    await store.load(() => {
      throw new ImageryxApiError("Down.", {
        status: 500,
        code: "server_error",
      });
    });
    expect(store.data()).toBe("first");
    expect(store.hasError()).toBe(true);
  });

  it("patches loaded data in place without a round trip", async () => {
    const store = new AsyncStore<{ items: string[] }>();
    await store.load(async () => ({ items: ["a"] }));
    store.patch((current) => ({ items: [...current.items, "b"] }));
    expect(store.data()).toEqual({ items: ["a", "b"] });
  });

  it("ignores a patch when nothing is loaded, so it cannot fabricate data", () => {
    const store = new AsyncStore<{ items: string[] }>();
    store.patch(() => ({ items: ["invented"] }));
    expect(store.data()).toBeNull();
    expect(store.status()).toBe("idle");
  });

  it("reset discards data and ignores an in-flight response", async () => {
    const store = new AsyncStore<string>();
    const inFlight = deferred<string>();
    const pending = store.load(() => inFlight.promise);

    store.reset();
    expect(store.status()).toBe("idle");

    inFlight.resolve("late");
    await expect(pending).resolves.toBeNull();
    expect(store.data()).toBeNull();
  });
});
