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
    matchesDeviceFilters: matchesDeviceFilters
  };
});
