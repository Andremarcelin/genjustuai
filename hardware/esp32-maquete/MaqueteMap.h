#pragma once

#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <cstdio>

// Payload → LED mapping with no Arduino / FastLED dependency.
// Layout (NUM_LEDS default 30), one dark LED between segments:
//   sala 0-3, gap 4, quarto 5-8, gap 9, fita 10-19, gap 20, tv 21, gap 22, ar 23, rest off

struct MaqueteRgb {
  uint8_t r;
  uint8_t g;
  uint8_t b;
};

struct MaqueteRoom {
  bool on;
  uint8_t r, g, b;
  uint8_t brilho;
};

struct MaqueteFita {
  bool on;
  char efeito[24];
  MaqueteRgb cores[4];
  uint8_t corCount;
  uint8_t brilho;
};

struct MaqueteState {
  uint32_t version;
  char session[16];
  MaqueteRoom sala;
  MaqueteRoom quarto;
  MaqueteFita fita;
  bool tvOn;
  bool arOn;
  char arModo[16];
};

struct MaqueteSegment {
  const char* name;
  uint16_t start;
  uint16_t count;
};

#ifndef MAQUETE_NUM_LEDS
#define MAQUETE_NUM_LEDS 30
#endif

#ifndef MAQUETE_MASTER_BRIGHTNESS
#define MAQUETE_MASTER_BRIGHTNESS 60
#endif

static const MaqueteSegment kMaqueteSegments[] = {
  {"sala", 0, 4},
  {"gap_sala", 4, 1},
  {"quarto", 5, 4},
  {"gap_quarto", 9, 1},
  {"fita", 10, 10},
  {"gap_fita", 20, 1},
  {"tv", 21, 1},
  {"gap_tv", 22, 1},
  {"ar", 23, 1},
};

inline bool maqueteShouldApply(uint32_t version, const char* session,
                               uint32_t lastVersion, const char* lastSession) {
  if (!session || !session[0]) return false;
  if (!lastSession || !lastSession[0]) return true;
  if (std::strcmp(session, lastSession) != 0) return true;
  return version > lastVersion;
}

inline MaqueteRgb maqueteScale(uint8_t r, uint8_t g, uint8_t b, uint8_t brilho, uint8_t master) {
  const uint16_t bscale = brilho;
  const uint16_t mscale = master;
  MaqueteRgb out;
  out.r = static_cast<uint8_t>((uint16_t(r) * bscale * mscale) / (255u * 255u));
  out.g = static_cast<uint8_t>((uint16_t(g) * bscale * mscale) / (255u * 255u));
  out.b = static_cast<uint8_t>((uint16_t(b) * bscale * mscale) / (255u * 255u));
  return out;
}

inline MaqueteRgb maqueteHsv(uint8_t h, uint8_t s, uint8_t v) {
  uint8_t region = h / 43;
  uint8_t remainder = (h - (region * 43)) * 6;
  uint8_t p = (v * (255 - s)) / 255;
  uint8_t q = (v * (255 - ((s * remainder) / 255))) / 255;
  uint8_t t = (v * (255 - ((s * (255 - remainder)) / 255))) / 255;
  MaqueteRgb out{0, 0, 0};
  switch (region) {
    case 0: out = {v, t, p}; break;
    case 1: out = {q, v, p}; break;
    case 2: out = {p, v, t}; break;
    case 3: out = {p, q, v}; break;
    case 4: out = {t, p, v}; break;
    default: out = {v, p, q}; break;
  }
  return out;
}

inline void maqueteFill(MaqueteRgb* leds, uint16_t n, uint16_t start, uint16_t count, MaqueteRgb color) {
  uint16_t end = start + count;
  if (end > n) end = n;
  for (uint16_t i = start; i < end; ++i) leds[i] = color;
}

inline MaqueteRgb maquetePulse(MaqueteRgb base, uint32_t nowMs) {
  const uint8_t wave = static_cast<uint8_t>((nowMs / 8u) & 0xFFu);
  const uint8_t tri = wave < 128 ? wave * 2 : (255 - wave) * 2;
  const uint8_t scale = 40 + (tri * 215) / 255;
  return maqueteScale(base.r, base.g, base.b, scale, 255);
}

