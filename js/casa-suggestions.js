(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuCasaSuggestions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function hourBucket(date) {
    var hour = date.getHours();
    if (hour >= 6 && hour < 12) return "manha";
    if (hour >= 12 && hour < 18) return "tarde";
    return "noite";
  }

  function suggestionsFor(profileId, date) {
    var when = hourBucket(date || new Date());
    var list = [];
    if (when === "noite" || profileId === "Acolhedor" || profileId === "Zen") {
      list.push({
        id: "abajur-quente",
        label: "Acender abajur quente para relaxar?",
        message: "Que tal um abajur quente para relaxar? Posso acender agora.",
        patches: [{ device_id: "abajur", on: true, color: "#FFF4E0", intensity: 0.45 }],
      });
    }
    if (when === "manha" || profileId === "Cyber" || profileId === "Zen") {
      list.push({
        id: "foco-sala",
        label: "Modo foco na sala",
        message: "Posso deixar a sala em modo foco: luz firme e TV ligada.",
        patches: [
          { device_id: "sala_luz", on: true, color: "#3B82F6", intensity: 0.7 },
          { device_id: "tv", on: true, intensity: 0.8 },
        ],
      });
    }
    if (profileId === "Excentrico") {
      list.push({
        id: "fita-colorida",
        label: "Fita LED roxa na sala?",
        message: "A fita LED roxa deixa a sala com a sua cara.",
        patches: [{ device_id: "fita_led", on: true, color: "#7C3AED", intensity: 0.7 }],
      });
    }
    if (profileId === "Acolhedor") {
      list.push({
        id: "sala-vermelha",
        label: "Pintar a sala de vermelho",
        message: "Posso pintar a Luz Sala de vermelho, como no Quest.",
        patches: [{ device_id: "sala_luz", on: true, color: "#FF1A1A", intensity: 0.85 }],
      });
    }
    if (!list.length) {
      list.push({
        id: "sala-on",
        label: "Acender a luz da sala",
        message: "Posso acender a Luz Sala para você.",
        patches: [{ device_id: "sala_luz", on: true, intensity: 0.7 }],
      });
    }
    return list.slice(0, 3);
  }

  return { hourBucket: hourBucket, suggestionsFor: suggestionsFor };
});
