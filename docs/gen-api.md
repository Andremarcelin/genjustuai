# Gen — contrato para o Unity (fase 1)

A Gen fala com a pessoa da sessão ativa e mexe na casa por ferramentas. O Quest não recebe `GEMINI_API_KEY` nem `GROQ_API_KEY`. `GET /api/session` não muda: o formato continua o de [unity-session.md](unity-session.md).

Base: `https://genjutsuai.vercel.app`

`profile_id` (Zen, Cyber, Excentrico, Acolhedor) só muda pelo questionário e pelo admin. `switch_dojo` muda a cena visual (`mode` e `dojo`), nunca o perfil.

## Estado da casa

`GET /api/house/state`

Sessão ativa, com ou sem linha gravada ainda (200):

```json
{
  "state": {
    "session_id": "AB3K7Q",
    "version": 0,
    "mode": "hub",
    "dojo": null,
    "lights": {
      "main": { "intensity": 0.35, "color": "#FF1A1A" },
      "lanterns": { "intensity": 0.2, "color": "#FF1A1A" },
      "sala_luz": { "on": true, "color": "#FF1A1A", "intensity": 0.35 },
      "quarto_luz": { "on": false, "color": "#FF1A1A", "intensity": 0.2 },
      "abajur": { "on": false, "color": "#FFAA00", "intensity": 0.45 },
      "fita_led": { "on": false, "color": "#7C3AED", "intensity": 0.55 },
      "tv": { "on": false, "color": "#3B82F6", "intensity": 0.7 },
      "ambiente": { "on": false, "color": "#FF1A1A", "intensity": 0.3 }
    },
    "ambience": { "preset": "quiet", "volume": 0.15 },
    "media": null,
    "updated_at": null
  }
}
```

`version` 0 e `updated_at` null significam o hub padrão, ainda sem gravação (ou a tabela ainda não existe). Depois de um comando aceito, `version` sobe e `updated_at` vem em ISO-8601.

Sem sessão ativa (200, não é erro):

```json
{ "state": null }
```

Depois de `set_lights` ou `set_ambience`, o objeto da zona (ou o ambience) pode incluir `transition_ms`. Isso não é um campo novo na raiz.

```json
"lights": {
  "main": { "intensity": 0.8, "color": "#FF1A1A", "transition_ms": 800 },
  "lanterns": { "intensity": 0.2, "color": "#FF1A1A" }
}
```

`switch_dojo` grava `mode: "dojo"` e `dojo`. O `transition_ms` desse comando fica nos args de quem chamou. Quem só escuta o realtime anima a troca de dojo em 4000 ms.

| `mode` | `dojo` |
|---|---|
| `hub` | `null` |
| `dojo` | `Zen`, `Cyber`, `Excentrico` ou `Acolhedor` |

Presets de ambiência: `quiet`, `rain`, `bamboo`, `night`. Volume de 0 a 0.5. Cor `#RRGGBB`. Intensidade de 0 a 1.

### Dispositivos (Casa / Unity)

`lights.main` e `lights.lanterns` **continuam o contrato do Quest**. Não quebre o parse antigo.

Os device ids abaixo vivem no mesmo jsonb. Quem ainda só lê `main`/`lanterns` ignora o resto. Aliases:

| device_id | alias Quest | cômodo | Unity (sugerido) |
|---|---|---|---|
| `sala_luz` | `main` (`intensity` 0 quando `on` é false) | Sala | `Lights/Sala/Main.color` |
| `quarto_luz` | `lanterns` | Quarto | `Lights/Quarto/Ceiling` |
| `abajur` | — | Quarto | `Lights/Quarto/Abajur` |
| `fita_led` | — | Sala | LEDStrip emissive |
| `tv` | — | Sala | Props/TV emissive |
| `ambiente` | `ambience.volume` 0 quando `on` é false | Casa | Audio + color grade |

Cada dispositivo: `{ "on": boolean, "color": "#RRGGBB", "intensity": 0..1 }`.

`POST /api/house/device` (Bearer do visitante, ou sessão ativa do Quest):

```json
{ "device_id": "sala_luz", "on": true, "color": "#FF1A1A", "intensity": 0.85 }
```

