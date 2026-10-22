import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareServerlessChromium,
  isChromiumBusyError,
  retryOnChromiumBusy,
  createChromeMutex,
} from "./chromium-lambda-env";

const KEYS = ["AWS_LAMBDA_JS_RUNTIME", "FONTCONFIG_PATH", "LD_LIBRARY_PATH"] as const;

describe("prepareServerlessChromium", () => {
  const snapshot = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

  afterEach(() => {
    for (const key of KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  it("is a no-op on macOS so local Chrome is used", () => {
    delete process.env.AWS_LAMBDA_JS_RUNTIME;
    expect(prepareServerlessChromium({ platform: "darwin" })).toEqual({ applied: false });
    expect(process.env.AWS_LAMBDA_JS_RUNTIME).toBeUndefined();
  });

  it("marks Node 22 Vercel as Lambda AL2023 before Chromium is imported", () => {
    delete process.env.AWS_LAMBDA_JS_RUNTIME;
    delete process.env.LD_LIBRARY_PATH;
    delete process.env.FONTCONFIG_PATH;
    const result = prepareServerlessChromium({ platform: "linux", nodeMajor: 22 });
    expect(result).toEqual({
      applied: true,
      runtime: "nodejs22.x",
      libPath: "/tmp/al2023/lib",
    });
    expect(process.env.AWS_LAMBDA_JS_RUNTIME).toBe("nodejs22.x");
    expect(process.env.LD_LIBRARY_PATH).toBe("/tmp/al2023/lib");
    expect(process.env.FONTCONFIG_PATH).toBe("/tmp/fonts");
  });

  it("maps Node 24 to nodejs22.x so v131 extracts AL2023 libs, not AL2", () => {
    delete process.env.AWS_LAMBDA_JS_RUNTIME;
    delete process.env.LD_LIBRARY_PATH;
    const result = prepareServerlessChromium({ platform: "linux", nodeMajor: 24 });
    expect(result.runtime).toBe("nodejs22.x");
    expect(result.libPath).toBe("/tmp/al2023/lib");
  });
});

describe("isChromiumBusyError", () => {
  it("detects spawn ETXTBSY from Puppeteer", () => {
    expect(isChromiumBusyError(new Error("spawn ETXTBSY"))).toBe(true);
    expect(isChromiumBusyError(Object.assign(new Error("Failed to launch"), { code: "ETXTBSY" }))).toBe(true);
    expect(isChromiumBusyError(new Error("Drive API error"))).toBe(false);
  });
});

describe("retryOnChromiumBusy", () => {
  it("retries ETXTBSY then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("spawn ETXTBSY"), { code: "ETXTBSY" }))
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn(async () => {});
    await expect(retryOnChromiumBusy(fn, { attempts: 3, sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry unrelated errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Drive API error"));
    await expect(retryOnChromiumBusy(fn, { attempts: 3, sleep: async () => {} })).rejects.toThrow("Drive API error");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("createChromeMutex", () => {
  it("runs overlapping work one at a time", async () => {
    const mutex = createChromeMutex();
    const order: string[] = [];
    const first = mutex(async () => {
      order.push("a-start");
      await Promise.resolve();
      order.push("a-end");
      return "a";
    });
    const second = mutex(async () => {
      order.push("b-start");
      order.push("b-end");
      return "b";
    });
    await expect(Promise.all([first, second])).resolves.toEqual(["a", "b"]);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });
});
