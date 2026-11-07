import { pickPtBrMaleVoice, SPEECH_FALLBACK_PITCH } from "./gen-voice.js";
import {
  MIN_BLOB_BYTES,
  MIN_PCM_SAMPLES,
  audioUploadName,
  countPcmSamples,
  nextLiveRetryMs,
  pcm16ToWav,
  pcmLevel,
  routePcm,
  shouldKeepCapture,
  takeBuffered,
} from "./gen-mic.js";

(function () {
  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $("gen-status");
  var statusText = $("gen-status-text");
  var captionGen = $("caption-gen");
  var captionUser = $("caption-user");
  var ptt = $("ptt");
  var pttLabel = $("ptt-label");
  var form = $("gen-form");
  var input = $("gen-text");
  var houseText = $("gen-house-text");
  var swatch = $("gen-swatch");

  var sessionOn = false;
  var mode = "pending";
  var holding = false;
  var busy = false;
  var socket = null;
  var setupReady = false;
  var opening = null;
  var audioCtx = null;
  var workletReady = false;
  var micStream = null;
  var workletNode = null;
  var playAt = 0;
  var recorder = null;
  var chunks = [];
  var activeSources = [];
  var holdId = 0;
  var liveVoice = "Charon";
  var captureCtx = null;
  var micOpen = null;
  var permissionPending = false;
  var graphReady = false;
  var muteNode = null;
  var sourceNode = null;
  var listening = false;
  var listenReason = null;
  var pointerDown = false;
  var usingRecorder = false;
  var pending = [];
  var retryTimer = null;
  var retryAttempt = 0;
  var sawSession = false;
  var levelEl = $("mic-level");
  var helpEl = $("mic-help");
  var toggleBtn = $("ptt-toggle");

  function setStatus(kind, text) {
    statusEl.className = "gen-status is-" + kind;
    statusText.textContent = text;
  }

  function setPressed(on) {
    holding = on;
    ptt.setAttribute("aria-pressed", on ? "true" : "false");
    pttLabel.textContent = on ? "Ouvindo…" : "Segure para falar";
  }

  function showHelp(text) {
    if (!helpEl) return;
    helpEl.hidden = !text;
    helpEl.textContent = text || "";
  }

  function micDeniedMessage() {
    return "Microfone bloqueado. No celular, toque no cadeado ao lado do endereço, permita o microfone e segure o botão de novo.";
  }

  function isDenied(err) {
    var name = err && err.name;
    return name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError";
  }

  function bytesToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var bin = "";
    var size = 0x8000;
    for (var i = 0; i < bytes.length; i += size) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + size));
    }
    return btoa(bin);
  }

  function base64ToBytes(data) {
    var bin = atob(data);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function context() {
    if (!audioCtx) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      try { audioCtx = new Ctor({ sampleRate: 24000 }); }
      catch (err) { audioCtx = new Ctor(); }
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function captureContext() {
    if (!captureCtx) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      captureCtx = new Ctor();
    }
    if (captureCtx.state === "suspended") captureCtx.resume();
    return captureCtx;
  }

  function stopPlayback() {
    activeSources.forEach(function (source) {
      try { source.stop(); } catch (err) { /* already ended */ }
    });
    activeSources = [];
    if (audioCtx) playAt = audioCtx.currentTime;
  }

  function playPcm(data) {
    var ctx = context();
    var bytes = base64ToBytes(data);
    var length = Math.floor(bytes.byteLength / 2);
    if (!length) return;
    var view = new DataView(bytes.buffer, bytes.byteOffset, length * 2);
    var audio = new Float32Array(length);
    for (var i = 0; i < length; i += 1) audio[i] = view.getInt16(i * 2, true) / 32768;
    var buffer = ctx.createBuffer(1, audio.length, 24000);
    buffer.copyToChannel(audio, 0);
    var source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    var start = Math.max(ctx.currentTime + 0.02, playAt);
    source.start(start);
    playAt = start + buffer.duration;
    activeSources.push(source);
    source.onended = function () {
      activeSources = activeSources.filter(function (item) { return item !== source; });
    };
    setStatus("talk", "Gen falando");
  }

  function paintHouse(state) {
    if (!state) {
      houseText.textContent = "Casa em espera";
      swatch.style.background = "transparent";
      return;
    }
    var main = (state.lights && state.lights.main) || {};
    var color = /^#[0-9A-Fa-f]{6}$/.test(main.color || "") ? main.color : "#FF1A1A";
    swatch.style.background = color;
    if (state.mode === "dojo" && state.dojo) houseText.textContent = "Dojo " + state.dojo;
    else houseText.textContent = "Hub";
  }

  function speak(text) {
    if (!text || !window.speechSynthesis) return;
    var utter = new SpeechSynthesisUtterance(text);
    utter.lang = "pt-BR";
    var voice = pickPtBrMaleVoice(window.speechSynthesis.getVoices());
    if (voice) utter.voice = voice;
    else utter.pitch = SPEECH_FALLBACK_PITCH;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  function showReply(userText, reply) {
    if (userText) captionUser.textContent = userText;
    if (reply) captionGen.textContent = reply;
  }

  async function postChat(body, isForm) {
    var res = await fetch("/api/gen/chat", isForm ? { method: "POST", body: body } : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      setStatus("error", json.error === "no_active_session" ? "Nenhuma sessão ativa no Quest" : "A Gen não respondeu");
      return null;
    }
    showReply(json.transcript, json.reply_text);
    paintHouse(json.state);
    speak(json.reply_text);
    setStatus("fallback", "Voz do navegador");
    return json;
  }

  function field(obj, camel, snake) {
    if (!obj) return undefined;
    if (obj[camel] !== undefined) return obj[camel];
    return obj[snake];
  }

  async function runToolCalls(message) {
    var calls = field(message, "functionCalls", "function_calls") || [];
    var responses = [];
    for (var i = 0; i < calls.length; i += 1) {
      var call = calls[i];
      var res = await fetch("/api/gen/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: call.name, args: call.args || {} }),
      });
      var body = await res.json().catch(function () { return { status: "rejected", reason: "invalid_request" }; });
      if (body.state) paintHouse(body.state);
      responses.push({
        id: call.id,
        name: call.name,
        response: {
          status: body.status || "rejected",
          reason: body.reason || null,
          state: body.state || null,
        },
      });
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
    }
  }

  function onSocketMessage(raw) {
    var text = typeof raw === "string" ? raw : "";
    if (!text) return;
    var msg;
    try { msg = JSON.parse(text); } catch (err) { return; }
    if (msg.setupComplete || msg.setup_complete) {
      setupReady = true;
      mode = "live";
      retryAttempt = 0;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      flushPending();
      if (!listening) setStatus("live", "Ao vivo");
      return;
    }
    if (msg.toolCall || msg.tool_call) {
      runToolCalls(msg.toolCall || msg.tool_call);
      return;
    }
    var server = msg.serverContent || msg.server_content;
    if (!server) return;
    if (server.interrupted) stopPlayback();
    var inputText = field(server, "inputTranscription", "input_transcription");
    var outputText = field(server, "outputTranscription", "output_transcription");
    if (inputText && inputText.text) captionUser.textContent = inputText.text;
    if (outputText && outputText.text) captionGen.textContent = outputText.text;
    var turn = field(server, "modelTurn", "model_turn");
    var parts = (turn && turn.parts) || [];
    parts.forEach(function (part) {
      var inline = part.inlineData || part.inline_data;
      if (inline && inline.data) playPcm(inline.data);
    });
  }

  function closeSocket() {
    setupReady = false;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try { socket.close(); } catch (err) { /* already closed */ }
      socket = null;
    }
  }

  function openSocket(data) {
    closeSocket();
    return new Promise(function (resolve) {
      var ws;
      try { ws = new WebSocket(data.wsUrl); }
      catch (err) {
        mode = "fallback";
        resolve(false);
        return;
      }
      socket = ws;
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        mode = "fallback";
        closeSocket();
        resolve(false);
      }, 8000);
      ws.onopen = function () {
        var declarations = (data.tools || []).map(function (tool) {
          return {
            name: tool.name,
            description: tool.description,
            parameters: geminiSchema(tool.parameters),
          };
        });
        ws.send(JSON.stringify({
          setup: {
            model: "models/" + data.model,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: data.voiceName || liveVoice } },
                languageCode: "pt-BR",
              },
            },
            systemInstruction: { parts: [{ text: data.systemInstruction || "" }] },
            tools: [{ functionDeclarations: declarations }],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }));
      };
      ws.onmessage = function (event) {
        var finish = function (text) {
          onSocketMessage(text);
          if (!settled && setupReady) {
            settled = true;
            clearTimeout(timer);
            resolve(true);
          }
        };
        if (typeof event.data === "string") finish(event.data);
        else if (event.data instanceof ArrayBuffer) finish(new TextDecoder().decode(event.data));
        else if (event.data && event.data.text) event.data.text().then(finish);
      };
      ws.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        mode = "fallback";
        resolve(false);
      };
      ws.onclose = function () {
        var wasLive = mode === "live";
        setupReady = false;
        if (wasLive) {
          mode = "fallback";
          if (!listening) setStatus("fallback", "A voz ao vivo caiu. Vale o navegador.");
          scheduleLiveRetry();
        }
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          if (!wasLive) mode = "fallback";
          resolve(false);
        }
      };
    });
  }

  function geminiSchema(schema) {
    if (!schema || typeof schema !== "object") return { type: "OBJECT" };
    var type = schema.type === "integer" ? "INTEGER" : schema.type === "number" ? "NUMBER" : schema.type === "string" ? "STRING" : "OBJECT";
    var out = { type: type };
    if (schema.description) out.description = schema.description;
    if (schema.enum) out.enum = schema.enum;
    if (schema.properties) {
      out.properties = {};
      Object.keys(schema.properties).forEach(function (key) {
        out.properties[key] = geminiSchema(schema.properties[key]);
      });
    }
    if (schema.required && schema.required.length) out.required = schema.required;
    return out;
  }

  function scheduleLiveRetry() {
    if (retryTimer || !sessionOn) return;
    var delay = nextLiveRetryMs(retryAttempt);
    retryAttempt += 1;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      if (!sessionOn) return;
      ensureLive();
    }, delay);
  }

  function markLiveDown(statusText) {
    mode = "fallback";
    setupReady = false;
    if (!listening && statusText) setStatus("fallback", statusText);
    scheduleLiveRetry();
  }

  async function ensureLive() {
    if (mode === "live" && socket && socket.readyState === WebSocket.OPEN && setupReady) return true;
    if (opening) return opening;
    opening = (async function () {
      if (!listening) setStatus("connect", "Conectando…");
      var res;
      try { res = await fetch("/api/gen/voice-session", { method: "POST" }); }
      catch (err) {
        markLiveDown("Voz ao vivo indisponível. Usando o navegador.");
        return false;
      }
      if (!res.ok) {
        if (res.status === 409) {
          mode = "pending";
          if (!listening) setStatus("idle", "Nenhuma sessão ativa no Quest");
          return false;
        }
        markLiveDown(res.status === 429
          ? "Conectando…"
          : "Voz ao vivo indisponível. Usando o navegador.");
        return false;
      }
      var data = await res.json();
      if (data.voiceName) liveVoice = data.voiceName;
      var ok = await openSocket(data);
      if (!ok) markLiveDown("Voz ao vivo indisponível. Usando o navegador.");
      else retryAttempt = 0;
      return ok;
    })();
    try { return await opening; }
    finally { opening = null; }
  }

  function canSendLive() {
    return mode === "live" && socket && socket.readyState === WebSocket.OPEN && setupReady;
  }

  function sendPcm(buffer) {
    if (!canSendLive()) return false;
    socket.send(JSON.stringify({
      realtimeInput: {
        audio: { mimeType: "audio/pcm;rate=16000", data: bytesToBase64(buffer) },
      },
    }));
    return true;
  }

  function flushPending() {
    if (!canSendLive()) return;
    takeBuffered(pending).forEach(sendPcm);
  }

  function onPcm(buffer) {
    if (listening && levelEl) levelEl.style.width = Math.round(pcmLevel(buffer) * 100) + "%";
    var decision = routePcm({ armed: listening, liveReady: canSendLive(), queue: pending }, buffer);
    if (decision.action === "send") decision.chunks.forEach(sendPcm);
  }

  function hasLiveMic() {
    return !!(micStream && micStream.getAudioTracks().some(function (track) { return track.readyState === "live"; }));
  }

  function ensureMic() {
    if (hasLiveMic()) return Promise.resolve(micStream);
    if (micOpen) return micOpen;
    permissionPending = true;
    micOpen = navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    }).then(function (stream) {
      permissionPending = false;
      micStream = stream;
      showHelp("");
      return stream;
    }).catch(function (err) {
      permissionPending = false;
      micOpen = null;
      throw err;
    });
    return micOpen;
  }

  function releaseMic() {
    if (micStream) micStream.getTracks().forEach(function (track) { track.stop(); });
    micStream = null;
    micOpen = null;
    graphReady = false;
    if (workletNode) {
      try { workletNode.disconnect(); } catch (err) { /* already gone */ }
      workletNode = null;
    }
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch (err) { /* already gone */ }
      sourceNode = null;
    }
    if (muteNode) {
      try { muteNode.disconnect(); } catch (err) { /* already gone */ }
      muteNode = null;
    }
  }

  async function ensureGraph(stream) {
    var ctx = captureContext();
    if (!ctx.audioWorklet) throw new Error("no-worklet");
    if (!workletReady) {
      await ctx.audioWorklet.addModule("/js/gen-audio-worklet.js");
      workletReady = true;
    }
    if (graphReady && workletNode) return;
    sourceNode = ctx.createMediaStreamSource(stream);
    workletNode = new AudioWorkletNode(ctx, "pcm-capture");
    workletNode.port.onmessage = function (event) { onPcm(event.data); };
    muteNode = ctx.createGain();
    muteNode.gain.value = 0;
    sourceNode.connect(workletNode);
    workletNode.connect(muteNode);
    muteNode.connect(ctx.destination);
    graphReady = true;
  }

  function paintDenied() {
    listening = false;
    listenReason = null;
    setPressed(false);
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-pressed", "false");
      toggleBtn.textContent = "Toque para falar";
    }
    showHelp(micDeniedMessage());
    setStatus("error", "Microfone bloqueado");
  }

  function pickMime() {
    var types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    if (!window.MediaRecorder) return "";
    for (var i = 0; i < types.length; i += 1) {
      if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return "";
  }

  async function startRecorder() {
    if (!micStream) micStream = await ensureMic();
    if (recorder && recorder.state === "recording") return;
    var mime = pickMime();
    chunks = [];
    recorder = new MediaRecorder(micStream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = function (event) {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.start();
    usingRecorder = true;
  }

  function stopRecorder() {
    return new Promise(function (resolve) {
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.onstop = function () {
        var blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        recorder = null;
        usingRecorder = false;
        resolve(blob);
      };
      try { recorder.stop(); }
      catch (err) {
        recorder = null;
        usingRecorder = false;
        resolve(null);
      }
    });
  }

  function waitForLive(ms) {
    if (canSendLive()) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var started = Date.now();
      var timer = setInterval(function () {
        if (canSendLive() || Date.now() - started >= ms) {
          clearInterval(timer);
          resolve(canSendLive());
        }
      }, 50);
    });
  }

  async function finishUtterance() {
    setStatus("think", "Pensando…");
    if (usingRecorder) {
      busy = true;
      var blob = await stopRecorder();
      if (!blob || blob.size < MIN_BLOB_BYTES) {
        busy = false;
        setStatus("ready", "Segure um pouco mais para eu ouvir.");
        return;
      }
      var form = new FormData();
      form.append("audio", blob, audioUploadName(blob.type));
      await postChat(form, true);
      busy = false;
      return;
    }
    var live = await waitForLive(1500);
    if (live) {
      flushPending();
      if (canSendLive()) {
        socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      }
      return;
    }
    var buffered = takeBuffered(pending);
    if (countPcmSamples(buffered) < MIN_PCM_SAMPLES) {
      setStatus("ready", "Segure um pouco mais para eu ouvir.");
      return;
    }
    busy = true;
    var wav = pcm16ToWav(buffered);
    var wavForm = new FormData();
    wavForm.append("audio", new Blob([wav], { type: "audio/wav" }), "fala.wav");
    await postChat(wavForm, true);
    busy = false;
  }

  function startListening(reason, micPromise) {
    if (!sessionOn || busy) return;
    listening = true;
    listenReason = reason;
    setPressed(true);
    setStatus("listen", "Ouvindo…");
    showHelp("");
    ensureLive();
    micPromise.then(function (stream) {
      if (!listening) return null;
      return ensureGraph(stream);
    }).catch(function (err) {
      if (!listening && !isDenied(err)) return;
      if (isDenied(err)) {
        paintDenied();
        return;
      }
      if (err && err.message === "no-worklet" && micStream) {
        startRecorder().catch(function () { paintDenied(); });
        return;
      }
      listening = false;
      listenReason = null;
      setPressed(false);
      setStatus("error", "O microfone não abriu");
    });
  }

  function stopListening(reason) {
    if (!listening) return;
    if (reason && listenReason && reason !== listenReason) return;
    listening = false;
    listenReason = null;
    pointerDown = false;
    setPressed(false);
    if (levelEl) levelEl.style.width = "0%";
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-pressed", "false");
      toggleBtn.textContent = "Toque para falar";
    }
    finishUtterance();
  }

  function blockCallout(event) {
    event.preventDefault();
  }

  [ptt, toggleBtn].forEach(function (el) {
    if (!el) return;
    el.addEventListener("contextmenu", blockCallout);
    el.addEventListener("selectstart", blockCallout);
    el.addEventListener("dragstart", blockCallout);
  });

  ptt.addEventListener("pointerdown", function (event) {
    if (!sessionOn) return;
    event.preventDefault();
    if (listening && listenReason === "hold") {
      stopListening("hold");
      return;
    }
    if (listenReason === "toggle") return;
    try { ptt.setPointerCapture(event.pointerId); } catch (err) { /* pointer already gone */ }
    pointerDown = true;
    try { captureContext(); context(); } catch (err) { /* resume on the next gesture */ }
    startListening("hold", ensureMic());
  });
  function endHoldIfMicReady() {
    pointerDown = false;
    if (listenReason !== "hold") return;
    if (shouldKeepCapture({ permissionPending: permissionPending, hasLiveStream: hasLiveMic() })) return;
    stopListening("hold");
  }
  ptt.addEventListener("pointerup", endHoldIfMicReady);
  ptt.addEventListener("pointercancel", endHoldIfMicReady);
  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      if (!sessionOn) return;
      try { captureContext(); context(); } catch (err) { /* still try the mic */ }
      if (listenReason === "toggle") {
        stopListening("toggle");
        return;
      }
      toggleBtn.setAttribute("aria-pressed", "true");
      toggleBtn.textContent = "Toque para parar";
      startListening("toggle", ensureMic());
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.code !== "Space" || event.repeat) return;
    if (document.activeElement === input) return;
    event.preventDefault();
    if (!sessionOn || listenReason === "toggle") return;
    pointerDown = true;
    try { captureContext(); context(); } catch (err) { /* keyboard gesture still resumes later */ }
    startListening("hold", ensureMic());
  });
  document.addEventListener("keyup", function (event) {
    if (event.code !== "Space" || document.activeElement === input) return;
    pointerDown = false;
    if (listenReason === "hold") stopListening("hold");
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || !sessionOn || busy) return;
    input.value = "";
    captionUser.textContent = text;
    if (mode === "live" && socket && socket.readyState === WebSocket.OPEN && setupReady) {
      socket.send(JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text: text }] }],
          turnComplete: true,
        },
      }));
      setStatus("live", "Ao vivo");
      return;
    }
    busy = true;
    await postChat({ text: text }, false);
    busy = false;
  });

  async function refreshSession() {
    try {
      var res = await fetch("/api/session", { cache: "no-store" });
      var body = await res.json();
      sessionOn = !!(body && body.session && body.session.id);
    } catch (err) {
      sessionOn = false;
    }
    ptt.disabled = !sessionOn;
    if (toggleBtn) toggleBtn.disabled = !sessionOn;
    $("gen-send").disabled = !sessionOn;
    input.disabled = !sessionOn;
    if (!sessionOn) {
      sawSession = false;
      closeSocket();
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      listening = false;
      listenReason = null;
      releaseMic();
      mode = "pending";
      setStatus("idle", "Nenhuma sessão ativa no Quest");
      paintHouse(null);
      return;
    }
    if (!sawSession) {
      sawSession = true;
      ensureLive();
    }
    if (!listening && (statusEl.classList.contains("is-idle") || mode === "pending")) {
      setStatus("ready", "Sessão ativa. Segure para falar.");
    }
    try {
      var house = await fetch("/api/house/state", { cache: "no-store" });
      var stateBody = await house.json();
      paintHouse(stateBody.state);
    } catch (err) { /* the chip waits for the next poll */ }
  }

  refreshSession();
  setInterval(refreshSession, 4000);
})();
