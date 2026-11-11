#pragma once

#define WIFI_SSID "SUA_REDE"
#define WIFI_PASS "SUA_SENHA"

// EMQX Cloud Serverless (TLS 8883). Qualquer broker MQTT/TLS serve.
#define MQTT_HOST "xxxxxxxx.ala.re-south-1.emqxsl.com"
#define MQTT_PORT 8883
#define MQTT_USER "emqx-user"
#define MQTT_PASS "emqx-pass"
#define MQTT_TOPIC "genjutsu/maquete/estado"

// Sem isto o firmware usa WiFiClientSecure.setInsecure() (MVP).
// Descomente para validar o certificado com DigiCert Global Root G2 (EMQX Serverless).
// #define MQTT_USE_CA

#define NUM_LEDS 30
#define DATA_PIN 16
#define MASTER_BRIGHTNESS 60
