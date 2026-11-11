import { supabaseRest } from "../supabase-rest.cjs";
import { DEFAULT_MQTT_TOPIC, houseStateToMaquetePayload } from "./maquete-payload.js";

const DEFAULT_TIMEOUT_MS = 2000;

function warn(message, extra) {
  if (extra) console.warn("maquete mqtt:", message, extra);
  else console.warn("maquete mqtt:", message);
}

export function mqttConfigFromEnv(env = process.env) {
  const url = String(env.MQTT_URL || "").trim();
  const username = String(env.MQTT_USERNAME || "").trim();
  const password = String(env.MQTT_PASSWORD || "");
  const topic = String(env.MQTT_TOPIC || DEFAULT_MQTT_TOPIC).trim() || DEFAULT_MQTT_TOPIC;
  const insecure = String(env.MQTT_TLS_INSECURE || "").trim() === "1";
  return { url, username, password, topic, insecure };
}

export async function readActiveSessionCode({ env = process.env, fetchActive } = {}) {
  if (typeof fetchActive === "function") return fetchActive();
  const forced = String(env.MQTT_ACTIVE_SESSION || "").trim().toUpperCase();
  if (forced) return forced;
  const result = await supabaseRest("app_state?id=eq.1&select=current_session_code", {
    env,
    serviceRoleOnly: true,
    raw: true,
    timeoutMs: 1500,
  });
  if (!result.ok) {
    const fallback = await supabaseRest("app_state?id=eq.1&select=current_session_code", {
      env,
      raw: true,
      timeoutMs: 1500,
    });
    if (!fallback.ok) return "";
    const row = Array.isArray(fallback.json) ? fallback.json[0] : fallback.json;
    return String(row?.current_session_code || "").toUpperCase();
  }
  const row = Array.isArray(result.json) ? result.json[0] : result.json;
  return String(row?.current_session_code || "").toUpperCase();
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label || "timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function defaultConnect(url, options) {
  const mqtt = await import("mqtt");
  const connect = mqtt.connectAsync || mqtt.default?.connectAsync;
  if (typeof connect !== "function") {
    throw new Error("mqtt_connect_missing");
  }
  return connect(url, options);
}

/**
 * Connect-publish-end. Never throws. Missing env is a silent no-op.
 */
export async function publishMaqueteState(state, options = {}) {
  const env = options.env || process.env;
  const cfg = mqttConfigFromEnv(env);
  if (!cfg.url) return { skipped: "missing_env" };

  const timeoutMs = options.timeoutMs != null
    ? options.timeoutMs
    : (Number(env.MQTT_TIMEOUT_MS) > 0 ? Number(env.MQTT_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS);
  const payload = options.payload || houseStateToMaquetePayload(state);
  const session = String(payload.session || "").toUpperCase();
  if (!session) {
    warn("skip: empty session");
    return { skipped: "empty_session" };
  }

  try {
    return await withTimeout((async () => {
      let active = "";
      try {
        active = String(await readActiveSessionCode({
          env,
          fetchActive: options.fetchActive,
        }) || "").toUpperCase();
      } catch (err) {
        warn("active session lookup failed", err?.message || err);
        return { skipped: "active_lookup_failed" };
      }
      if (!active) {
        warn("skip: no active session");
        return { skipped: "no_active_session" };
      }
      if (active !== session) {
        warn(`skip: ${session} is not active (${active})`);
        return { skipped: "inactive_session" };
      }

      const connectFn = options.connect || defaultConnect;
      const client = await connectFn(cfg.url, {
        username: cfg.username || undefined,
        password: cfg.password || undefined,
        protocolVersion: 4,
        connectTimeout: timeoutMs,
        reconnectPeriod: 0,
        rejectUnauthorized: cfg.insecure ? false : true,
        clientId: `genjutsu-site-${Math.random().toString(16).slice(2, 10)}`,
      });
      try {
        const body = JSON.stringify(payload);
        if (typeof client.publishAsync === "function") {
          await client.publishAsync(cfg.topic, body, { qos: 1, retain: true });
        } else {
          await new Promise((resolve, reject) => {
            client.publish(cfg.topic, body, { qos: 1, retain: true }, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
        return { ok: true, topic: cfg.topic, payload };
      } finally {
        try {
          if (typeof client.endAsync === "function") await client.endAsync();
          else if (typeof client.end === "function") {
            await new Promise((resolve) => client.end(true, {}, resolve));
          }
        } catch {
          /* ignore disconnect */
        }
      }
    })(), timeoutMs, "mqtt_timeout");
  } catch (err) {
    warn(err?.message || err);
    return { skipped: "error", error: String(err?.message || err) };
  }
}

export async function notifyMaqueteHouseSaved(state, options = {}) {
  try {
    return await publishMaqueteState(state, options);
  } catch (err) {
    warn(err?.message || err);
    return { skipped: "error", error: String(err?.message || err) };
  }
}