SQL extra: [`sql/house_devices.sql`](../sql/house_devices.sql) depois de `sql/house_state.sql`. RLS: só o dono lê a linha; a API grava com service role. O Quest segue no `GET /api/house/state` e no broadcast `house_state_changed`.

## Realtime

Canal: `house:<session_id>` (o mesmo `id` de `GET /api/session`).

Evento: `house_state_changed`.

O broadcast é público (`private: false` no banco e no cliente). Os dois lados precisam concordar; se o cliente entrar num canal privado, a mensagem não chega.

Payload, o mesmo objeto `state`, sem nome e sem questionário:

```json
{
  "session_id": "AB3K7Q",
  "version": 3,
  "mode": "dojo",
  "dojo": "Zen",
  "lights": {
    "main": { "intensity": 0.35, "color": "#FF1A1A" },
    "lanterns": { "intensity": 0.2, "color": "#FF1A1A" }
  },
  "ambience": { "preset": "quiet", "volume": 0.15 },
  "media": null,
  "updated_at": "2026-11-06T23:50:00.000Z"
}
```

Cliente (supabase-js):

```javascript
supabase.channel("house:" + sessionId, { config: { private: false } })
  .on("broadcast", { event: "house_state_changed" }, (message) => {
    const state = message.payload;
  })
  .subscribe();
```

Ignore um `version` menor do que o último aplicado.

### Polling

Se o canal não ficar `SUBSCRIBED` (ou cair), faça `GET /api/house/state` a cada 2 segundos. A landing faz isso. O primeiro GET também serve para pintar o estado antes do próximo broadcast. Continue lendo `GET /api/session` para saber quando o `session_id` trocou ou virou null: aí saia do canal antigo.

Encerrar a sessão no admin (`sql/house_state.sql`) devolve essa casa ao hub e emite o broadcast. O poll de `GET /api/session` passa a `{ "session": null }`.

## Comandos

`POST /api/gen/commands`

```json
{ "tool": "set_lights", "args": { "zone": "main", "intensity": 0.8, "color": "#FF1A1A", "transition_ms": 800 } }
```

Aceito (200):

```json
{
  "status": "accepted",
  "state": { "session_id": "AB3K7Q", "version": 4, "mode": "hub", "dojo": null, "lights": {}, "ambience": {}, "updated_at": "2026-11-06T23:51:00.000Z" }
}
```

Recusado (200). `state` é o estado atual, sem a mudança:

```json
{ "status": "rejected", "reason": "invalid_args", "state": { "session_id": "AB3K7Q", "version": 4 } }
```

`reason`: `unknown_tool`, `invalid_args`, `rate_limited`, `conflict`.

Números podem ir como number ou string numérica. Chave extra é `invalid_args` (`additionalProperties: false`).

### Ferramentas

| tool | args | efeito |
|---|---|---|
| `get_house_state` | `{}` | lê. Não sobe `version`. |
| `list_devices` | `{}` | lê dispositivos. Não sobe `version`. |
| `set_device` | `device_id`, `on`?, `color`?, `intensity`? | pinta/liga um device e sincroniza `main`/`lanterns` quando for o caso. |
| `set_lights` | `zone` `main`\|`lanterns`, `intensity` 0..1, `color` `#RRGGBB`, `transition_ms` 300..5000 | uma zona. A outra fica. |
| `set_ambience` | `preset` `quiet`\|`rain`\|`bamboo`\|`night`, `volume` 0..0.5, `transition_ms` 500..5000 | som. |
| `switch_dojo` | `dojo` `Zen`\|`Cyber`\|`Excentrico`\|`Acolhedor`, `transition_ms` 2000..8000 | `mode` passa a `dojo`. Não grava `profile_id`. |
| `play_music` | `query`?, `mood`? | resolve MP3 livre (Jamendo se `JAMENDO_CLIENT_ID` no servidor, senão Internet Archive). Grava `state.media`, liga `tv`. |
| `open_video` | `query` | MP4 livre no Archive. Liga `tv`. Sem YouTube. |
| `stop_media` | `{}` | `media.playing` false. |
| `web_search` | `query` | DuckDuckGo Instant Answer. Não muda a casa. |

`state.media`:

