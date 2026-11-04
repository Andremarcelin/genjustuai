# GenJutsu AI

Portal de perfil digital para a experiência VR. Hospedagem: **Vercel**. Auth e banco: **Supabase**. Login Google (Agenda, YouTube, Contatos, Tarefas) — sem Gmail.

Documento mestre acadêmico (CDD): [docs/GenJutsu_AI_CDD_Completo.md](docs/GenJutsu_AI_CDD_Completo.md). Gap vs este repo: [docs/architecture/gap-cdd-vs-repo.md](docs/architecture/gap-cdd-vs-repo.md).

## 1. Novo projeto Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. SQL Editor: rode [`sql/dossiers.sql`](sql/dossiers.sql), [`sql/sessions.sql`](sql/sessions.sql), [`sql/app_state.sql`](sql/app_state.sql), [`sql/admin_read.sql`](sql/admin_read.sql) e [`sql/profile_id.sql`](sql/profile_id.sql). Se o código de sessão já existia, rode também [`sql/freeze_session_code.sql`](sql/freeze_session_code.sql). Em um projeto que já tem as tabelas, `sql/profile_id.sql` sozinho adiciona `profile_id` sem apagar dados.
3. **Authentication → URL configuration**
   - Site URL: `https://SEU-PROJETO.vercel.app`
   - Redirect URLs: `https://SEU-PROJETO.vercel.app/**` e `https://SEU-REF.supabase.co/auth/v1/callback`
4. **Authentication → Providers → Google**: ative e cole Client ID / Secret do Google Cloud (passo 2).
5. Em **Settings → API**, copie **Project URL** e a chave **anon**.

## 2. Novo projeto Google Cloud

1. [console.cloud.google.com](https://console.cloud.google.com) → projeto novo (ex. `genjutsuai-vercel`).
2. Ative as APIs: **Google Calendar**, **YouTube Data API v3**, **People API**, **Google Tasks API**.
3. Tela de consentimento OAuth (External), em **Testing**, com usuários de teste.
4. Escopos:
   - `openid`, `email`, `profile`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/youtube.readonly`
   - `https://www.googleapis.com/auth/contacts.readonly`
   - `https://www.googleapis.com/auth/tasks.readonly`
5. Home / privacidade / termos: `https://SEU-PROJETO.vercel.app/`, `/privacy`, `/terms`.
6. Credencial **OAuth client ID → Web application**
   - Origins: `https://SEU-PROJETO.vercel.app` e `https://SEU-REF.supabase.co`
   - Redirect: `https://SEU-REF.supabase.co/auth/v1/callback`
7. Cole ID e secret no provider Google do Supabase.

`*.vercel.app` é domínio compartilhado (mesmo limite que o Netlify para verificação de marca). Use o app em **Testing**.

## 3. Deploy na Vercel

1. [vercel.com](https://vercel.com) → importar o GitHub `Andremarcelin/genjustuai`.
2. Framework: **Other**. Root: `.`
3. Environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (chave **anon / publishable** de leitura — não é a secret)
   - `ADMIN_SECRET` (opcional; senha de `/admin`; se vazio, o PIN é `genjutsu`)
4. Deploy. A rota `/api/config` entrega essas variáveis ao site.
5. Depois do primeiro URL, atualize Site URL no Supabase, origins no Google e, se quiser, os links em `privacy.html` / `terms.html`.

## Perfil ZCEA (demo Quest)

A demo Unity usa quatro perfis, não os oito arquétipos do CDD: **Zen (Z)**, **Cyber (C)**, **Excentrico (E)**, **Acolhedor (A)**.

O site continua com as duas perguntas (`clima_ambiente`: tranquilo/agitado; `clima_tempo`: quente/frio/ameno). Ao salvar, `js/zcea-profile.js` escolhe um `profile_id` e grava:

- `dossiers.profile_id` e `dossier_data.preferencias.profile_id`
- `session_summaries.profile_id`
- `session_summaries.archetype` como alias legível (`Excentrico` → `Excêntrico`)

| clima_ambiente | clima_tempo | profile_id | archetype |
|---|---|---|---|
| tranquilo | frio | Zen | Zen |
| tranquilo | quente | Acolhedor | Acolhedor |
| tranquilo | ameno | Acolhedor | Acolhedor |
| agitado | frio | Cyber | Cyber |
| agitado | ameno | Cyber | Cyber |
| agitado | quente | Excentrico | Excêntrico |

Hipótese para validar: frio e calmo é Zen; calmo com calor ou tempo ameno é Acolhedor; agitação fria ou amena é Cyber; agitação quente é Excêntrico. O QR e o código NFC não mudam.

`GET /api/session` e `GET /api/session?code=` devolvem `profile_id` junto com `session_code`, `display_name`, `personality_text` e `archetype`. Se o Supabase não resolve ou a chave não serve, a função responde JSON (`missing_config` ou `supabase_unreachable`) em vez de estourar 500. Sem sessão definida: `no_current_session`. Código sem resumo: `not_found`. O corpo não inclui URL, chave nem erro cru do Postgres.

Contrato e exemplo de `SessionGate` que lê `profile_id`: [docs/unity-session.md](docs/unity-session.md).

### Checklist manual

O deploy só passa neste fluxo depois de `SUPABASE_URL` / `SUPABASE_ANON_KEY` de um projeto que existe na Vercel e de `sql/profile_id.sql` aplicado.

1. Login Google no site (o OAuth permanece).
2. Responder as duas perguntas e salvar. A tela mostra `Perfil do Quest: Z · Zen` (ou C / E / A conforme a tabela).
3. No Supabase, a linha de `session_summaries` desse `session_code` tem `profile_id` e `archetype`. `dossiers.profile_id` e `dossier_data.preferencias` repetem o mesmo id.
4. `GET /api/session?code=CODIGO` retorna 200 com esses campos, incluindo `profile_id`.
5. `GET /api/session` sem código retorna essa sessão só depois do admin definir, ou `no_current_session`.
6. Com URL morta ou chave ausente, a resposta é 503 JSON (`supabase_unreachable` ou `missing_config`), sem vazar a chave.

## Estrutura

- `index.html` — UI, OAuth e coleta do dossiê
- `api/config.js` — Vercel Function (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- `vercel.json` — rewrites `/privacy` e `/terms`
- `sql/dossiers.sql` — tabela + RLS
- `sql/sessions.sql` — session_code, interações, conversas, resumo NFC
- `summary.html` — página pública `/s/CODIGO`
- `api/session.js` — JSON para o Unity/Quest (`profile_id` ZCEA, `?code=`)
- `js/zcea-profile.js` — mapa das duas respostas para Zen / Cyber / Excentrico / Acolhedor
- `sql/profile_id.sql` — coluna `profile_id` em `session_summaries` e `dossiers`
- [docs/unity-session.md](docs/unity-session.md) — handshake Quest 3S
