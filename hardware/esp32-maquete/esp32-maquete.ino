#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <FastLED.h>
#include "config.h"
#include "MaqueteMap.h"

#ifndef MQTT_MAX_PACKET_SIZE
#define MQTT_MAX_PACKET_SIZE 1024
#endif

CRGB leds[NUM_LEDS];
WiFiClientSecure net;
PubSubClient mqtt(net);

MaqueteState currentState;
uint32_t lastVersion = 0;
char lastSession[16] = {0};
uint32_t lastReconnectMs = 0;
uint32_t backoffMs = 500;
char mqttBuf[1024];

void applyState(const MaqueteState& st, uint32_t nowMs) {
  MaqueteRgb mapped[MAQUETE_NUM_LEDS];
  uint16_t n = NUM_LEDS < MAQUETE_NUM_LEDS ? NUM_LEDS : MAQUETE_NUM_LEDS;
  maqueteRender(st, mapped, n, nowMs, MASTER_BRIGHTNESS);
  for (uint16_t i = 0; i < n; ++i) {
    leds[i] = CRGB(mapped[i].r, mapped[i].g, mapped[i].b);
  }
  for (int i = n; i < NUM_LEDS; ++i) leds[i] = CRGB::Black;
  FastLED.show();
}

void onMessage(char* topic, byte* payload, unsigned int length) {
  if (length >= sizeof(mqttBuf)) length = sizeof(mqttBuf) - 1;
  memcpy(mqttBuf, payload, length);
  mqttBuf[length] = 0;

  MaqueteState next;
  if (!maqueteParsePayload(mqttBuf, &next)) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, mqttBuf);
    if (err) return;
    next.version = doc["version"] | 0;
    const char* session = doc["session"] | "";
    strncpy(next.session, session, sizeof(next.session) - 1);
    auto sala = doc["sala"];
    next.sala.on = sala["on"] | false;
    next.sala.brilho = sala["brilho"] | 0;
    maqueteParseHex(sala["cor"] | "#FF1A1A", &next.sala.r, &next.sala.g, &next.sala.b);
    auto quarto = doc["quarto"];
    next.quarto.on = quarto["on"] | false;
    next.quarto.brilho = quarto["brilho"] | 0;
    maqueteParseHex(quarto["cor"] | "#FF1A1A", &next.quarto.r, &next.quarto.g, &next.quarto.b);
    auto fita = doc["fita"];
    next.fita.on = fita["on"] | false;
    next.fita.brilho = fita["brilho"] | 0;
    strncpy(next.fita.efeito, fita["efeito"] | "fixo", sizeof(next.fita.efeito) - 1);
    next.fita.corCount = 0;
    JsonArray cores = fita["cores"].as<JsonArray>();
    if (!cores.isNull()) {
      for (JsonVariant v : cores) {
        if (next.fita.corCount >= 4) break;
        MaqueteRgb c;
        if (maqueteParseHex(v.as<const char*>(), &c.r, &c.g, &c.b)) {
          next.fita.cores[next.fita.corCount++] = c;
        }
      }
    }
    next.tvOn = doc["tv"]["on"] | false;
    next.arOn = doc["ar"]["on"] | false;
    strncpy(next.arModo, doc["ar"]["modo"] | "normal", sizeof(next.arModo) - 1);
  }

  if (!maqueteShouldApply(next.version, next.session, lastVersion, lastSession)) return;
  currentState = next;
  lastVersion = next.version;
  strncpy(lastSession, next.session, sizeof(lastSession) - 1);
}

bool mqttConnect() {
  String cid = String("maquete-") + String((uint32_t)ESP.getEfuseMac(), HEX);
  if (mqtt.connect(cid.c_str(), MQTT_USER, MQTT_PASS)) {
    mqtt.subscribe(MQTT_TOPIC, 1);
    backoffMs = 500;
    return true;
  }
  return false;
}

void ensureMqtt() {
  if (mqtt.connected()) return;
  uint32_t now = millis();
  if (now - lastReconnectMs < backoffMs) return;
  lastReconnectMs = now;
  if (!mqttConnect()) {
    if (backoffMs < 15000) backoffMs *= 2;
  }
}

void setup() {
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(MASTER_BRIGHTNESS);
  FastLED.clear(true);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(200);
  }

  net.setInsecure();
  mqtt.setBufferSize(1024);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqttConnect();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    delay(50);
  }
  ensureMqtt();
  mqtt.loop();
  applyState(currentState, millis());
  delay(20);
}
