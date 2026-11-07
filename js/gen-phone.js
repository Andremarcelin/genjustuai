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

  function setStatus(kind, text) {
    statusEl.className = "gen-status is-" + kind;
    statusText.textContent = text;
  }

  function setPressed(on) {
    holding = on;
    ptt.setAttribute("aria-pressed", on ? "true" : "false");
    pttLabel.textContent = on ? "Ouvindo…" : "Segure para falar";
    if (on) setStatus(mode === "fallback" ? "fallback" : "listen", on && mode === "fallback" ? "Gravando pelo navegador" : "Ouvindo");
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
      setStatus("live", "Ao vivo");
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
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
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
        var finish = function (text) { onSocketMessage(text); };
        if (typeof event.data === "string") finish(event.data);
        else if (event.data && event.data.text) event.data.text().then(finish);
        if (!settled && setupReady) {
          settled = true;
          clearTimeout(timer);
          resolve(true);
        }
      };
      ws.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        mode = "fallback";
        resolve(false);
      };
      ws.onclose = function () {
        setupReady = false;
        if (mode === "live") setStatus("fallback", "A voz ao vivo caiu. Vale o navegador.");
        mode = mode === "live" ? "fallback" : mode;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          mode = "fallback";
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

  async function ensureLive() {
    if (mode === "fallback") return false;
    if (mode === "live" && socket && socket.readyState === WebSocket.OPEN && setupReady) return true;
    if (opening) return opening;
    opening = (async function () {
      setStatus("connect", "Conectando a voz ao vivo…");
      var res;
      try { res = await fetch("/api/gen/voice-session", { method: "POST" }); }
      catch (err) { mode = "fallback"; return false; }
      if (!res.ok) {
        mode = "fallback";
        if (res.status === 409) setStatus("idle", "Nenhuma sessão ativa no Quest");
        else setStatus("fallback", "Voz ao vivo indisponível. Usando o navegador.");
        return false;
      }
      var data = await res.json();
      var ok = await openSocket(data);
      if (!ok) setStatus("fallback", "Voz ao vivo indisponível. Usando o navegador.");
      return ok;
    })();
    try { return await opening; }
    finally { opening = null; }
  }

  function stopMic(sendEnd) {
    if (micStream) micStream.getTracks().forEach(function (track) { track.stop(); });
    micStream = null;
    if (workletNode) {
      try { workletNode.disconnect(); } catch (err) { /* node already gone */ }
      workletNode = null;
    }
    if (sendEnd && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
  }

  async function startMic() {
    var ctx = context();
    if (!ctx.audioWorklet) throw new Error("no-worklet");
    if (!workletReady) {
      await ctx.audioWorklet.addModule("/js/gen-audio-worklet.js");
      workletReady = true;
    }
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    var source = ctx.createMediaStreamSource(micStream);
    workletNode = new AudioWorkletNode(ctx, "pcm-capture");
    workletNode.port.onmessage = function (event) {
      if (!holding || !socket || socket.readyState !== WebSocket.OPEN || !setupReady) return;
      socket.send(JSON.stringify({
        realtimeInput: {
          audio: { mimeType: "audio/pcm;rate=16000", data: bytesToBase64(event.data) },
        },
      }));
    };
    source.connect(workletNode);
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
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    var mime = pickMime();
    chunks = [];
    recorder = new MediaRecorder(micStream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = function (event) {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.start();
  }

  function stopRecorder() {
    return new Promise(function (resolve) {
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.onstop = function () {
        var blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (micStream) micStream.getTracks().forEach(function (track) { track.stop(); });
        micStream = null;
        recorder = null;
        resolve(blob);
      };
      recorder.stop();
    });
  }

  function releaseCapture() {
    stopMic(false);
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = function () {
        if (micStream) micStream.getTracks().forEach(function (track) { track.stop(); });
        micStream = null;
        recorder = null;
      };
      try { recorder.stop(); } catch (err) { recorder = null; }
    }
  }

  async function beginHold() {
    if (!sessionOn || busy || holding) return;
    var id = ++holdId;
    setPressed(true);
    try { context(); } catch (err) { /* resume on the gesture anyway */ }
    var live = false;
    try { live = await ensureLive(); }
    catch (err) { live = false; }
    if (id !== holdId) return;
    try {
      if (live) await startMic();
      else await startRecorder();
    } catch (err) {
      if (id === holdId) {
        setPressed(false);
        setStatus("error", "O microfone não abriu");
      }
      return;
    }
    if (id !== holdId) releaseCapture();
  }

  async function endHold() {
    if (!holding) return;
    var wasLive = mode === "live" && socket && socket.readyState === WebSocket.OPEN;
    holdId += 1;
    setPressed(false);
    if (wasLive) {
      stopMic(true);
      setStatus("live", "Ao vivo");
      return;
    }
    if (!recorder || recorder.state === "inactive") return;
    busy = true;
    var blob = await stopRecorder();
    if (!blob || !blob.size) {
      busy = false;
      return;
    }
    var form = new FormData();
    form.append("audio", blob, "fala.webm");
    await postChat(form, true);
    busy = false;
  }

  ptt.addEventListener("pointerdown", function (event) {
    event.preventDefault();
    ptt.setPointerCapture(event.pointerId);
    beginHold();
  });
  ptt.addEventListener("pointerup", endHold);
  ptt.addEventListener("pointercancel", endHold);
  ptt.addEventListener("contextmenu", function (event) { event.preventDefault(); });

  document.addEventListener("keydown", function (event) {
    if (event.code !== "Space" || event.repeat) return;
    if (document.activeElement === input) return;
    event.preventDefault();
    beginHold();
  });
  document.addEventListener("keyup", function (event) {
    if (event.code !== "Space" || document.activeElement === input) return;
    endHold();
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
    $("gen-send").disabled = !sessionOn;
    input.disabled = !sessionOn;
    if (!sessionOn) {
      closeSocket();
      mode = "pending";
      setStatus("idle", "Nenhuma sessão ativa no Quest");
      paintHouse(null);
      return;
    }
    if (statusEl.classList.contains("is-idle") || mode === "pending") {
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
