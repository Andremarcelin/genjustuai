# GenJutsu AI

Portal da Smart Home Cognitiva para a experiência no Meta Quest 3S. Hospedagem: **Vercel**. Auth e banco: **Supabase**.

Dois caminhos com o mesmo peso:

1. **Continuar com Google** — OAuth com agenda, YouTube, contatos e tarefas (sem Gmail). Sincroniza o rastro e segue para a casa.
2. **Continuar sem conta** — `sb.auth.signInAnonymously()`. Não chama Calendar, YouTube, Contacts nem Tasks. O nome público é `Visitante` + código da sessão, o e-mail fica vazio e o avatar é [`assets/guest-avatar.jpg`](assets/guest-avatar.jpg).

Microsoft aparece só como “ou Microsoft”, fora desse par.

O questionário grava `display_name` e `archetype` nos dois caminhos. O Quest já lê esses campos. A casa escolhida vira a letra:

| Letra | Casa | Clima | Paleta |
| --- | --- | --- | --- |
| Z | Zen | tranquilo | fria |
| C | Acolhedora | tranquilo | quente |
| E | Elétrica | dinâmico | fria |
| A | Ardente | dinâmico | quente |

Documento mestre acadêmico (CDD): [docs/GenJutsu_AI_CDD_Completo.md](docs/GenJutsu_AI_CDD_Completo.md). Gap vs este repo: [docs/architecture/gap-cdd-vs-repo.md](docs/architecture/gap-cdd-vs-repo.md).

## 1. Novo projeto Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. SQL Editor: rode [`sql/dossiers.sql`](sql/dossiers.sql), [`sql/sessions.sql`](sql/sessions.sql), [`sql/app_state.sql`](sql/app_state.sql) e [`sql/admin_read.sql`](sql/admin_read.sql). Se o código de sessão já existia, rode também [`sql/freeze_session_code.sql`](sql/freeze_session_code.sql).
3. **Authentication → URL configuration**
   - Site URL: `https://SEU-PROJETO.vercel.app`
   - Redirect URLs: `https://SEU-PROJETO.vercel.app/**` e `https://SEU-REF.supabase.co/auth/v1/callback`
4. **Authentication → Providers → Google**: ative e cole Client ID / Secret do Google Cloud (passo 2).
5. **Authentication → Providers → Anonymous**: ative **Anonymous sign-ins**. Sem isso, “Continuar sem conta” falha. O usuário anônimo entra no papel `authenticated` com `auth.uid()` preenchido — não é o papel `anon` da chave pública. As políticas `auth.uid() = user_id` e o `grant execute` de `genjutsu_ensure_session()` para `authenticated` já aceitam esse usuário. Rode [`sql/anonymous_auth.sql`](sql/anonymous_auth.sql) só para reafirmar os grants; não conceda a função ao papel `anon`.
6. Em **Settings → API**, copie **Project URL** e a chave **anon**.

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

## Estrutura

- `index.html` — landing, jornada e o fork Google / visitante
- `site.css`, `portal.css` — visual (carvão, vermelho contido, Cinzel nos títulos, Inter no corpo)
- `js/personality.js` — nome, e-mail, avatar e texto do resumo (visitante não ganha frase de agenda)
- `js/portal.js` — OAuth, `signInAnonymously` e gravação no Supabase
- `api/config.js` — Vercel Function (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- `vercel.json` — rewrites `/privacy`, `/terms`, `/admin` e `/s/:code`
- `sql/dossiers.sql` — tabela + RLS
- `sql/sessions.sql` — session_code, interações, conversas, resumo NFC, `genjutsu_ensure_session`
- `sql/anonymous_auth.sql` — grants reafirmados para o papel `authenticated` (inclui anônimo)
- `summary.html` — página pública `/s/CODIGO`
- `admin.html` — escolha da sessão do Quest
- `api/session.js` — JSON para o Unity/Quest (`?code=`)
- [docs/unity-session.md](docs/unity-session.md) — handshake Quest 3S

O resumo do visitante descreve só clima e casa. A frase “N evento(s) de agenda…” só entra quando a fonte do dossiê é Google.

`node test/personality.test.js` confere o nome `Visitante` + código, o e-mail vazio e a ausência dessa frase.
