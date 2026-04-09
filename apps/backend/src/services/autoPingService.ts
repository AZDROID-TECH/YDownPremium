import type { Request } from "express";

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_PING_LEAD_MS = 2 * 60 * 1000;
const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000;

let lastActivityAtMs = Date.now();
let pingInFlight = false;
let lastPingAttemptAtMs = 0;

const parsePositiveInteger = (
  rawValue: string | undefined,
  fallbackValue: number
): number => {
  if (rawValue === undefined) {
    return fallbackValue;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }

  return Math.floor(parsed);
};

const trimRightSlash = (value: string): string => value.replace(/\/+$/, "");

const resolveSelfPingUrl = (): string | null => {
  const explicitUrl = process.env.SELF_PING_URL?.trim();
  if (explicitUrl !== undefined && explicitUrl.length > 0) {
    return explicitUrl;
  }

  const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  if (renderExternalUrl !== undefined && renderExternalUrl.length > 0) {
    return `${trimRightSlash(renderExternalUrl)}/api/health`;
  }

  return null;
};

const isAutoPingRequest = (request: Request): boolean =>
  request.header("x-autoping") === "1";

export const markAutoPingActivity = (request: Request): void => {
  if (isAutoPingRequest(request)) {
    return;
  }

  lastActivityAtMs = Date.now();
};

export const startAutoPingScheduler = (): void => {
  const isEnabled = process.env.AUTO_PING_ENABLED !== "false";
  if (!isEnabled) {
    return;
  }

  const selfPingUrl = resolveSelfPingUrl();
  if (selfPingUrl === null) {
    console.log("Auto-ping skipped: SELF_PING_URL/RENDER_EXTERNAL_URL is not set.");
    return;
  }

  const idleTimeoutMs = parsePositiveInteger(
    process.env.AUTO_PING_IDLE_TIMEOUT_MS,
    DEFAULT_IDLE_TIMEOUT_MS
  );
  const pingLeadMs = parsePositiveInteger(
    process.env.AUTO_PING_LEAD_MS,
    DEFAULT_PING_LEAD_MS
  );
  const checkIntervalMs = parsePositiveInteger(
    process.env.AUTO_PING_CHECK_INTERVAL_MS,
    DEFAULT_CHECK_INTERVAL_MS
  );
  const pingTriggerIdleMs = Math.max(0, idleTimeoutMs - pingLeadMs);

  const timer = setInterval(() => {
    const nowMs = Date.now();
    const idleMs = nowMs - lastActivityAtMs;

    if (idleMs < pingTriggerIdleMs) {
      return;
    }
    if (pingInFlight) {
      return;
    }
    if (nowMs - lastPingAttemptAtMs < checkIntervalMs) {
      return;
    }

    pingInFlight = true;
    lastPingAttemptAtMs = nowMs;

    void fetch(selfPingUrl, {
      method: "GET",
      headers: {
        "x-autoping": "1",
        "user-agent": "ydownpremium-autoping/1.0"
      }
    })
      .then((response) => {
        if (!response.ok) {
          console.log(`Auto-ping failed with status ${String(response.status)}.`);
          return;
        }

        lastActivityAtMs = Date.now();
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown auto-ping error.";
        console.log(`Auto-ping error: ${message}`);
      })
      .finally(() => {
        pingInFlight = false;
      });
  }, checkIntervalMs);

  timer.unref();
  console.log(
    `Auto-ping enabled. URL=${selfPingUrl}, idleTriggerMs=${String(pingTriggerIdleMs)}`
  );
};

