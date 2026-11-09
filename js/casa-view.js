(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuCasaView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var HOUSE_IMG = {
    Zen: "/assets/casa/zen.jpg",
    Cyber: "/assets/casa/cyber.jpg",
    Excentrico: "/assets/casa/excentrico.jpg",
    Acolhedor: "/assets/casa/acolhedor.jpg"
  };

  var UNDERSTOOD = {
    Zen: {
      label: "Zen",
      traits: ["Calma", "Ordem", "Silêncio"],
      summary: "A casa entendeu que você recarrega no silêncio e resolve um passo de cada vez."
    },
    Cyber: {
      label: "Cyber",
      traits: ["Foco", "Sistemas", "Análise"],
      summary: "A casa entendeu que você pensa em sistemas e escolhe a jogada antes de agir."
    },
    Excentrico: {
      label: "Excêntrico",
      traits: ["Impulso", "Novidade", "Expressão"],
      summary: "A casa entendeu que você busca o que ainda não fez e puxa a sala sem roteiro."
    },
    Acolhedor: {
      label: "Acolhedor",
      traits: ["Calor", "Cuidado", "Gente"],
      summary: "A casa entendeu que você cuida de quem está perto e segura o clima junto."
    }
  };

  function houseTitle(displayName) {
    var name = String(displayName || "").replace(/\s+/g, " ").trim();
    return name ? "Casa de " + name : "Sua casa";
  }

  function houseImageFor(profileId) {
    return HOUSE_IMG[profileId] || HOUSE_IMG.Acolhedor;
  }

  function understoodFor(profileId) {
    return UNDERSTOOD[profileId] || null;
  }

  function overlayLights(devices, room) {
    return (devices || []).filter(function (item) {
      return item && item.overlay === room && item.on;
    });
  }

  var DEVICE_DEFAULTS = {
    sala_luz: { on: false, color: "#FF1A1A", intensity: 0.85 },
    quarto_luz: { on: false, color: "#FF1A1A", intensity: 0.2 },
    abajur: { on: false, color: "#FFAA00", intensity: 0.45 },
    fita_led: { on: false, color: "#7C3AED", intensity: 0.55 },
    tv: { on: false, color: "#3B82F6", intensity: 0.7 },
    ambiente: { on: false, color: "#FF1A1A", intensity: 0.3 },
    ar_condicionado: { on: false, color: "#7DD3FC", intensity: 0.45, temp: 22, mode: "frio", fan: "auto" }
  };

  function layer(id, device, kind, x, y, w, h, extra) {
    return Object.assign({ id: id, device: device, kind: kind, x: x, y: y, w: w, h: h, rotate: 0 }, extra || {});
  }

  var SHARED_LAYERS = [
    layer("darken", "ambiente", "darken", 50, 50, 100, 100),
    layer("ambiente", "ambiente", "ambient", 50, 50, 100, 100),
    layer("quarto-wash", "quarto_luz", "wash", 30, 48, 52, 56),
    layer("quarto-lantern", "quarto_luz", "bloom", 13.6, 32.2, 34, 34),
    layer("quarto-cone", "quarto_luz", "cone", 18, 46, 28, 42, { rotate: 8 }),
    layer("banho-lantern", "quarto_luz", "bloom", 33.2, 20.4, 28, 28),
    layer("abajur-wash", "abajur", "wash", 32, 56, 42, 40),
    layer("abajur-core", "abajur", "bloom", 30, 54, 22, 22),
    layer("abajur-pool", "abajur", "pool", 33, 62, 36, 28, { rotate: 12 }),
    layer("sala-wash", "sala_luz", "wash", 66, 52, 62, 58),
    layer("sala-wall", "sala_luz", "wash", 78, 36, 40, 44),
    layer("sala-floor", "sala_luz", "pool", 64, 64, 48, 32, { rotate: 18 }),
    layer("sala-lantern", "sala_luz", "bloom", 84.2, 32.2, 36, 36),
    layer("sala-cone", "sala_luz", "cone", 76, 46, 34, 46, { rotate: -18 }),
    layer("cozinha-lantern", "sala_luz", "bloom", 61.4, 20.2, 28, 28),
    layer("led-tv", "fita_led", "strip", 48.2, 58.6, 18, 1.35, { rotate: 6 }),
    layer("led-tv-spill", "fita_led", "spill", 48.4, 60.2, 22, 8, { rotate: 6 }),
    layer("led-beam", "fita_led", "strip", 63, 16.5, 46, 1.35, { rotate: -8 }),
    layer("led-beam-spill", "fita_led", "spill", 63, 19.2, 46, 7, { rotate: -8 }),
    layer("tv-screen", "tv", "tv", 47.4, 51.2, 10, 12),
    layer("tv-bloom", "tv", "bloom", 47.4, 51.2, 28, 24),
    layer("ac-core", "ar_condicionado", "ac", 73.5, 36.5, 22, 20),
    layer("ac-wash", "ar_condicionado", "ac", 70, 46, 32, 26)
  ];

  var PROFILE_LED = {
    Zen: [],
    Cyber: [layer("led-floor", "fita_led", "strip", 44, 78.5, 50, 1.8, { rotate: 8 })],
    Excentrico: [
      layer("led-string-l", "fita_led", "strip", 28, 18, 36, 1.7, { rotate: 12 }),
      layer("led-string-r", "fita_led", "strip", 74, 18, 32, 1.7, { rotate: -14 })
    ],
    Acolhedor: []
  };

  function lightLayersFor(profileId) {
    var extra = PROFILE_LED[profileId] || PROFILE_LED.Acolhedor;
    return SHARED_LAYERS.concat(extra);
  }

  function clamp01(value, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  }

  function hexToRgb(hex) {
    var h = /^#([0-9A-Fa-f]{6})$/.exec(String(hex || ""));
    if (!h) return { r: 255, g: 26, b: 26 };
    return {
      r: parseInt(h[1].slice(0, 2), 16),
      g: parseInt(h[1].slice(2, 4), 16),
      b: parseInt(h[1].slice(4, 6), 16)
    };
  }

  function rgba(hex, alpha) {
    var c = hexToRgb(hex);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + clamp01(alpha, 0) + ")";
  }

  function liftHex(hex, amount) {
    var c = hexToRgb(hex);
    var a = clamp01(amount, 0.35);
    return "#" + [c.r, c.g, c.b].map(function (ch) {
      var n = Math.round(ch + (255 - ch) * a);
      return (n < 16 ? "0" : "") + n.toString(16);
    }).join("").toUpperCase();
  }

  function glowOpacity(kind, intensity) {
    var i = clamp01(intensity, 0.5);
    if (kind === "ambient") return 0.18 + i * 0.42;
    if (kind === "strip") return 0.72 + i * 0.28;
    if (kind === "spill") return 0.38 + i * 0.42;
    if (kind === "wash") return 0.48 + i * 0.42;
    if (kind === "pool") return 0.42 + i * 0.4;
    if (kind === "tv") return 0.55 + i * 0.4;
    if (kind === "cone") return 0.4 + i * 0.45;
    if (kind === "ac") return 0.28 + i * 0.4;
    if (kind === "darken") return 0;
    return 0.55 + i * 0.4;
  }

  function layerBackground(layer, color, intensity) {
    var i = clamp01(intensity, 0.5);
    var kind = layer.kind;
    var bright = liftHex(color, 0.42);
    if (kind === "strip") {
      return "linear-gradient(90deg, transparent 0%, " + rgba(bright, 0.85) + " 4%, " + rgba(bright, 1) + " 50%, " + rgba(bright, 0.85) + " 96%, transparent 100%)";
    }
    if (kind === "spill") {
      return "linear-gradient(90deg, transparent 0%, " + rgba(color, 0.45) + " 12%, " + rgba(bright, 0.55) + " 50%, " + rgba(color, 0.45) + " 88%, transparent 100%)";
    }
    if (kind === "cone") {
      return "radial-gradient(ellipse 62% 90% at 50% 6%, " + rgba(bright, 0.95) + " 0%, " + rgba(color, 0.55) + " 42%, transparent 78%)";
    }
    if (kind === "wash") {
      return "radial-gradient(ellipse 70% 65% at 50% 48%, " + rgba(color, 0.92) + " 0%, " + rgba(color, 0.55) + " 46%, transparent 78%)";
    }
    if (kind === "pool") {
      return "radial-gradient(ellipse 75% 55% at 50% 55%, " + rgba(bright, 0.8) + " 0%, " + rgba(color, 0.4) + " 48%, transparent 76%)";
    }
    if (kind === "tv") {
      return "radial-gradient(ellipse 70% 80% at 50% 50%, " + rgba(bright, 0.95) + " 0%, " + rgba(color, 0.5) + " 42%, transparent 74%)";
    }
    if (kind === "ambient") {
      return "radial-gradient(circle at 48% 48%, " + rgba(color, 0.7) + " 0%, " + rgba(color, 0.22) + " 58%, transparent 82%)";
    }
    if (kind === "darken") {
      return "radial-gradient(circle at 48% 46%, rgba(4,4,6,0.35) 0%, rgba(2,2,4,0.72) 52%, rgba(0,0,0,0.92) 100%)";
    }
    if (kind === "ac") {
      return "radial-gradient(circle at 50% 40%, rgba(125,211,252," + (0.55 + i * 0.35) + ") 0%, rgba(125,211,252,0.18) 48%, transparent 74%)";
    }
    return "radial-gradient(circle at 50% 42%, " + rgba(bright, 1) + " 0%, " + rgba(color, 0.62) + " 38%, transparent 74%)";
  }

  function lightLayerStyle(layer, device, ambient) {
    var on = !!(device && device.on);
    var color = (device && device.color) || "#FF1A1A";
    var intensity = clamp01(device && device.intensity, 0.5);
    var kind = layer.kind;
    var opacity = 0;
    if (kind === "darken") {
      opacity = ambient && !ambient.dark ? 0.08 : 0.9;
    } else if (on) {
      opacity = glowOpacity(kind, intensity);
    }
    var centered = kind !== "ambient" && kind !== "darken";
    var rotate = Number(layer.rotate) || 0;
    var transform = centered
      ? "translate(-50%, -50%) rotate(" + rotate + "deg)"
      : "none";
    return {
      left: (centered ? layer.x : 50) + "%",
      top: (centered ? layer.y : 50) + "%",
      width: layer.w + "%",
      height: layer.h + "%",
      opacity: String(opacity),
      background: layerBackground(layer, color, intensity),
      transform: transform,
      color: color
    };
  }

  function frameAmbient(devices) {
    var list = devices || [];
    var lit = list.filter(function (item) {
      return item && item.on && item.id !== "ar_condicionado";
    });
    var dark = lit.length === 0;
    var mean = lit.length
      ? lit.reduce(function (sum, item) { return sum + clamp01(item.intensity, 0.5); }, 0) / lit.length
      : 0;
    return {
      dark: dark,
      brightness: dark ? 0.2 : (0.62 + mean * 0.45)
    };
  }

  function demoLightsFromScene(scene) {
    var lights = {};
    Object.keys(DEVICE_DEFAULTS).forEach(function (id) {
      lights[id] = Object.assign({}, DEVICE_DEFAULTS[id]);
    });
    if (scene === "sala_red") {
      lights.sala_luz = { on: true, color: "#FF1A1A", intensity: 0.9 };
    } else if (scene === "abajur_warm") {
      lights.abajur = { on: true, color: "#FFAA00", intensity: 0.8 };
    } else if (scene === "led_purple") {
      lights.fita_led = { on: true, color: "#7C3AED", intensity: 0.85 };
    } else if (scene === "off") {
      /* all remain off */
    } else {
      lights.sala_luz = { on: true, color: "#FF1A1A", intensity: 0.85 };
      lights.tv = { on: true, color: "#3B82F6", intensity: 0.7 };
      lights.ar_condicionado = Object.assign({}, DEVICE_DEFAULTS.ar_condicionado, { on: true });
    }
    return lights;
  }

  function matchesDeviceFilters(item, filters) {
    var f = filters || {};
    var q = String(f.query || "").trim().toLowerCase();
    if (f.room && item.room !== f.room) return false;
    if (f.kind && item.kind !== f.kind) return false;
    if (q && String(item.label || "").toLowerCase().indexOf(q) < 0) return false;
    return true;
  }

  return {
    HOUSE_IMG: HOUSE_IMG,
    houseTitle: houseTitle,
    houseImageFor: houseImageFor,
    understoodFor: understoodFor,
    overlayLights: overlayLights,
    matchesDeviceFilters: matchesDeviceFilters,
    lightLayersFor: lightLayersFor,
    lightLayerStyle: lightLayerStyle,
    frameAmbient: frameAmbient,
    demoLightsFromScene: demoLightsFromScene,
    DEVICE_DEFAULTS: DEVICE_DEFAULTS
  };
});
