# Maquete ESP32 — GenJutsu

Espelha a casa virtual no strip WS2812B. O site publica JSON retido em `genjutsu/maquete/estado`. O broker de referência é **EMQX Cloud Serverless**; qualquer broker MQTT (TLS/WSS) funciona.

- Site: `MQTT_URL` no formato `wss://<host>:8084/mqtt` (EMQX Serverless) + `MQTT_USERNAME` / `MQTT_PASSWORD`.
- Firmware: `MQTT_HOST` + porta **8883** (TLS). O Serverless da EMQX exige TLS e usuário/senha.

## Passo a passo (EMQX Cloud Serverless)

1. Crie um deployment Serverless em [EMQX Cloud](https://www.emqx.com/en/cloud) e um usuário MQTT (não use a senha da conta web).
2. Anote o host. No site (Vercel): `MQTT_URL=wss://<host>:8084/mqtt`, `MQTT_USERNAME`, `MQTT_PASSWORD`. Tópico opcional: `MQTT_TOPIC=genjutsu/maquete/estado`.
3. No ESP32, copie `config.example.h` para `config.h` e preencha `MQTT_HOST`, `MQTT_PORT` 8883, usuário e senha.
4. Grave o sketch. Por padrão `#define MQTT_USE_CA` valida o certificado (DigiCert Global Root G2 + Root CA). Só use `MQTT_INSECURE_FALLBACK` para diagnóstico.
5. Teste no console WebSocket da EMQX: publique o JSON de exemplo abaixo com **Retain** e QoS 1 no tópico `genjutsu/maquete/estado`.

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
| `porta.aberta/trancada` | `lights.porta` |
| `cafe.estado` | `lights.cafe.estado`: `desligada` \| `preparando` \| `pronta` |
| `ventilador.vel` | `lights.ventilador.vel` 0..3 |

Exemplo:

```json
{"version":7,"session":"ABC123","sala":{"on":true,"cor":"#FF1A1A","brilho":89},"quarto":{"on":false,"cor":"#FF1A1A","brilho":51},"fita":{"on":true,"efeito":"arcoiris","cores":["#7C3AED","#00FF88","#3B82F6"],"brilho":140},"tv":{"on":true},"ar":{"on":true,"modo":"forte"},"porta":{"aberta":false,"trancada":true},"cafe":{"estado":"desligada"},"ventilador":{"vel":0}}
```

A publicação só ocorre depois de um `house_state` gravado com sucesso (chat, voz, painel `/casa`, rotinas) e **nunca** quebra a API: sem `MQTT_*` ou timeout (~2 s) vira `console.warn`.

## Hardware

- ESP32 DevKit
- 1 fita WS2812B (30 LEDs sugeridos)
- Resistor 330 Ω no DIN
- Servo SG90 (porta)
- Mini motor 5 V + transistor NPN (2N2222 ou TIP120) + diodo 1N4007 (flyback) + resistor ~1 kΩ na base

Ligações:

- VIN do ESP32 → 5 V da fita (USB 5 V serve para testes curtos; prefira fonte 5 V se a fita for longa)
- GND → GND (comum com servo, motor e transistor)
- GPIO16 → 330 Ω → DIN da fita
- GPIO18 → sinal do SG90; 5 V e GND do servo na fonte
- GPIO19 → 1 kΩ → base do NPN; emissor no GND; coletor no polo negativo do motor; polo positivo do motor em 5 V; 1N4007 em paralelo com o motor (cátodo no 5 V)

Segmentos (1 LED apagado entre cada bloco): sala 0–3, gap 4, quarto 5–8, gap 9, fita 10–19, gap 20, TV 21, gap 22, ar 23, gap 24, porta/tranca 25, gap 26, café 27, gap 28, ventilador 29. Edite a tabela `kMaqueteSegments` em `MaqueteMap.h`. Diagrama: `docs/maquete-ligacoes-v2.svg`.

ASCII:

```
5V ----+---- fita VIN ---- servo VCC ---- motor +
       |                                      |
      ESP32 VIN                          1N4007 (cátodo aqui)
       |                                      |
GND ---+---- fita GND ---- servo GND ---- motor − ---- coletor NPN
       |                                              |
    GPIO16 --330Ω-- DIN                          emissor → GND
    GPIO18 -------- servo sinal                  base ← 1kΩ ← GPIO19
```

Servo: 0° fechada, 90° aberta. LED 25 vermelho = trancada, verde = destrancada. Café 27 laranja pulsa em `preparando`, sólido em `pronta`. Ventilador: PWM 0/40/70/100% no GPIO19 + LED 29 com brilho girando.

## Arduino IDE

1. Instale o core **esp32 by Espressif** (placa `ESP32 Dev Module`).
2. Bibliotecas: **FastLED**, **PubSubClient**, **ArduinoJson** (v7), **ESP32Servo**.
3. Copie `config.example.h` para `config.h` (este arquivo está no `.gitignore`) e preencha Wi‑Fi + host MQTT.
4. Abra `esp32-maquete.ino` e grave.

`PubSubClient` tem o buffer em 1024 bytes (`mqtt.setBufferSize(1024)`). Brilho mestre padrão: 60 (USB).

Comportamento: conecta Wi‑Fi + MQTT, assina o tópico, aplica o retained no (re)connect, ignora `version` ≤ última (aceita versão menor se o código da sessão mudou), reconecta com backoff, loop não bloqueante para pulsar / arco-íris / cores do time. TV ligada = flicker azul suave. Ar = azul claro (`normal`) ou azul forte (`forte`).

## Teste manual

No console WebSocket da EMQX (`wss://<host>:8084/mqtt`, usuário/senha do deployment):

1. Publique em `genjutsu/maquete/estado` com **Retain** e QoS 1, usando o JSON de exemplo (troque `session` se quiser).
2. A fita deve acender sala vermelha, fita em arco-íris, TV e ar azuis, quarto apagado, LEDs de gap pretos.

CLI contra um broker público de teste (sem credenciais reais, tópico descartável):

```bash
mosquitto_pub -h broker.emqx.io -p 8883 --capath /etc/ssl/certs \
  -t "genjutsu/maquete/teste" -q 1 -r \
  -m '{"version":1,"session":"TESTE1","sala":{"on":true,"cor":"#FF1A1A","brilho":200},"quarto":{"on":false,"cor":"#000000","brilho":0},"fita":{"on":true,"efeito":"fixo","cores":["#7C3AED"],"brilho":180},"tv":{"on":false},"ar":{"on":false,"modo":"normal"},"porta":{"aberta":false,"trancada":true},"cafe":{"estado":"desligada"},"ventilador":{"vel":0}}'
```

Teste do mapeamento no host (sem placa):

```bash
g++ -std=c++17 -O2 -o /tmp/maquete-map-test hardware/esp32-maquete/test/maquete_map_test.cpp && /tmp/maquete-map-test
```
