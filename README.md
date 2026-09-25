# GenJutsu AI

Portal de perfil digital para a experiência VR. Hospedagem: **Vercel**. Auth e banco: **Supabase**. Login Google (Agenda, YouTube, Contatos, Tarefas) — sem Gmail.

Documento mestre acadêmico (CDD): [docs/GenJutsu_AI_CDD_Completo.md](docs/GenJutsu_AI_CDD_Completo.md). Gap vs este repo: [docs/architecture/gap-cdd-vs-repo.md](docs/architecture/gap-cdd-vs-repo.md).

## 1. Novo projeto Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. SQL Editor: rode [`sql/dossiers.sql`](sql/dossiers.sql) e em seguida [`sql/sessions.sql`](sql/sessions.sql) (código de sessão + resumo NFC).
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
   - `SUPABASE_ANON_KEY`
   - `GOOGLE_SITE_VERIFICATION` (opcional; token da tag HTML da Search Console para `https://genjutsuai.vercel.app/` — ver [docs/search-console-vercel.md](docs/search-console-vercel.md))
4. Deploy. A rota `/api/config` entrega essas variáveis ao site.
5. Depois do primeiro URL, atualize Site URL no Supabase, origins no Google e, se quiser, os links em `privacy.html` / `terms.html`.

## Estrutura

- `index.html` — UI, OAuth e coleta do dossiê
- `api/config.js` — Vercel Function (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- `vercel.json` — rewrites `/privacy` e `/terms`
- `sql/dossiers.sql` — tabela + RLS
- `sql/sessions.sql` — session_code, interações, conversas, resumo NFC
- `summary.html` — página pública `/s/CODIGO`
