/**
 * @sparticuz/chromium only extracts Amazon Linux shared libs (libnss3, libnspr4, …)
 * and sets LD_LIBRARY_PATH when it thinks it is on AWS Lambda / Netlify.
 *
 * Vercel Node functions do not set AWS_EXECUTION_ENV or AWS_LAMBDA_JS_RUNTIME, so
 * the binary inflates, then dies with Puppeteer's "Failed to launch the browser process".
 *
 * Call this BEFORE `import("@sparticuz/chromium")` and again before executablePath()
 * so a previously-cached import still extracts AL2023 libs.
 */
export function prepareServerlessChromium(opts?: {
  platform?: NodeJS.Platform;
  nodeMajor?: number;
}): { applied: boolean; runtime?: string; libPath?: string } {
  const platform = opts?.platform ?? process.platform;
  if (platform === "darwin" || platform === "win32") {
    return { applied: false };
  }

  const nodeMajor =
    opts?.nodeMajor ??
    Number.parseInt(process.versions.node.split(".")[0] ?? "22", 10);

  // v131 treats 20.x / 22.x as Amazon Linux 2023. Node 24+ would otherwise match
  // the older AL2 branch and extract the wrong libraries.
  const runtime =
    nodeMajor >= 24
      ? "nodejs22.x"
      : nodeMajor >= 20
        ? `nodejs${nodeMajor}.x`
        : "nodejs18.x";
  const libPath = nodeMajor >= 20 ? "/tmp/al2023/lib" : "/tmp/al2/lib";

  process.env.AWS_LAMBDA_JS_RUNTIME ??= runtime;
  process.env.FONTCONFIG_PATH ??= "/tmp/fonts";
  if (!process.env.LD_LIBRARY_PATH) {
    process.env.LD_LIBRARY_PATH = libPath;
  } else if (!process.env.LD_LIBRARY_PATH.startsWith(libPath)) {
    process.env.LD_LIBRARY_PATH = `${libPath}:${process.env.LD_LIBRARY_PATH}`;
  }

  return { applied: true, runtime: process.env.AWS_LAMBDA_JS_RUNTIME, libPath };
}

export function isChromiumBusyError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  const msg = err instanceof Error ? err.message : String(err);
  return code === "ETXTBSY" || /ETXTBSY|text file busy/i.test(msg);
}

/** Serialize Chromium extract+launch on one isolate (Vercel Fluid concurrency). */
export function createChromeMutex(): <T>(fn: () => Promise<T>) => Promise<T> {
  let chain: Promise<void> = Promise.resolve();
  return async function withMutex<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const prev = chain;
    chain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

export const withChromeMutex = createChromeMutex();

export async function retryOnChromiumBusy<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  const attempts = opts?.attempts ?? 5;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isChromiumBusyError(err) || i === attempts - 1) throw err;
      const ms = 250 * 2 ** i;
      console.warn("[chromium] spawn busy, retrying", { attempt: i + 1, ms });
      await sleep(ms);
    }
  }
  throw last;
}
