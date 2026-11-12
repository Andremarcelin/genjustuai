#pragma once

#define WIFI_SSID "SUA_REDE"
#define WIFI_PASS "SUA_SENHA"

// EMQX Cloud Serverless (TLS 8883). Qualquer broker MQTT/TLS serve.
#define MQTT_HOST "xxxxxxxx.ala.re-south-1.emqxsl.com"
#define MQTT_PORT 8883
#define MQTT_USER "emqx-user"
#define MQTT_PASS "emqx-pass"
#define MQTT_TOPIC "genjutsu/maquete/estado"

// Valida o certificado com DigiCert Global Root G2 + Root CA (EmqxCa.h).
#define MQTT_USE_CA
// Só para diagnóstico se o TLS com CA falhar.
// #define MQTT_INSECURE_FALLBACK

#define NUM_LEDS 30
#define DATA_PIN 16
#define SERVO_PIN 18
#define FAN_PIN 19
#define MASTER_BRIGHTNESS 60
