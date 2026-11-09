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
    layer("quarto-lantern", "quarto_luz", "bloom", 13.6, 32.2, 24, 24),
    layer("quarto-cone", "quarto_luz", "cone", 15, 40, 20, 34, { rotate: 10 }),
    layer("banho-lantern", "quarto_luz", "bloom", 33.2, 20.4, 20, 20),
    layer("abajur-core", "abajur", "bloom", 28.5, 54, 16, 16),
    layer("abajur-cone", "abajur", "cone", 29, 62, 18, 28, { rotate: 8 }),
    layer("sala-lantern", "sala_luz", "bloom", 84.2, 32.2, 24, 24),
    layer("sala-cone", "sala_luz", "cone", 80, 42, 22, 36, { rotate: -16 }),
    layer("cozinha-lantern", "sala_luz", "bloom", 61.4, 20.2, 20, 20),
    layer("led-sofa", "fita_led", "strip", 68, 46, 26, 3.2, { rotate: -22 }),
    layer("tv-screen", "tv", "tv", 47.4, 51.2, 9, 11),
    layer("tv-bloom", "tv", "bloom", 47.4, 51.2, 22, 20),
    layer("ac-core", "ar_condicionado", "ac", 73.5, 36.5, 18, 16),
    layer("ac-wash", "ar_condicionado", "ac", 70, 44, 26, 22)
  ];

  var PROFILE_LED = {
    Zen: [layer("led-beam", "fita_led", "strip", 48, 18, 30, 2.4, { rotate: -8 })],
    Cyber: [
      layer("led-beam", "fita_led", "strip", 46, 16.5, 38, 2.2, { rotate: -6 }),
      layer("led-floor", "fita_led", "strip", 42, 79, 52, 2.6, { rotate: 8 })
    ],
    Excentrico: [
      layer("led-string-l", "fita_led", "strip", 28, 18, 34, 2.6, { rotate: 12 }),
      layer("led-string-r", "fita_led", "strip", 72, 18, 30, 2.6, { rotate: -14 })
    ],
    Acolhedor: [layer("led-beam", "fita_led", "strip", 50, 19, 28, 2.4, { rotate: -6 })]
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

  function glowOpacity(kind, intensity) {
    var i = clamp01(intensity, 0.5);
    if (kind === "ambient") return 0.1 + i * 0.28;
    if (kind === "strip") return 0.35 + i * 0.6;
    if (kind === "tv") return 0.42 + i * 0.5;
    if (kind === "cone") return 0.22 + i * 0.45;
    if (kind === "ac") return 0.18 + i * 0.32;
    if (kind === "darken") return 0;
    return 0.28 + i * 0.55;
  }

  function layerBackground(layer, color, intensity) {
    var i = clamp01(intensity, 0.5);
    var kind = layer.kind;
    if (kind === "strip") {
      return "linear-gradient(90deg, transparent 0%, " + rgba(color, 0.15) + " 8%, " + rgba(color, 0.95) + " 50%, " + rgba(color, 0.15) + " 92%, transparent 100%)";
    }
    if (kind === "cone") {
      return "radial-gradient(ellipse 58% 88% at 50% 8%, " + rgba(color, 0.82) + " 0%, " + rgba(color, 0.28) + " 38%, transparent 72%)";
    }
    if (kind === "tv") {
      return "radial-gradient(ellipse 70% 80% at 50% 50%, " + rgba(color, 0.95) + " 0%, " + rgba(color, 0.4) + " 42%, transparent 74%)";
    }
    if (kind === "ambient") {
      return "radial-gradient(circle at 48% 48%, " + rgba(color, 0.55) + " 0%, " + rgba(color, 0.12) + " 55%, transparent 80%)";
    }
    if (kind === "darken") {
      return "radial-gradient(circle at 48% 46%, rgba(5,5,5,0.08) 0%, rgba(5,5,5,0.42) 58%, rgba(5,5,5,0.72) 100%)";
    }
    if (kind === "ac") {
      return "radial-gradient(circle at 50% 40%, rgba(125,211,252," + (0.45 + i * 0.3) + ") 0%, rgba(125,211,252,0.12) 46%, transparent 72%)";
    }
    return "radial-gradient(circle at 50% 42%, " + rgba(color, 0.95) + " 0%, " + rgba(color, 0.42) + " 34%, transparent 72%)";
  }

  function lightLayerStyle(layer, device, ambient) {
    var on = !!(device && device.on);
    var color = (device && device.color) || "#FF1A1A";
    var intensity = clamp01(device && device.intensity, 0.5);
    var kind = layer.kind;
    var opacity = 0;
    if (kind === "darken") {
      opacity = ambient && !ambient.dark ? 0.12 : 0.64;
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
      brightness: dark ? 0.38 : (0.52 + mean * 0.42)
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
