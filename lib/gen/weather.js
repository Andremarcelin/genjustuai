import { OPEN_METEO_FORECAST_URL, OPEN_METEO_GEOCODE_URL } from "./constants.js";

export const DEFAULT_CITY = "Taboão da Serra";

const WMO = {
  0: "céu limpo",
  1: "principalmente limpo",
  2: "parcialmente nublado",
  3: "nublado",
  45: "neblina",
  48: "neblina com geada",
  51: "garoa fraca",
  53: "garoa",
  55: "garoa forte",
  61: "chuva fraca",
  63: "chuva",
  65: "chuva forte",
  66: "chuva gelada",
  67: "chuva gelada forte",
  71: "neve fraca",
  73: "neve",
  75: "neve forte",
  80: "pancadas de chuva",
  81: "pancadas de chuva",
  82: "pancadas fortes",
  85: "pancadas de neve",
  95: "trovoada",
  96: "trovoada com granizo",
  99: "trovoada com granizo",
};

function fold(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function isWeatherQuestion(text) {
  const raw = fold(text);
  return /\b(clima|tempo|previsao|temperatura|umidade|vento)\b|\bvai chover\b|\bchover\b|\bpreciso sair\b|\bleva(r)? (casaco|guarda[- ]chuva)\b/.test(raw);
}

export function parseWeatherCity(text) {
  const original = String(text || "").trim();
  const match = original.match(/\bem\s+([A-Za-zÀ-ÿ0-9.'\-\s]{2,48}?)(?:\s*[?.!]|hoje|agora|amanh[ãa]|$)/i);
  if (!match) return "";
  return match[1].replace(/\b(hoje|agora|amanh[ãa]|por favor)\b/gi, "").trim();
}

export function defaultCityFromSession(session, env) {
  const fromSession = String(session?.city || session?.city_name || session?.cidade || "").trim();
  if (fromSession) return fromSession;
  const fromEnv = String(env?.GEN_DEFAULT_CITY || "").trim();
  return fromEnv || DEFAULT_CITY;
}

export function describeWeather(place, snapshot) {
  const city = place?.name || DEFAULT_CITY;
  const temp = snapshot.temp;
  const condition = snapshot.condition || "sem descrição";
  const humidity = snapshot.humidity;
  const wind = snapshot.wind;
  const rain = snapshot.rainChance;
  const parts = [`Em ${city} agora: ${temp} °C, ${condition}`];
  if (humidity != null) parts.push(`umidade ${humidity}%`);
  if (wind != null) parts.push(`vento ${wind} km/h`);
  if (rain != null) parts.push(`chance de chuva nas próximas horas ${rain}%`);
  let advice = "";
  if (rain >= 50) advice = "leva o guarda-chuva";
  else if (temp <= 19) advice = "leva um casaco";
  else if (temp >= 28) advice = "tá quente, hidrata";
  const body = parts.join(", ");
  return advice ? `${body}… ${advice}.` : `${body}.`;
}

function wmoLabel(code) {
  return WMO[Number(code)] || "condição indefinida";
}

function maxRain(hourly) {
  const values = Array.isArray(hourly?.precipitation_probability) ? hourly.precipitation_probability : [];
  const slice = values.slice(0, 6).filter((n) => Number.isFinite(Number(n))).map(Number);
  if (!slice.length) return null;
  return Math.max(...slice);
}

async function geocodeCity({ fetchImpl, city }) {
  const name = String(city || "").trim() || DEFAULT_CITY;
  const url = `${OPEN_METEO_GEOCODE_URL}?name=${encodeURIComponent(name)}&count=5&language=pt&countryCode=BR`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  const hits = Array.isArray(json?.results) ? json.results : [];
  const br = hits.find((item) => String(item.country_code || "").toUpperCase() === "BR") || hits[0];
  if (!br) return null;
  return {
    name: br.name || name,
    latitude: br.latitude,
    longitude: br.longitude,
    admin1: br.admin1 || "",
  };
}

export async function fetchWeather({ fetchImpl, city }) {
  const fetchFn = fetchImpl || globalThis.fetch;
  let place;
  try {
    place = await geocodeCity({ fetchImpl: fetchFn, city });
  } catch {
    place = null;
  }
  if (!place) return { error: "weather_unavailable", reason: "city_not_found" };
  const qs = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
    hourly: "precipitation_probability",
    forecast_days: "1",
    timezone: "America/Sao_Paulo",
  });
  let json;
  try {
    const response = await fetchFn(`${OPEN_METEO_FORECAST_URL}?${qs}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { error: "weather_unavailable", reason: "forecast_failed" };
    json = await response.json();
  } catch {
    return { error: "weather_unavailable", reason: "forecast_failed" };
  }
  const current = json?.current || {};
  const temp = Math.round(Number(current.temperature_2m));
  if (!Number.isFinite(temp)) return { error: "weather_unavailable", reason: "forecast_failed" };
  const snapshot = {
    temp,
    humidity: Number.isFinite(Number(current.relative_humidity_2m)) ? Math.round(Number(current.relative_humidity_2m)) : null,
    wind: Number.isFinite(Number(current.wind_speed_10m)) ? Math.round(Number(current.wind_speed_10m)) : null,
    condition: wmoLabel(current.weather_code),
    rainChance: maxRain(json.hourly),
  };
  return {
    place,
    snapshot,
    summary: describeWeather(place, snapshot),
  };
}
