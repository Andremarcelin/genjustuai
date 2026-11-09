// Model ids checked against the public docs on 2026-11-06:
// Gemini Live ephemeral tokens — https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
// Live WebSocket — https://ai.google.dev/api/live
// Groq speech-to-text — https://console.groq.com/docs/speech-to-text
// Groq chat + function tools — https://console.groq.com/docs/api-reference
//   and https://console.groq.com/docs/model/openai/gpt-oss-20b

export const GEMINI_LIVE_MODEL = "gemini-3.8-live";
export const GEMINI_LIVE_RESOURCE = "models/gemini-3.8-live";
// Text generation only. Do not use 2.0-flash or 2.5-flash (retired for these keys).
export const GEMINI_TEXT_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_AUTH_URL = "https://generativelanguage.googleapis.com/v1beta/auth_tokens";
export const GEMINI_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
export const GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";
export const OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
export const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_STT_MODEL = "whisper-large-v3-turbo";
export const GROQ_CHAT_MODEL = "openai/gpt-oss-20b";

export const COMMAND_LIMIT = 20;
export const COMMAND_WINDOW_MS = 60_000;
export const VOICE_TOKEN_LIMIT = 4;
export const VOICE_TOKEN_WINDOW_MS = 10 * 60_000;
export const CHAT_LIMIT = 12;
export const CHAT_WINDOW_MS = 60_000;
export const IP_LIMIT = 30;
export const IP_WINDOW_MS = 60_000;

// newSessionExpireTime is 60s. expireTime (expiresAt) is 10 minutes.
export const TOKEN_START_MS = 60_000;
export const TOKEN_LIFE_MS = 10 * 60_000;

export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