```json
{
  "type": "audio",
  "url": "https://archive.org/download/…/track.mp3",
  "title": "Acoustic guitar evening",
  "artist": "Internet Archive",
  "license": "CC BY",
  "device": "tv",
  "playing": true,
  "updated_at": "2026-11-09T02:00:00.000Z"
}
```

URL só `https` em `archive.org` ou `jamendo.com`. O Quest / `/casa` tocam o mesmo objeto. Ligar `ambiente` puxa a playlist ZCEA (Zen lo-fi/shakuhachi, Cyber synthwave, Excentrico jazz, Acolhedor acústico). `POST /api/house/media` no site: `{ "playing": false }` ou `{ "stop": true }` ou `{ "action": "play_music", "query": "jazz" }`. SQL: [`sql/house_media.sql`](../sql/house_media.sql).

Limite: 20 mutações por sessão a cada 60 s. Leitura tem o mesmo teto, separado. Acima disso, `rejected` / `rate_limited`.

A Gen só pode dizer que a casa mudou depois de `status: "accepted"`.

## Voz ao vivo (Gemini)

`POST /api/gen/voice-session` sem corpo.

200:

```json
{
  "provider": "gemini",
  "model": "gemini-3.8-live",
  "token": "<ephemeral>",
  "expiresAt": "2026-11-06T23:55:00.000Z",
  "wsUrl": "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=<ephemeral>",
  "systemInstruction": "Você é Gen...",
  "voiceName": "Charon",
  "tools": [
    {
      "name": "set_lights",
      "description": "...",
      "parameters": { "type": "object", "additionalProperties": false, "properties": {}, "required": [] }
    }
  ]
}
```

O token é o ephemeral token da Live API (`v1beta`, `uses: 1`). `expiresAt` é o fim da sessão (10 minutos). A conexão nova tem de abrir em até 60 segundos (`newSessionExpireTime`). Abra `wsUrl` como está. O mesmo segredo vai em `token`. Alternativa de header: `Authorization: Token <token>`. Não use a API key permanente.

Modelo no setup: `models/gemini-3.8-live`. O token já trava setup, instrução, ferramentas e modalidade `AUDIO`. A voz é `voiceName` (padrão `Charon`, ou `GEN_VOICE_NAME` no servidor), em `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`, com `languageCode` `pt-BR`. A primeira mensagem do socket ainda é `setup` e deve repetir essa voz; se o servidor ignorar o setup do cliente, vale o que foi travado no token.

Áudio de ida: PCM 16-bit little-endian, 16 kHz, mono, base64.

```json
{ "realtimeInput": { "audio": { "mimeType": "audio/pcm;rate=16000", "data": "<base64>" } } }
```

Fim do aperto do botão: `{ "realtimeInput": { "audioStreamEnd": true } }`.

Áudio de volta: `serverContent.modelTurn.parts[].inlineData.data`, PCM 16-bit, 24 kHz. Legendas em `inputTranscription.text` e `outputTranscription.text`.

Quando chegar `toolCall.functionCalls[]`, execute no servidor e devolva o resultado. Não aplique a casa só no headset.

```json
{ "toolResponse": { "functionResponses": [
  { "id": "call-1", "name": "set_lights", "response": { "status": "accepted", "reason": null, "state": {} } }
] } }
```

Texto pelo mesmo socket, se ele estiver aberto:

```json
{ "clientContent": { "turns": [{ "role": "user", "parts": [{ "text": "deixa mais escuro" }] }], "turnComplete": true } }
```

## Fallback Groq

`POST /api/gen/chat`

JSON `{ "text": "deixa mais escuro" }` ou `multipart/form-data` com o arquivo no campo `audio` (wav, webm, ou mp4/m4a que o celular gravar). O servidor transcreve com `whisper-large-v3-turbo` (`language=pt`) e responde com `openai/gpt-oss-20b` e as mesmas ferramentas. Quem executa a ferramenta é o mesmo executor de `/api/gen/commands`.

200:

