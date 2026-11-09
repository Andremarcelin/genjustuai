(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuCasaVoice = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function recognitionCtor(win) {
    var w = win || (typeof window !== "undefined" ? window : {});
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }

  function isSupported(win) {
    return !!recognitionCtor(win);
  }

  function voiceErrorMessage(code) {
    var key = String(code || "");
    if (key === "unsupported") return "Este navegador não reconhece voz. No Android, use o Chrome.";
    if (key === "not-allowed" || key === "denied" || key === "NotAllowedError") {
      return "Permissão do microfone recusada. Ative o microfone nas configurações do Chrome.";
    }
    if (key === "no-speech") return "Não ouvi nada. Toque no microfone e fale de novo.";
    if (key === "audio-capture" || key === "NotFoundError") {
      return "Não encontrei um microfone neste aparelho.";
    }
    if (key === "network") return "A transcrição falhou pela rede. Tente de novo.";
    return "Não consegui ouvir agora. Tente de novo ou escreva para o Gen.";
  }

  function pickTranscript(event) {
    var results = event && event.results;
    if (!results || !results.length) return "";
    var last = results[results.length - 1];
    if (!last || !last[0]) return "";
    return String(last[0].transcript || "").trim();
  }

  function requestMic(mediaDevices) {
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
      return Promise.reject(new Error("unsupported"));
    }
    return mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      if (stream && stream.getTracks) {
        stream.getTracks().forEach(function (track) { track.stop(); });
      }
      return true;
    });
  }

  function speakReply(synth, text, voices) {
    if (!synth || !text || typeof SpeechSynthesisUtterance === "undefined") return false;
    var utter = new SpeechSynthesisUtterance(text);
    utter.lang = "pt-BR";
    var list = voices || (synth.getVoices && synth.getVoices()) || [];
    var voice = list.find(function (item) {
      return /^pt(-BR)?/i.test(String(item.lang || "").replace("_", "-"));
    });
    if (voice) utter.voice = voice;
    synth.cancel();
    synth.speak(utter);
    return true;
  }

  return {
    recognitionCtor: recognitionCtor,
    isSupported: isSupported,
    voiceErrorMessage: voiceErrorMessage,
    pickTranscript: pickTranscript,
    requestMic: requestMic,
    speakReply: speakReply
  };
});
