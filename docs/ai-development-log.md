# AI development log

Modelo CDD: problema, contexto, ferramenta, sugestão, alteração, teste, resultado, decisão, commit.

---

## 2026-09-21 — Versionar CDD e gap

- **Problema:** CDD existia só em Downloads; o repo não refletia as regras acadêmicas.
- **Contexto:** ExpoTech / INTELLIGENCE; seção 64 exige o CDD no GitHub.
- **Ferramenta:** Cursor.
- **Sugestão:** copiar o CDD para `docs/` e registrar o gap vs o site OAuth/Vercel.
- **Alteração:** `docs/GenJutsu_AI_CDD_Completo.md`, `docs/architecture/gap-cdd-vs-repo.md`, este log.
- **Teste:** arquivos no repo; nenhum runtime.
- **Resultado:** memória técnica versionada; implementação ML/API ainda pendente.
- **Decisão:** alinhamento documental apenas; Fase 1 continua sem VR e sem Gmail.
- **Commit:** `8cc1f53`

## 2026-11-04 — profile_id ZCEA e sessão sem crash 500

- **Problema:** `GET /api/session` estoura `FUNCTION_INVOCATION_FAILED` quando `SUPABASE_URL` não resolve. O resumo só tinha archetype “Ritmo recolhido/ativo”, e a demo Unity precisa de Zen / Cyber / Excentrico / Acolhedor.
- **Contexto:** questionário de duas perguntas já existia; OAuth Google permanece; o C# do Quest fica fora deste repo.
- **Ferramenta:** Cursor.
- **Sugestão:** erros JSON (`missing_config`, `supabase_unreachable`, `no_current_session`, `not_found`) e um mapa determinístico vibe × tempo.
- **Alteração:** `api/session.js`, `api/admin/session.js`, `js/zcea-profile.js`, `sql/profile_id.sql`, `index.html`, `docs/unity-session.md`.
- **Teste:** `node --test` nos mapas e nos handlers com `fetch` simulado. E2E no ar depende de URL/chave válidas e do SQL.
- **Resultado:** o Quest passa a ler `profile_id`; falha de DNS vira 503 JSON sem a chave.
- **Decisão:** hipótese documentada (frio+calmo = Zen; calor calmo = Acolhedor; agitação fria/amena = Cyber; agitação quente = Excêntrico), para o André validar na demo.
