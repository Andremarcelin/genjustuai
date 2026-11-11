#include <cassert>
#include <cstdio>
#include <cstring>
#include "../MaqueteMap.h"

static void expectOff(const MaqueteRgb& c, const char* where) {
  if (c.r != 0 || c.g != 0 || c.b != 0) {
    std::fprintf(stderr, "expected off at %s, got %u,%u,%u\n", where, c.r, c.g, c.b);
    assert(false);
  }
}

int main() {
  const char* json =
    "{\"version\":7,\"session\":\"ABC123\",\"sala\":{\"on\":true,\"cor\":\"#FF1A1A\",\"brilho\":255},"
    "\"quarto\":{\"on\":false,\"cor\":\"#00AAFF\",\"brilho\":51},"
    "\"fita\":{\"on\":true,\"efeito\":\"arcoiris\",\"cores\":[\"#7C3AED\"],\"brilho\":255},"
    "\"tv\":{\"on\":true},\"ar\":{\"on\":true,\"modo\":\"forte\"}}";

  MaqueteState st;
  assert(maqueteParsePayload(json, &st));
  assert(st.version == 7);
  assert(std::strcmp(st.session, "ABC123") == 0);
  assert(st.sala.on);
  assert(st.sala.r == 0xFF && st.sala.g == 0x1A && st.sala.b == 0x1A);
  assert(!st.quarto.on);
  assert(st.fita.on);
  assert(std::strcmp(st.fita.efeito, "arcoiris") == 0);
  assert(st.tvOn);
  assert(st.arOn);
  assert(std::strcmp(st.arModo, "forte") == 0);

  assert(!maqueteShouldApply(7, "ABC123", 7, "ABC123"));
  assert(!maqueteShouldApply(6, "ABC123", 7, "ABC123"));
  assert(maqueteShouldApply(8, "ABC123", 7, "ABC123"));
  assert(maqueteShouldApply(1, "ZZZZZZ", 99, "ABC123"));

  MaqueteRgb leds[30];
  maqueteRender(st, leds, 30, 0, 60);

  assert(leds[0].r > 0);
  for (int i = 1; i < 4; ++i) {
    assert(leds[i].r == leds[0].r);
  }
  expectOff(leds[4], "gap sala");
  expectOff(leds[5], "quarto off");
  expectOff(leds[9], "gap quarto");
  assert(leds[10].r > 0 || leds[10].g > 0 || leds[10].b > 0);
  expectOff(leds[20], "gap fita");
  assert(leds[21].b > leds[21].r);
  expectOff(leds[22], "gap tv");
  assert(leds[23].b > leds[23].r);
  expectOff(leds[24], "rest");
  expectOff(leds[29], "tail");

  const char* pulsar =
    "{\"version\":2,\"session\":\"ABC123\",\"sala\":{\"on\":false,\"cor\":\"#000000\",\"brilho\":0},"
    "\"quarto\":{\"on\":false,\"cor\":\"#000000\",\"brilho\":0},"
    "\"fita\":{\"on\":true,\"efeito\":\"pulsar\",\"cores\":[\"#7C3AED\"],\"brilho\":200},"
    "\"tv\":{\"on\":false},\"ar\":{\"on\":true,\"modo\":\"normal\"}}";
  MaqueteState st2;
  assert(maqueteParsePayload(pulsar, &st2));
  MaqueteRgb a[30];
  MaqueteRgb b[30];
  maqueteRender(st2, a, 30, 0, 60);
  maqueteRender(st2, b, 30, 800, 60);
  assert(a[10].r != b[10].r || a[10].g != b[10].g || a[10].b != b[10].b);
  expectOff(a[21], "tv off");
  assert(a[23].b > a[23].r);

  std::puts("maquete_map_test ok");
  return 0;
}