```json
{
  "transcript": "deixa mais escuro",
  "reply_text": "Pronto. A luz principal baixou.",
  "actions": [
    {
      "tool": "set_lights",
      "args": { "zone": "main", "intensity": 0.2, "color": "#FF1A1A", "transition_ms": 800 },
      "status": "accepted",
      "reason": null
    }
  ],
  "state": { "session_id": "AB3K7Q", "version": 5, "mode": "hub", "dojo": null, "lights": {}, "ambience": {}, "updated_at": "2026-11-06T23:52:00.000Z" }
}
```

Não há áudio na resposta. Quem quiser ouvir usa TTS no cliente (`speechSynthesis`, `pt-BR` na página `/gen`, voz masculina se existir, senão pitch 0.85).

Áudio vazio: `transcript` "" e `reply_text` "Não ouvi nada. Pode repetir?".

Pedido claro que já está no estado atual: `actions` pode vir vazio e `reply_text` confirma, em palavras, que a casa já está assim. Isso só acontece se cada aspecto pedido (família quente ou azul, brilho, preset) já bater. Se não bater e o modelo não chamar ferramenta, o servidor aplica a mudança (quente `#FFAA00`, azul `#00BFFF`, preset pelo nome) e a fala não traz código de cor. Transcrição vazia continua "Pode repetir?". O `systemInstruction` do token ao vivo inclui o estado em palavras e manda chamar a ferramenta quando o pedido diferir.

## Erros

JSON `{ "error": "..." }`. Sem URL, chave ou corpo do provedor.

| HTTP | error | Quando |
|---|---|---|
| 409 | `no_active_session` | `/api/gen/*` sem sessão ativa. `/api/house/state` não usa este código: devolve `{ "state": null }`. |
| 400 | `invalid_request` | corpo que não é `{ tool, args }` nem `{ text }`. |
| 400 | `invalid_audio` | arquivo ausente ou tipo fora de wav, webm, mp4, m4a, mpeg, ogg. |
| 413 | `audio_too_large` | acima de 8 MB. |
| 429 | `rate_limited` | token ao vivo ou `/api/gen/chat` demais. No comando, o limite vem como 200 `status: rejected`. |
| 502 | `need_sql` | falta `sql/house_state.sql` no Supabase. |
| 502 | `provider_unreachable` | Gemini ou Groq não responderam. `provider` diz qual. |
| 503 | `missing_config` | falta `SUPABASE_*`, `GEMINI_API_KEY` ou `GROQ_API_KEY` no servidor. |
| 503 | `db_permission_denied` | o Postgres recusou EXECUTE (42501), em geral funções de CHECK em `genjutsu_internal` sem grant para `service_role`. |
| 405 | `method_not_allowed` | método errado. |

## O que a página `/gen` faz

Celular, push-to-talk. Primeiro pede o token e fala pelo WebSocket (microfone via AudioWorklet, playback do PCM). Se o token ou o socket falhar, grava e chama `/api/gen/chat`, e lê `reply_text` com `speechSynthesis` em `pt-BR`. A caixa de texto usa o socket quando ele está aberto e o chat quando não está. A landing escuta `house:<id>` e, se o realtime não conectar, faz poll de `/api/house/state` a cada 2 s. O véu do hero segue a cor e a intensidade de `lights.main`, o brilho das lanternas e o dojo. `prefers-reduced-motion` tira transição e animação; a cor continua.

## SQL

Aplicar à mão, no projeto `ahzsvjimyfzjcfuhgdgw`, depois de `sql/session_lifecycle.sql`: [`sql/house_state.sql`](../sql/house_state.sql), [`sql/house_devices.sql`](../sql/house_devices.sql) e [`sql/house_media.sql`](../sql/house_media.sql). Este repositório não aplica a migração. Sem o primeiro, comando de casa responde `need_sql`. Sem o segundo, `main`/`lanterns` ainda funcionam; os device ids entram na leitura via normalização no servidor. Sem o terceiro, `media` fica `null` e a API ignora a coluna. Sem o grant de `service_role` nas funções de CHECK (`house_devices.sql` e `house_media.sql`), a escrita responde `db_permission_denied`.

Variáveis só de servidor: `GEMINI_API_KEY`, `GROQ_API_KEY`, `SUPABASE_SERVICE_ROLE` para gravar a casa, e opcional `JAMENDO_CLIENT_ID` (nunca no cliente). A anon key continua pública em `/api/config` e não escreve nessas tabelas.
