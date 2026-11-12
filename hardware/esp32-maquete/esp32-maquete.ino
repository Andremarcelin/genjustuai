#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <FastLED.h>
#include <ESP32Servo.h>
#include <time.h>
#include "config.h"
#include "MaqueteMap.h"
#ifdef MQTT_USE_CA
#include "EmqxCa.h"
#endif

#ifndef MQTT_MAX_PACKET_SIZE
#define MQTT_MAX_PACKET_SIZE 1024
#endif

#ifndef SERVO_PIN
#define SERVO_PIN 18
#endif
#ifndef FAN_PIN
#define FAN_PIN 19
#endif
#ifndef FAN_PWM_CH
#define FAN_PWM_CH 0
#endif

CRGB leds[NUM_LEDS];
WiFiClientSecure net;
PubSubClient mqtt(net);
Servo portaServo;

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
  portaServo.write(maqueteServoDeg(st.portaAberta));
#if defined(ESP_ARDUINO_VERSION) && ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcWrite(FAN_PIN, maqueteFanDuty(st.ventiladorVel));
#else
  ledcWrite(FAN_PWM_CH, maqueteFanDuty(st.ventiladorVel));
#endif
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
    JsonObject sala = doc["sala"].as<JsonObject>();
    next.sala.on = sala["on"] | false;
    next.sala.brilho = sala["brilho"] | 0;
    maqueteParseHex(sala["cor"] | "#FF1A1A", &next.sala.r, &next.sala.g, &next.sala.b);
    JsonObject quarto = doc["quarto"].as<JsonObject>();
    next.quarto.on = quarto["on"] | false;
    next.quarto.brilho = quarto["brilho"] | 0;
    maqueteParseHex(quarto["cor"] | "#FF1A1A", &next.quarto.r, &next.quarto.g, &next.quarto.b);
    JsonObject fita = doc["fita"].as<JsonObject>();
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
    next.portaAberta = doc["porta"]["aberta"] | false;
    next.portaTrancada = doc["porta"]["trancada"] | true;
    strncpy(next.cafeEstado, doc["cafe"]["estado"] | "desligada", sizeof(next.cafeEstado) - 1);
    next.ventiladorVel = doc["ventilador"]["vel"] | 0;
  }

  if (!maqueteShouldApply(next.version, next.session, lastVersion, lastSession)) {
    Serial.printf("MQTT: ignorado v=%lu sessao=%s\n", (unsigned long)next.version, next.session);
    return;
  }
  currentState = next;
  lastVersion = next.version;
  strncpy(lastSession, next.session, sizeof(lastSession) - 1);
  Serial.printf(
    "MQTT: aplicado v=%lu sessao=%s sala=%s quarto=%s fita=%s/%s tv=%s ar=%s\n",
    (unsigned long)next.version,
    next.session,
    next.sala.on ? "on" : "off",
    next.quarto.on ? "on" : "off",
    next.fita.on ? "on" : "off",
    next.fita.efeito,
    next.tvOn ? "on" : "off",
    next.arOn ? "on" : "off"
  );
}

bool mqttConnect() {
  Serial.printf("MQTT: conectando %s:%d\n", MQTT_HOST, MQTT_PORT);
  String cid = String("maquete-") + String((uint32_t)ESP.getEfuseMac(), HEX);
  if (mqtt.connect(cid.c_str(), MQTT_USER, MQTT_PASS)) {
    mqtt.subscribe(MQTT_TOPIC, 1);
    backoffMs = 500;
    Serial.printf("MQTT: inscrito em %s\n", MQTT_TOPIC);
    return true;
  }
  char err[128] = {0};
  net.lastError(err, sizeof(err));
  Serial.printf("MQTT: falha state=%d tls=%s\n", mqtt.state(), err);
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

void waitForNtp() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  uint32_t start = millis();
  while (time(nullptr) < 1700000000 && millis() - start < 15000) {
    delay(200);
  }
  if (time(nullptr) >= 1700000000) {
    Serial.printf("NTP: ok %ld\n", (long)time(nullptr));
  } else {
    Serial.println("NTP: timeout");
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("GenJutsu maquete: iniciando");

  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(MASTER_BRIGHTNESS);
  FastLED.clear(true);

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  portaServo.setPeriodHertz(50);
  portaServo.attach(SERVO_PIN, 500, 2400);
  portaServo.write(0);
#if defined(ESP_ARDUINO_VERSION) && ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcAttach(FAN_PIN, 20000, 8);
  ledcWrite(FAN_PIN, 0);
#else
  ledcSetup(FAN_PWM_CH, 20000, 8);
  ledcAttachPin(FAN_PIN, FAN_PWM_CH);
  ledcWrite(FAN_PWM_CH, 0);
#endif

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    Serial.print("WiFi: aguardando...\n");
    delay(500);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi: ok %s\n", WiFi.localIP().toString().c_str());
    waitForNtp();
  } else {
    Serial.println("WiFi: timeout");
  }

#if defined(MQTT_INSECURE_FALLBACK)
  Serial.println("TLS: setInsecure (MQTT_INSECURE_FALLBACK)");
  net.setInsecure();
#elif defined(MQTT_USE_CA)
  Serial.println("TLS: setCACert (MQTT_USE_CA)");
  net.setCACert(EMQX_CA_CERT);
#else
  Serial.println("TLS: setInsecure");
  net.setInsecure();
#endif
  net.setHandshakeTimeout(30);
  mqtt.setBufferSize(1024);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(20);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqttConnect();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi: reconectando");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    delay(50);
  }
  ensureMqtt();
  mqtt.loop();
  applyState(currentState, millis());
  delay(20);
}
