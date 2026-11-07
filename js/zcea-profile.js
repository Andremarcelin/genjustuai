// Perfil da demo Unity: Z / C / E / A.
// Três situações, no estilo dos itens situacionais dos cinco grandes fatores.
// O visitante não escolhe a casa. Empate: Zen, Acolhedor, Cyber, Excentrico.
// Zen = calma, introspecção, ordem. Cyber = análise, sistemas, estratégia.
// Excentrico = novidade, expressão, improviso. Acolhedor = calor, cuidado, gente.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuZcea = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var PROFILE_IDS = ["Zen", "Cyber", "Excentrico", "Acolhedor"];
  var TIE_BREAK = ["Zen", "Acolhedor", "Cyber", "Excentrico"];
  var META = {
    Zen: {
      letter: "Z",
      archetype: "Zen",
      kanji: "禅",
      title: "Calma em ordem",
      house: {
        luz: "Luz baixa e azul",
        som: "Quase quieto",
        clima: "Ar fresco, madeira quieta"
      }
    },
    Cyber: {
      letter: "C",
      archetype: "Cyber",
      kanji: "電",
      title: "Mente que desmonta",
      house: {
        luz: "Neon azul em pulso curto",
        som: "Noite baixa, sem conversa",
        clima: "Foco frio, pouca distração"
      }
    },
    Excentrico: {
      letter: "E",
      archetype: "Excêntrico",
      kanji: "奇",
      title: "Impulso vivo",
      house: {
        luz: "Luz quente e alta",
        som: "Volume mais alto, ritmo solto",
        clima: "Calor e movimento"
      }
    },
    Acolhedor: {
      letter: "A",
      archetype: "Acolhedor",
      kanji: "温",
      title: "Mesa aberta",
      house: {
        luz: "Lanterna quente",
        som: "Bambu baixo",
        clima: "Aconchego, um lugar guardado"
      }
    }
  };

  function weights(zen, acolhedor, cyber, excentrico) {
    return { Zen: zen, Acolhedor: acolhedor, Cyber: cyber, Excentrico: excentrico };
  }

  function option(id, label, primary, zen, acolhedor, cyber, excentrico) {
    return { id: id, label: label, primary: primary, scores: weights(zen, acolhedor, cyber, excentrico) };
  }

  var QUESTIONS = [
    {
      id: "folga",
      prompt: "Num fim de semana livre, você…",
      options: [
        option("ordem", "organiza o dia em silêncio e segue o plano", "Zen", 5, 2, 0, 0),
        option("sistema", "abre um aparelho ou um sistema só para ver como funciona", "Cyber", 0, 0, 5, 2),
        option("impulso", "sai sem roteiro atrás de algo que nunca fez", "Excentrico", 0, 0, 2, 5),
        option("gente", "chama alguém e cuida do almoço e da conversa", "Acolhedor", 2, 5, 0, 0)
      ]
    },
    {
      id: "problema",
      prompt: "Quando surge um problema difícil, você…",
      options: [
        option("respira", "respira, ordena os fatos e resolve um passo de cada vez", "Zen", 5, 1, 0, 1),
        option("modelo", "monta um modelo, testa hipóteses e escolhe a jogada", "Cyber", 1, 0, 5, 1),
        option("atalho", "tenta um atalho ousado antes de abrir o manual", "Excentrico", 0, 1, 1, 5),
        option("junto", "chama quem está perto e segura o clima enquanto resolvem", "Acolhedor", 1, 5, 1, 0)
      ]
    },
    {
      id: "festa",
      prompt: "Numa festa onde conhece pouca gente, você…",
      options: [
        option("canto", "fica num canto calmo, observa e entra só quando faz sentido", "Zen", 5, 2, 0, 0),
        option("mapa", "lê a sala, vê quem decide o quê e escolhe com quem falar", "Cyber", 1, 0, 5, 2),
        option("pista", "puxa a conversa, improvisa e vira o centro sem planejar", "Excentrico", 0, 2, 1, 5),
        option("anel", "percebe quem está sozinho e puxa essa pessoa para o círculo", "Acolhedor", 2, 5, 0, 1)
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

  function answersFrom(first, second, third) {
    if (first && typeof first === "object") {
      return [
        first[QUESTIONS[0].id],
        first[QUESTIONS[1].id],
        first[QUESTIONS[2].id]
      ];
    }
    return [first, second, third];
  }

  function resolve(first, second, third) {
    var raw = answersFrom(first, second, third);
    var picked = [
      optionById(QUESTIONS[0], raw[0]),
      optionById(QUESTIONS[1], raw[1]),
      optionById(QUESTIONS[2], raw[2])
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

  function scoreCap() {
    return 15;
  }

  return {
    PROFILE_IDS: PROFILE_IDS,
    TIE_BREAK: TIE_BREAK,
    META: META,
    QUESTIONS: QUESTIONS,
    sanitize: sanitize,
    resolve: resolve,
    label: label,
    optionLabel: optionLabel,
    scoreCap: scoreCap
  };
});