inline void maqueteRender(const MaqueteState& st, MaqueteRgb* leds, uint16_t n,
                          uint32_t nowMs, uint8_t master = MAQUETE_MASTER_BRIGHTNESS) {
  const MaqueteRgb off{0, 0, 0};
  for (uint16_t i = 0; i < n; ++i) leds[i] = off;

  const MaqueteRgb sala = st.sala.on
    ? maqueteScale(st.sala.r, st.sala.g, st.sala.b, st.sala.brilho, master)
    : off;
  maqueteFill(leds, n, 0, 4, sala);

  const MaqueteRgb quarto = st.quarto.on
    ? maqueteScale(st.quarto.r, st.quarto.g, st.quarto.b, st.quarto.brilho, master)
    : off;
  maqueteFill(leds, n, 5, 4, quarto);

  if (st.fita.on) {
    const uint8_t br = st.fita.brilho ? st.fita.brilho : 140;
    const char* fx = st.fita.efeito;
    for (uint16_t i = 0; i < 10; ++i) {
      const uint16_t idx = static_cast<uint16_t>(10 + i);
      if (idx >= n) break;
      MaqueteRgb c{0, 0, 0};
      if (std::strcmp(fx, "arcoiris") == 0) {
        uint8_t h = static_cast<uint8_t>(i * 25 + (nowMs / 20u));
        MaqueteRgb hsv = maqueteHsv(h, 255, 255);
        c = maqueteScale(hsv.r, hsv.g, hsv.b, br, master);
      } else if (std::strcmp(fx, "pulsar") == 0) {
        MaqueteRgb base = st.fita.corCount
          ? st.fita.cores[0]
          : MaqueteRgb{0x7C, 0x3A, 0xED};
        MaqueteRgb pulsed = maquetePulse(base, nowMs);
        c = maqueteScale(pulsed.r, pulsed.g, pulsed.b, br, master);
      } else if (std::strcmp(fx, "time") == 0) {
        uint8_t slot = static_cast<uint8_t>(((nowMs / 400u) + i) & 1u);
        MaqueteRgb base = st.fita.corCount > slot ? st.fita.cores[slot]
          : (slot ? MaqueteRgb{0x3B, 0x82, 0xF6} : MaqueteRgb{0xFF, 0x1A, 0x1A});
        c = maqueteScale(base.r, base.g, base.b, br, master);
      } else {
        MaqueteRgb base = st.fita.corCount
          ? st.fita.cores[0]
          : MaqueteRgb{0x7C, 0x3A, 0xED};
        c = maqueteScale(base.r, base.g, base.b, br, master);
      }
      leds[idx] = c;
    }
  }

  if (st.tvOn && n > 21) {
    uint8_t flicker = static_cast<uint8_t>(140 + ((nowMs / 30u) % 50u));
    leds[21] = maqueteScale(0x66, 0xB3, 0xFF, flicker, master);
  }

  if (st.arOn && n > 23) {
    const bool forte = std::strcmp(st.arModo, "forte") == 0;
    if (forte) leds[23] = maqueteScale(0x1D, 0x4E, 0xD8, 220, master);
    else leds[23] = maqueteScale(0x7D, 0xD3, 0xFC, 160, master);
  }
}

inline bool maqueteParseHex(const char* s, uint8_t* r, uint8_t* g, uint8_t* b) {
  if (!s) return false;
  if (s[0] == '#') ++s;
  if (std::strlen(s) < 6) return false;
  char buf[3] = {0, 0, 0};
  buf[0] = s[0]; buf[1] = s[1];
  *r = static_cast<uint8_t>(std::strtoul(buf, nullptr, 16));
  buf[0] = s[2]; buf[1] = s[3];
  *g = static_cast<uint8_t>(std::strtoul(buf, nullptr, 16));
  buf[0] = s[4]; buf[1] = s[5];
  *b = static_cast<uint8_t>(std::strtoul(buf, nullptr, 16));
  return true;
}

inline const char* maqueteFindKey(const char* json, const char* key) {
  char pattern[48];
  std::snprintf(pattern, sizeof(pattern), "\"%s\"", key);
  return std::strstr(json, pattern);
}

