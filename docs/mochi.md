# POST /api/mochi

Voz em turnos do **GenJutsu Mochi** (ESP32). O firmware manda um WAV, o servidor transcreve, o Corvo responde e a voz volta em WAV 16 kHz. Não usa a sessão do Quest nem `lib/gen`: a persona do bichinho é outra.

O firmware desiste em 20 s. A rota mira **17 s** por dentro e o function fica com `maxDuration` 30 em `vercel.json` (`api/mochi.js` só; cron e rewrites dos outros caminhos não mudam).

## Pedido

`POST /api/mochi`

Corpo cru `audio/wav`: PCM **16 kHz, mono, 16 bits**. Sem JSON e sem multipart. Teto do handler: **1 MiB** (`MAX_AUDIO_BYTES`). O parser de corpo fica desligado (`bodyParser: false`) para o WAV não ser lido como texto; o teto da plataforma é 4,5 MB, acima desse 1 MiB. Acima de 1 MiB a rota responde `413`.

| Header | Função |
|---|---|
| `X-Mochi-Token` | Tem de ser igual a `MOCHI_TOKEN` (ou `MOCHI_DEVICE_TOKEN`). Senão `401`. Comparação em tempo constante. |
| `X-Mochi-Firmware` | O aparelho envia a versão. A rota não exige o header. |
| `Content-Type` | `audio/wav` |

`GET` e o resto: `405`.

## Resposta 200

JSON. `Cache-Control: no-store`. O header `Server-Timing` repete `timing_ms` (`stt;dur=…, chat;dur=…`).

```json
{
  "text": "Pode deixar. Eu te aviso.",
  "transcript": "me lembra de beber água daqui a dez minutos",
  "emotion": "happy",
  "audio": { "mime": "audio/wav", "sample_rate": 16000, "data": "<wav base64>" },
  "alert": { "text": "Beber água", "in_min": 10 },
  "timing_ms": { "body": 1, "stt": 400, "chat": 600, "tts": 2800, "encode": 1, "total": 3800 },
  "meta": { "chat_provider": "gemini", "tts_model": "gemini-3.8-flash-lite-tts" }
}
```

- `emotion`: um destes 21 nomes do XiaoZhi: `neutral`, `happy`, `laughing`, `funny`, `sad`, `angry`, `crying`, `loving`, `embarrassed`, `surprised`, `shocked`, `thinking`, `winking`, `cool`, `relaxed`, `delicious`, `kissy`, `confident`, `sleepy`, `silly`, `confused`. Nome fora da lista vira `neutral`.
- `audio`: WAV mono 16 kHz 16 bits em base64, ou `null` se a voz falhar. O texto e a emoção ainda vêm. O TTS pede 24 kHz (16000 no pedido do Gemini volta 400) e a rota reamostra.
- `alert`: só quando a pessoa pede lembrete. `{ "text", "in_min" }` ou `in_sec` ou `at` (`HH:MM` em Brasília). Pode ser uma lista curta. Sem pedido, o campo não vai.
- `timing_ms`: `body`, `stt`, `chat`, `tts`, `encode`, `total`. O upload em si aparece no Mochi, não em `body`.

Silêncio na transcrição: `200` com `text` vazio, `emotion` `confused`, `audio` null.

## Erros

| HTTP | `error` | Quando |
|---|---|---|
| 401 | `invalid_device_token` | token ausente ou diferente |
| 503 | `missing_MOCHI_TOKEN` | a variável não está na Vercel |
| 400 | `invalid_audio` | não é WAV PCM ou tem menos de 0,1 s |
| 413 | `audio_too_large` | acima de 1 MiB |
| 429 | `rate_limited` | mais de 12 pedidos por minuto no mesmo IP |
| 502 | `stt_failed` | Groq Whisper não transcreveu |
| 502 | `llm_failed` | Gemini e Groq falharam no chat |
| 405 | `method_not_allowed` | não é POST |

## Variáveis (só no servidor)

Definir em **Settings → Environment Variables**. Nenhuma entra em `/api/config`.

| Variável | Papel |
|---|---|
| `MOCHI_TOKEN` | Senha do aparelho. A mesma string gravada no Mochi. |
| `GEMINI_API_KEY` | Chat (`gemini-3.5-flash-lite`) e TTS. Opcionais `GEMINI_API_KEY_2` … `_9` para trocar de chave em 429/5xx. |
| `GROQ_API_KEY` | Whisper `whisper-large-v3-turbo` e, se o Gemini falhar ou passar de 4 s, `openai/gpt-oss-20b`. |
| `MOCHI_TTS_MODEL` | Opcional. Padrão `gemini-3.8-flash-lite-tts`, depois `gemini-3.8-flash-tts`. |
| `MOCHI_VOICE_NAME` | Opcional. Senão `GEN_VOICE_NAME`, senão `Charon`. |
| `GEN_CHAT_PRIMARY` | Opcional. `groq` põe o Groq na frente do Gemini (no Mochi e no chat da Gen). |

A cota grátis do Gemini TTS é baixa. Sem voz, o JSON segue com `audio: null` e `meta.tts_error`.

## Código

- `api/mochi.js` — handler (`createMochiHandler` para teste)
- `lib/mochi/persona.js` — prompt do Corvo, 21 emoções, `alert`
- `lib/mochi/providers.js` — Groq STT, Gemini → Groq, Gemini TTS
- `lib/mochi/timing.js` — `timing_ms` e `Server-Timing`
- `lib/mochi/wav.js` — cabeçalho e reamostra 24 kHz → 16 kHz

`node --test test/mochi.test.mjs` cobre o 200 com WAV simulado, o 401 sem token, o prazo do Gemini travado e o parser.
