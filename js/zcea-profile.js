// Perfil da demo Unity: Z / C / E / A.
// O visitante não escolhe a casa. Três perguntas somam um vetor
// Zen, Cyber, Excentrico, Acolhedor. Empate: Zen, Acolhedor, Cyber, Excentrico.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuZcea = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var PROFILE_IDS = ["Zen", "Cyber", "Excentrico", "Acolhedor"];
  var TIE_BREAK = ["Zen", "Acolhedor", "Cyber", "Excentrico"];
  var META = {
    Zen: { letter: "Z", archetype: "Zen" },
    Cyber: { letter: "C", archetype: "Cyber" },
    Excentrico: { letter: "E", archetype: "Excêntrico" },
    Acolhedor: { letter: "A", archetype: "Acolhedor" }
  };

  function weights(zen, acolhedor, cyber, excentrico) {
    return { Zen: zen, Acolhedor: acolhedor, Cyber: cyber, Excentrico: excentrico };
  }

  var QUESTIONS = [
    {
      id: "recarga",
      prompt: "Depois do dia, o que te devolve?",
      options: [
        { id: "agua", label: "Água parada, sem pressa", scores: weights(5, 2, 0, 0) },
        { id: "pulso", label: "Um pulso, luz e ritmo", scores: weights(0, 0, 5, 2) },
        { id: "cor", label: "Cor demais e riso alto", scores: weights(0, 0, 2, 5) },
        { id: "mesa", label: "Uma mesa posta, gente perto", scores: weights(2, 5, 0, 0) }
      ]
    },
    {
      id: "atmosfera",
      prompt: "Que clima você quer ao entrar?",
      options: [
        { id: "madeira", label: "Luz baixa e madeira lisa", scores: weights(5, 1, 0, 1) },
        { id: "neon", label: "Neon frio e metal", scores: weights(1, 0, 5, 1) },
        { id: "seda", label: "Lanterna quente e seda", scores: weights(0, 1, 1, 5) },
        { id: "bambu", label: "Chuva no bambu e chá", scores: weights(1, 5, 1, 0) }
      ]
    },
    {
      id: "acolhida",
      prompt: "Como você recebe quem chega?",
      options: [
        { id: "aceno", label: "Um aceno, e o silêncio fica", scores: weights(5, 2, 0, 0) },
        { id: "enigma", label: "Um enigma na porta", scores: weights(1, 0, 5, 2) },
        { id: "porta", label: "Porta aberta e improviso", scores: weights(0, 2, 1, 5) },
        { id: "cha", label: "Chá e um lugar guardado", scores: weights(2, 5, 0, 1) }
      ]
    }
  ];

  function sanitize(value) {
    return PROFILE_IDS.indexOf(value) !== -1 ? value : null;
  }

  function questionById(id) {
    for (var i = 0; i < QUESTIONS.length; i++) {
      if (QUESTIONS[i].id === id) return QUESTIONS[i];
    }
    return null;
  }

  function optionById(question, optionId) {
    if (!question) return null;
    for (var i = 0; i < question.options.length; i++) {
      if (question.options[i].id === optionId) return question.options[i];
    }
    return null;
  }

  function emptyProfile() {
    return { profile_id: null, letter: null, archetype: null, scores: null, tie: false };
  }

  function resolve(recarga, atmosfera, acolhida) {
    if (recarga && typeof recarga === "object") {
      return resolve(recarga.recarga, recarga.atmosfera, recarga.acolhida);
    }
    var picked = [
      optionById(QUESTIONS[0], recarga),
      optionById(QUESTIONS[1], atmosfera),
      optionById(QUESTIONS[2], acolhida)
    ];
    if (!picked[0] || !picked[1] || !picked[2]) return emptyProfile();
    var scores = { Zen: 0, Cyber: 0, Excentrico: 0, Acolhedor: 0 };
    for (var i = 0; i < picked.length; i++) {
      for (var p = 0; p < PROFILE_IDS.length; p++) {
        var id = PROFILE_IDS[p];
        scores[id] += picked[i].scores[id] || 0;
      }
    }
    var best = -1;
    var tied = [];
    for (var j = 0; j < PROFILE_IDS.length; j++) {
      var key = PROFILE_IDS[j];
      if (scores[key] > best) {
        best = scores[key];
        tied = [key];
      } else if (scores[key] === best) {
        tied.push(key);
      }
    }
    tied.sort(function (a, b) { return TIE_BREAK.indexOf(a) - TIE_BREAK.indexOf(b); });
    var winner = tied[0];
    var meta = META[winner];
    return {
      profile_id: winner,
      letter: meta.letter,
      archetype: meta.archetype,
      scores: scores,
      tie: tied.length > 1
    };
  }

  function label(profileId) {
    var id = sanitize(profileId);
    if (!id) return "";
    var meta = META[id];
    return meta.letter + " · " + meta.archetype;
  }

  function optionLabel(field, optionId) {
    var option = optionById(questionById(field), optionId);
    return option ? option.label : "";
  }

  return {
    PROFILE_IDS: PROFILE_IDS,
    TIE_BREAK: TIE_BREAK,
    META: META,
    QUESTIONS: QUESTIONS,
    sanitize: sanitize,
    resolve: resolve,
    label: label,
    optionLabel: optionLabel
  };
});
