# GenJutsu AI

Aplicação para demonstração e análise de rastros digitais (Gmail, Google Agenda e YouTube) usando Supabase Auth e Netlify Functions.

## Configuração do Ambiente no Netlify

Para que o GenJutsu AI funcione corretamente no Netlify, é necessário configurar as variáveis de ambiente do Supabase:

### 1. Obter as credenciais no Supabase
1. Acesse o painel do seu projeto no [Supabase](https://supabase.com).
2. Vá em **Project Settings** > **API**.
3. Copie:
   - **Project URL** (`SUPABASE_URL`)
   - **Project API Keys** > `anon` / `public` (`SUPABASE_ANON_KEY`)

### 2. Configurar variáveis no Netlify
1. No painel do seu site no Netlify, vá em **Site configuration** > **Environment variables**.
2. Adicione as duas variáveis:
   - `SUPABASE_URL`: URL do seu projeto Supabase (ex: `https://xxx.supabase.co`)
   - `SUPABASE_ANON_KEY`: chave anônima pública do Supabase
3. Garanta que o escopo inclua **All scopes** ou **Runtime / Functions**.
4. Faça o deploy do site. A função `netlify/functions/config.mjs` disponibilizará essas variáveis no endpoint `/api/config`.

### 3. Configuração do Google OAuth no Supabase
1. No painel do Supabase, acesse **Authentication** > **Providers** > **Google**.
2. Ative o provedor Google e insira o `Client ID` e `Client Secret` do Google Cloud Console.
3. Certifique-se de adicionar a URL de redirecionamento fornecida pelo Supabase nas credenciais do Google Cloud.
4. No Google Cloud Console, habilite as seguintes APIs:
   - Gmail API (`https://www.googleapis.com/auth/gmail.readonly`)
   - Google Calendar API (`https://www.googleapis.com/auth/calendar.readonly`)
   - YouTube Data API v3 (`https://www.googleapis.com/auth/youtube.readonly`)

## Estrutura do Projeto

- `index.html`: Interface visual do GenJutsu AI com suporte a fallback de configuração e visualização do dossiê.
- `netlify/functions/config.mjs`: Função serverless do Netlify que entrega a URL e a Anon Key do Supabase de forma segura.
- `netlify.toml`: Configuração de build, diretório de funções e redirecionamentos.
