# Maquete ESP32 — GenJutsu

Espelha a casa virtual no strip WS2812B. O site publica JSON retido em `genjutsu/maquete/estado` (HiveMQ Cloud, TLS 8883 no firmware / WSS 8884 no site).

## Mapeamento do payload

O servidor monta o JSON a partir de `public.house_state` da **sessão ativa** (`app_state.current_session_code`):

| Campo MQTT | Origem em `house_state` |
|---|---|
| `version` | `version` |
| `session` | `session_id` |
| `sala.on/cor/brilho` | `lights.sala_luz` (alias `main`). `brilho` = intensity 0..1 × 255 |
| `quarto.*` | `lights.quarto_luz` (alias `lanterns`); se apagada, usa `abajur` quando ligado |
| `fita.on/cor/brilho` | `lights.fita_led` |
| `fita.efeito` | `ambience.preset`: `quiet`→`fixo`, `rain`→`pulsar`, `bamboo`→`time`, `night`→`arcoiris`. Dojo Cyber força `arcoiris`; Excêntrico força `time` |
| `fita.cores` | cor da fita; em `time`, cores da sala e do quarto |
| `tv.on` | `lights.tv.on` ou mídia tocando na TV |
| `ar.on/modo` | `lights.ar_condicionado`. `modo` = `forte` se `fan=3` ou `temp≤18`, senão `normal` |

Exemplo:

```json
{"version":7,"session":"ABC123","sala":{"on":true,"cor":"#FF1A1A","brilho":89},"quarto":{"on":false,"cor":"#FF1A1A","brilho":51},"fita":{"on":true,"efeito":"arcoiris","cores":["#7C3AED","#00FF88","#3B82F6"],"brilho":140},"tv":{"on":true},"ar":{"on":true,"modo":"forte"}}
```

A publicação só ocorre depois de um `house_state` gravado com sucesso (chat, voz, painel `/casa`, rotinas) e **nunca** quebra a API: sem `MQTT_*` ou timeout (~2 s) vira `console.warn`.

## Hardware

- ESP32 DevKit
- 1 fita WS2812B (30 LEDs sugeridos)
- Resistor 330 Ω no DIN

Ligações:

- VIN do ESP32 → 5 V da fita (USB 5 V serve para testes curtos; prefira fonte 5 V se a fita for longa)
- GND → GND
- GPIO16 → 330 Ω → DIN

Segmentos (1 LED apagado entre cada bloco): sala 0–3, gap 4, quarto 5–8, gap 9, fita 10–19, gap 20, TV 21, gap 22, ar 23, resto apagado. Edite a tabela `kMaqueteSegments` em `MaqueteMap.h`.

## Arduino IDE

1. Instale o core **esp32 by Espressif** (placa `ESP32 Dev Module`).
2. Bibliotecas: **FastLED**, **PubSubClient**, **ArduinoJson** (v7).
3. Copie `config.example.h` para `config.h` (este arquivo está no `.gitignore`) e preencha Wi‑Fi + HiveMQ.
4. Abra `esp32-maquete.ino` e grave.

O firmware usa `WiFiClientSecure.setInsecure()` (MVP: não valida o certificado). Para produção, carregue o CA da HiveMQ.

`PubSubClient` tem o buffer em 1024 bytes (`mqtt.setBufferSize(1024)`).

Brilho mestre padrão: 60 (USB).

Comportamento: conecta Wi‑Fi + MQTT, assina o tópico, aplica o retained no (re)connect, ignora `version` ≤ última (aceita versão menor se o código da sessão mudou), reconecta com backoff, loop não bloqueante para pulsar / arco-íris / cores do time. TV ligada = flicker azul suave. Ar = azul claro (`normal`) ou azul forte (`forte`).

## Teste manual no HiveMQ web client

1. Conecte no cluster (WebSocket 8884, path `/mqtt`).
2. Publique em `genjutsu/maquete/estado` com **Retain** e QoS 1, usando o JSON de exemplo acima (troque `session` se quiser).
3. A fita deve acender sala vermelha, fita em arco-íris, TV e ar azuis, quarto apagado, LEDs de gap pretos.

CLI (broker público de teste, **nunca** use o tópico de produção nem credenciais reais):

```bash
mosquitto_pub -h broker.hivemq.com -p 8883 --capath /etc/ssl/certs \
  -t "genjutsu/maquete/teste" -q 1 -r \
  -m '{"version":1,"session":"TESTE1","sala":{"on":true,"cor":"#FF1A1A","brilho":200},"quarto":{"on":false,"cor":"#000000","brilho":0},"fita":{"on":true,"efeito":"fixo","cores":["#7C3AED"],"brilho":180},"tv":{"on":false},"ar":{"on":false,"modo":"normal"}}'
```

Teste do mapeamento no host (sem placa):

```bash
g++ -std=c++17 -O2 -o /tmp/maquete-map-test hardware/esp32-maquete/test/maquete_map_test.cpp && /tmp/maquete-map-test
```