inline bool maqueteExtractBool(const char* obj, const char* key, bool fallback = false) {
  const char* p = maqueteFindKey(obj, key);
  if (!p) return fallback;
  p = std::strchr(p, ':');
  if (!p) return fallback;
  ++p;
  while (*p == ' ') ++p;
  if (std::strncmp(p, "true", 4) == 0) return true;
  if (std::strncmp(p, "false", 5) == 0) return false;
  return fallback;
}

inline uint32_t maqueteExtractU32(const char* obj, const char* key, uint32_t fallback = 0) {
  const char* p = maqueteFindKey(obj, key);
  if (!p) return fallback;
  p = std::strchr(p, ':');
  if (!p) return fallback;
  return static_cast<uint32_t>(std::strtoul(p + 1, nullptr, 10));
}

inline void maqueteExtractString(const char* obj, const char* key, char* out, size_t n, const char* fallback) {
  const char* p = maqueteFindKey(obj, key);
  if (!p) {
    std::snprintf(out, n, "%s", fallback ? fallback : "");
    return;
  }
  p = std::strchr(p, ':');
  if (!p) {
    std::snprintf(out, n, "%s", fallback ? fallback : "");
    return;
  }
  ++p;
  while (*p && *p != '"' && *p != 't' && *p != 'f' && (*p < '0' || *p > '9') && *p != '-') ++p;
  if (*p == '"') {
    ++p;
    size_t i = 0;
    while (*p && *p != '"' && i + 1 < n) out[i++] = *p++;
    out[i] = 0;
    return;
  }
  std::snprintf(out, n, "%s", fallback ? fallback : "");
}

inline bool maqueteParseRoom(const char* json, const char* key, MaqueteRoom* room) {
  const char* p = maqueteFindKey(json, key);
  if (!p) return false;
  p = std::strchr(p, '{');
  if (!p) return false;
  room->on = maqueteExtractBool(p, "on", false);
  room->brilho = static_cast<uint8_t>(maqueteExtractU32(p, "brilho", 0));
  char cor[16];
  maqueteExtractString(p, "cor", cor, sizeof(cor), "#FF1A1A");
  if (!maqueteParseHex(cor, &room->r, &room->g, &room->b)) {
    room->r = 0xFF; room->g = 0x1A; room->b = 0x1A;
  }
  return true;
}

inline bool maqueteParsePayload(const char* json, MaqueteState* st) {
  if (!json || !st) return false;
  std::memset(st, 0, sizeof(*st));
  st->version = maqueteExtractU32(json, "version", 0);
  maqueteExtractString(json, "session", st->session, sizeof(st->session), "");
  maqueteParseRoom(json, "sala", &st->sala);
  maqueteParseRoom(json, "quarto", &st->quarto);

  const char* fita = maqueteFindKey(json, "fita");
  if (fita) {
    fita = std::strchr(fita, '{');
    if (fita) {
      st->fita.on = maqueteExtractBool(fita, "on", false);
      st->fita.brilho = static_cast<uint8_t>(maqueteExtractU32(fita, "brilho", 0));
      maqueteExtractString(fita, "efeito", st->fita.efeito, sizeof(st->fita.efeito), "fixo");
      const char* cores = std::strstr(fita, "\"cores\"");
      st->fita.corCount = 0;
      if (cores) {
        const char* q = cores;
        while (st->fita.corCount < 4) {
          q = std::strchr(q, '#');
          if (!q) break;
          char hex[8];
          std::memcpy(hex, q, 7);
          hex[7] = 0;
          MaqueteRgb c;
          if (maqueteParseHex(hex, &c.r, &c.g, &c.b)) {
            st->fita.cores[st->fita.corCount++] = c;
          }
          ++q;
        }
      }
    }
  }

  const char* tv = maqueteFindKey(json, "tv");
  if (tv) {
    tv = std::strchr(tv, '{');
    if (tv) st->tvOn = maqueteExtractBool(tv, "on", false);
  }
  const char* ar = maqueteFindKey(json, "ar");
  if (ar) {
    ar = std::strchr(ar, '{');
    if (ar) {
      st->arOn = maqueteExtractBool(ar, "on", false);
      maqueteExtractString(ar, "modo", st->arModo, sizeof(st->arModo), "normal");
    }
  }
  return st->session[0] != 0;
}
