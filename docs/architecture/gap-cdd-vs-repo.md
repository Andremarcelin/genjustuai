# Gap: CDD vs repositório atual

**Data:** 2026-09-21  
**Fonte:** [GenJutsu_AI_CDD_Completo.md](../GenJutsu_AI_CDD_Completo.md)  
**Repo:** site estático + Vercel `/api/config` + dossiê Supabase

O CDD é o documento mestre ExpoTech 2026.2 (UniFECAF, INTELLIGENCE). A banca avalia o pipeline científico, não o host.

## Camadas obrigatórias

```text
OAuth / questionário  → dados brutos
ML + DL              → arquétipo (8 classes)
NLP                  → intent + entidades
Context Engine       → estado da casa (JSON)
LLM + prompts        → fala do Corvo (sem I/O direto)
Unity / Quest        → experiência
ESP32 / MQTT         → maquete (opcional)
NFC                  → resumo da sessão
```

O LLM não substitui NLP e não chama ferramentas sem validação. Personalização = modelo-base + contexto, não um modelo por usuário.

## Perfil (entrada do classificador)

Features em `[0,1]`: curiosity, technology, order, comfort, energy, social, nature, privacy.

Classes: Refúgio, Sintetizador, Laboratório, Jardim Vivo, Galeria, Núcleo Social, Estúdio Criativo, Observatório.

O JSON atual (`calendar`, `youtube`, `contacts`, `tasks`, `preferencias`) **não** é esse vetor. Precisa de mapeamento documentado ou questionário expandido.

## Stack CDD vs código hoje

| CDD | Hoje |
|---|---|
| Next.js | `index.html` |
| FastAPI `/predict`, `/nlp/intent`, `/chat` | `api/config.js` |
| `experiences`, `personality_profiles`, `consent_*` | `dossiers` |
| `ml/`, `dl/`, `nlp/`, `prompts/` | ausente |
| Unity, MQTT, NFC | só copy na UI |

## Ordem até a banca (Fase 1: sem VR)

1. Consentimento registrado + features 0–1.
2. Dataset sintético + baseline + um classificador + métricas.
3. FastAPI `POST /predict` e tabelas do CDD.
4. NLP + Context Engine + `/prompts`.
5. Unity na API; IoT/NFC se houver tempo.

Não recolocar Gmail. Não treinar LLM. Não deixar a Unity decidir o arquétipo.
