(function () {
  var P = window.GenjutsuPersonality;
  var G = window.GenjutsuGuestSave;
  var Z = window.GenjutsuZcea;
  var $ = function (id) { return document.getElementById(id); };
  var SESSION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/tasks.readonly"
  ].join(" ");

  var sb = null;
  var globalDossie = {};
  var sessionCode = "";
  var journeyUserId = "";
  var journeyPhase = "";
  var inflightUserId = "";
  var inflight = null;
  var authBusy = false;
  var saveInProgress = false;
  var guestIntent = false;
  var configReady = Promise.resolve();

  function randomSessionCode() {
    var out = "";
    for (var i = 0; i < 6; i++) out += SESSION_ALPHABET[Math.floor(Math.random() * SESSION_ALPHABET.length)];
    return out;
  }

  function renderSessionCode(code) {
    sessionCode = code || "";
    document.querySelectorAll("[data-session-code]").forEach(function (el) {
      el.textContent = sessionCode || "—";
    });
    document.querySelectorAll(".session-link").forEach(function (a) {
      a.href = sessionCode ? "/s/" + sessionCode : "#";
    });
    var summaryUrl = sessionCode ? location.origin + "/s/" + sessionCode : "";
    document.querySelectorAll(".session-qr").forEach(function (img) {
      if (!summaryUrl) {
        img.removeAttribute("src");
        img.style.display = "none";
        return;
      }
      img.style.display = "none";
      img.onload = function () { img.style.display = "block"; };
      img.onerror = function () { img.style.display = "none"; };
      img.src = "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" + encodeURIComponent(summaryUrl);
    });
    if (journeyUserId) paintIdentity(currentPaintUser);
  }

  var currentPaintUser = null;

  function paintIdentity(user) {
    if (!user) return;
    currentPaintUser = user;
    var name = P.resolvedDisplayName(user, globalDossie, sessionCode);
    var email = P.emailFor(user);
    var avatar = P.avatarFor(user);
    var guest = P.isGuest(user);
    ["avatar", "ready-avatar"].forEach(function (id) {
      var img = $(id);
      if (!img) return;
      img.src = avatar;
      img.alt = guest ? "Silhueta de visitante" : "Foto de perfil";
    });
    var typed = visitorNameValue();
    if (guest && typed) name = typed;
    $("user-name").textContent = name;
    if ($("ready-name")) $("ready-name").textContent = name;
    $("sync-user").textContent = name;
    var emailLine = email || (guest ? "Sem conta Google" : "");
    $("user-email").textContent = emailLine;
    if ($("ready-email")) $("ready-email").textContent = emailLine;
    $("sync-mail").textContent = email || (guest ? "Visitante · sem APIs do Google" : "");
    document.querySelectorAll("[data-guest-only]").forEach(function (el) {
      el.hidden = !guest;
    });
    document.querySelectorAll("[data-account-only]").forEach(function (el) {
      el.hidden = guest;
    });
  }

  function setProgress(step, skipSync) {
    document.querySelectorAll("#dojo-progress li").forEach(function (li) {
      var n = Number(li.dataset.step);
      var skipped = Boolean(skipSync && n === 2 && step > 2);
      li.classList.toggle("done", n < step && !skipped);
      li.classList.toggle("current", n === step);
      li.classList.toggle("skipped", skipped);
      var label = li.querySelector("[data-step-label]");
      if (label && n === 2) label.textContent = skipped ? "Sem API" : "Rastro";
      if (n === step) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
  }

  function revealApp() {
    $("landing").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("screen-config").hidden = true;
  }

  function showLanding() {
    $("landing").classList.remove("hidden");
    $("app").classList.add("hidden");
    $("screen-config").hidden = true;
  }

  function showScreen(id) {
    revealApp();
    document.querySelectorAll(".screen").forEach(function (el) { el.classList.remove("on"); });
    var screen = $(id);
    if (screen) screen.classList.add("on");
    var guest = guestIntent || (currentPaintUser ? P.isGuest(currentPaintUser) : false);
    var step = { "screen-login": 1, "screen-sync": 2, "screen-questionnaire": 3, "screen-ready": 4 }[id] || 1;
    setProgress(step, guest);
    if (id === "screen-questionnaire") {
      paintSaveCopy();
      prefillVisitorName();
    }
    var title = screen && screen.querySelector(".screen-title");
    if (title) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  }

  function openConfigFallback(message) {
    $("landing").classList.add("hidden");
    $("app").classList.add("hidden");
    $("screen-config").hidden = false;
    if (message) setStatus("status-config", message, true);
    var title = $("screen-config").querySelector(".screen-title");
    if (title) {
      title.tabIndex = -1;
      title.focus();
    }
  }

  function setStatus(id, msg, isError) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.className = "status" + (isError ? " error" : (msg.indexOf("✓") !== -1 ? " success" : ""));
  }

  async function loadConfig() {
    try {
      var res = await fetch("/api/config");
      if (res.ok) {
        var body = await res.json();
        if (body.supabaseUrl && body.supabaseAnonKey) {
          return { supabaseUrl: body.supabaseUrl, supabaseAnonKey: body.supabaseAnonKey, source: "vercel" };
        }
      }
    } catch (e) {}
    try {
      var storedUrl = sessionStorage.getItem("genjutsu_supabase_url");
      var storedKey = sessionStorage.getItem("genjutsu_supabase_key");
      if (storedUrl && storedKey) return { supabaseUrl: storedUrl, supabaseAnonKey: storedKey, source: "session" };
    } catch (e) {}
    return null;
  }

  function setupSupabaseClient(supabaseUrl, supabaseAnonKey, source) {
    sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    ["btn-login", "btn-guest-login", "btn-login-ms"].forEach(function (id) {
      if ($(id)) $(id).disabled = false;
    });
    var sawAuthEvent = false;
    sb.auth.onAuthStateChange(function (_event, session) {
      if (saveInProgress) {
        if (session && session.user) paintIdentity(session.user);
        return;
      }
      if (!sawAuthEvent) {
        sawAuthEvent = true;
        if (!session) return;
      }
      if (session && session.user) {
        if (journeyUserId === session.user.id && journeyPhase && journeyPhase !== "leaving") {
          paintIdentity(session.user);
          return;
        }
        showLoggedIn(session.user);
        return;
      }
      if (journeyPhase === "sync" || journeyPhase === "quiz" || journeyPhase === "ready") return;
      showLoggedOut();
    });
    sb.auth.getSession().then(function (result) {
      var session = result && result.data && result.data.session;
      if (session && session.user) showLoggedIn(session.user);
    });
    $("config-source").textContent = source === "vercel"
      ? "Supabase configurado via Vercel."
      : "Supabase configurado nesta aba.";
  }

  async function requireClient() {
    await configReady;
    if (!sb) {
      openConfigFallback("A conexão não veio de /api/config. A configuração fica fora da jornada.");
      return false;
    }
    return true;
  }

  async function loadStoredDossier(user) {
    if (!sb || !user) return;
    var result = await sb.from("dossiers").select("dossier_data, profile_id, session_code, full_name").eq("user_id", user.id).maybeSingle();
    if (!result || result.error || !result.data) return;
    var stored = result.data.dossier_data;
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) stored = {};
    var fromColumn = result.data.profile_id
      ? { preferencias: { profile_id: result.data.profile_id } }
      : {};
    globalDossie = G.mergeStoredDossier(G.mergeStoredDossier(stored, fromColumn), globalDossie);
    if (result.data.full_name && !globalDossie.nome_exibicao) {
      globalDossie.nome_exibicao = result.data.full_name;
    }
    if (result.data.session_code && !sessionCode) renderSessionCode(result.data.session_code);
  }

  async function allocateSessionCode(user) {
    if (!sb || !user) return "";
    var rpc = await sb.rpc("genjutsu_allocate_session_code");
    if (!rpc.error && rpc.data) {
      var fresh = String(rpc.data).trim().toUpperCase();
      renderSessionCode(fresh);
      return fresh;
    }
    if (rpc.error) console.warn("genjutsu_allocate_session_code:", rpc.error);
    var fallback = randomSessionCode();
    renderSessionCode(fallback);
    return fallback;
  }

  async function ensureSessionCode(user) {
    if (!sb || !user) return "";
    var rpc = await sb.rpc("genjutsu_ensure_session");
    if (!rpc.error && rpc.data) {
      renderSessionCode(rpc.data);
      await upsertPublicSummary(user);
      return rpc.data;
    }
    if (rpc.error) console.warn("genjutsu_ensure_session:", rpc.error);
    var existing = await sb.from("dossiers").select("session_code").eq("user_id", user.id).maybeSingle();
    if (existing.data && existing.data.session_code) {
      renderSessionCode(existing.data.session_code);
      await upsertPublicSummary(user);
      return existing.data.session_code;
    }
    var fallback = randomSessionCode();
    var up = await sb.from("dossiers").upsert(
      { user_id: user.id, session_code: fallback, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (up.error) console.warn("session_code fallback:", up.error);
    var locked = await sb.from("dossiers").select("session_code").eq("user_id", user.id).maybeSingle();
    var finalCode = (locked.data && locked.data.session_code) || fallback;
    renderSessionCode(finalCode);
    await upsertPublicSummary(user);
    return finalCode;
  }

  async function logInteraction(user, kind, payload) {
    if (!sb || !user || !sessionCode) return;
    var result = await sb.from("interactions").insert({
      user_id: user.id,
      session_code: sessionCode,
      kind: kind,
      payload: payload || {}
    });
    if (result.error) console.warn("interaction:", result.error);
  }

  async function logConversation(user, role, content) {
    if (!sb || !user || !sessionCode || !content) return;
    var result = await sb.from("conversations").insert({
      user_id: user.id,
      session_code: sessionCode,
      role: role,
      content: content
    });
    if (result.error) console.warn("conversation:", result.error);
  }

  async function upsertPublicSummary(user) {
    if (!sb || !user || !sessionCode) return;
    var persona = P.buildPersonality(user, globalDossie, sessionCode);
    // Sem ZCEA o Quest fica no branco. Não gravar "Perfil em formação"
    // por cima de um resumo, nem publicar a sessão antes do questionário.
    if (!persona.profile_id) return;
    var row = {
      session_code: sessionCode,
      user_id: user.id,
      display_name: persona.displayName,
      personality_text: persona.text,
      archetype: persona.archetype,
      profile_id: persona.profile_id,
      updated_at: new Date().toISOString()
    };
    var result = await sb.from("session_summaries").upsert(row, { onConflict: "session_code" });
    if (result.error && row.profile_id && G.columnMissing(result.error)) {
      delete row.profile_id;
      result = await sb.from("session_summaries").upsert(row, { onConflict: "session_code" });
    }
    if (result.error) console.warn("summary:", result.error);
  }

  window.genjutsuLogConversation = logConversation;

  async function saveToSupabase(user) {
    if (!sb || !user) return;
    if (!sessionCode) await ensureSessionCode(user);
    var persona = P.buildPersonality(user, globalDossie, sessionCode);
    if (persona.profile_id && globalDossie.preferencias) {
      globalDossie.preferencias.profile_id = persona.profile_id;
    }
    var avatar = P.avatarFor(user);
    if (avatar.charAt(0) === "/") avatar = location.origin + avatar;
    var row = {
      user_id: user.id,
      full_name: persona.displayName,
      email: P.emailFor(user),
      avatar_url: avatar,
      dossier_data: globalDossie,
      updated_at: new Date().toISOString()
    };
    if (sessionCode) row.session_code = sessionCode;
    if (persona.profile_id) row.profile_id = persona.profile_id;
    var result = await sb.from("dossiers").upsert(row, { onConflict: "user_id" });
    if (result.error && row.profile_id && G.columnMissing(result.error)) {
      delete row.profile_id;
      result = await sb.from("dossiers").upsert(row, { onConflict: "user_id" });
    }
    if (result.error) console.warn("dossier:", result.error);
  }

  function showLoggedOut() {
    if (journeyPhase === "leaving") return;
    journeyUserId = "";
    journeyPhase = "";
    guestIntent = false;
    inflightUserId = "";
    inflight = null;
    currentPaintUser = null;
    $("logged-out").classList.remove("hidden");
    $("logged-in").classList.add("hidden");
    setStatus("status-auth", "");
    setStatus("status-questionnaire", "");
    document.querySelectorAll(".option").forEach(function (b) {
      b.classList.remove("selected");
      b.setAttribute("aria-pressed", "false");
    });
    var nameInput = $("visitor-name");
    if (nameInput) {
      nameInput.value = "";
      nameInput.removeAttribute("aria-invalid");
    }
    if ($("ready-phrase")) $("ready-phrase").textContent = "";
    renderSessionFields([]);
    renderQuestProfile(null);
    globalDossie = {};
    renderSessionCode("");
    if (sb && $("screen-config").hidden) showLanding();
  }

  async function showLoggedIn(user) {
    if (!user) return;
    if (inflight && inflightUserId === user.id) return inflight;
    inflightUserId = user.id;
    inflight = runJourney(user);
    try {
      await inflight;
    } finally {
      if (inflightUserId === user.id) {
        inflight = null;
        inflightUserId = "";
      }
    }
  }

  async function runJourney(user) {
    paintIdentity(user);
    if (journeyUserId === user.id && (journeyPhase === "quiz" || journeyPhase === "ready" || journeyPhase === "sync")) {
      paintIdentity(user);
      return;
    }
    journeyUserId = user.id;
    await loadStoredDossier(user);
    paintIdentity(user);
    if (P.isGuest(user)) {
      journeyPhase = "quiz";
      globalDossie.fonte = "convidado";
      showScreen("screen-questionnaire");
      try {
        await ensureSessionCode(user);
        var avatar = location.origin + "/assets/guest-avatar.jpg";
        try {
          await sb.auth.updateUser({
            data: { full_name: P.displayName(user, sessionCode), avatar_url: avatar, guest: true }
          });
        } catch (e) {
          console.warn("perfil visitante:", e);
        }
        paintIdentity(user);
        await saveToSupabase(user);
        await upsertPublicSummary(user);
      } catch (e) {
        console.warn("sessão visitante:", e);
        setStatus("status-questionnaire", "A sessão anônima entrou, mas o código não foi gravado. Confira Anonymous sign-ins e o SQL.", true);
      }
      return;
    }
    journeyPhase = "sync";
    showScreen("screen-sync");
    try {
      await ensureSessionCode(user);
    } catch (e) {
      console.warn("sessão:", e);
    }
    await collectDataInBackground(user);
  }

  async function getToken() {
    if (!sb) return null;
    var result = await sb.auth.getSession();
    var session = result && result.data && result.data.session;
    return (session && session.provider_token) || null;
  }

  function goToPreferences() {
    journeyPhase = "quiz";
    showScreen("screen-questionnaire");
  }

  async function collectDataInBackground(user) {
    if (P.isGuest(user)) {
      goToPreferences();
      return;
    }
    var bar = $("sync-bar");
    bar.style.width = "18%";
    $("sync-status").textContent = "Preparando seu cadastro…";
    var token = await getToken();
    try {
      if (token) {
        globalDossie.fonte = "google";
        var headers = { Authorization: "Bearer " + token };
        try {
          var timeMin = new Date().toISOString();
          var resC = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=8&orderBy=startTime&singleEvents=true&timeMin=" + timeMin, { headers: headers });
          var dataC = await resC.json();
          bar.style.width = "35%";
          if (dataC.items) {
            globalDossie.calendar = dataC.items.map(function (e) {
              return { titulo: e.summary || "(sem título)", inicio: (e.start && (e.start.dateTime || e.start.date)) || "" };
            });
          }
        } catch (e) { console.warn("Erro na Agenda:", e); }

        try {
          var resY = await fetch("https://www.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=8", { headers: headers });
          var dataY = await resY.json();
          bar.style.width = "55%";
          if (dataY.items) globalDossie.youtube = dataY.items.map(function (s) { return { canal: s.snippet.title }; });
        } catch (e) { console.warn("Erro no YouTube:", e); }

        try {
          var resP = await fetch("https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=10", { headers: headers });
          var dataP = await resP.json();
          bar.style.width = "75%";
          if (dataP.connections) {
            globalDossie.contacts = dataP.connections.map(function (c) {
              return {
                nome: (c.names && c.names[0] && c.names[0].displayName) || "(sem nome)",
                email: (c.emailAddresses && c.emailAddresses[0] && c.emailAddresses[0].value) || ""
              };
            });
          }
        } catch (e) { console.warn("Erro nos Contatos:", e); }

        try {
          var resT = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?maxResults=10", { headers: headers });
          var dataT = await resT.json();
          bar.style.width = "90%";
          if (dataT.items) {
            globalDossie.tasks = dataT.items.map(function (t) {
              return { titulo: t.title || "(sem título)", status: t.status || "", prazo: t.due || "" };
            });
          }
        } catch (e) { console.warn("Erro nas Tarefas:", e); }
      } else {
        delete globalDossie.fonte;
        $("sync-status").textContent = "Sem token do Google. Seguimos só com o cadastro.";
      }

      try { await saveToSupabase(user); } catch (e) { console.warn("save:", e); }
      await logInteraction(user, "sync", {
        calendar: (globalDossie.calendar || []).length,
        youtube: (globalDossie.youtube || []).length,
        tasks: (globalDossie.tasks || []).length
      });
      await upsertPublicSummary(user);
      bar.style.width = "100%";
      $("sync-status").textContent = token ? "Rastro digital sincronizado" : "Cadastro pronto. Responda as três perguntas.";
      setTimeout(goToPreferences, token ? 700 : 400);
    } catch (err) {
      console.error("Falha geral na coleta", err);
      $("sync-status").textContent = "Não deu para sincronizar o Google. Vamos às três perguntas.";
      setTimeout(goToPreferences, 500);
    }
  }

  async function oauth(provider) {
    setStatus("status-auth", "Redirecionando…");
    var options = { redirectTo: window.location.origin + window.location.pathname };
    if (provider === "google") {
      options.scopes = GOOGLE_SCOPES;
      options.queryParams = { access_type: "offline", prompt: "consent" };
    }
    var result = await sb.auth.signInWithOAuth({ provider: provider, options: options });
    if (result.error) setStatus("status-auth", "Erro: " + result.error.message, true);
  }

  async function startGoogle() {
    if (authBusy) return;
    if (!(await requireClient())) return;
    authBusy = true;
    try {
      revealApp();
      showScreen("screen-login");
      await oauth("google");
    } finally {
      authBusy = false;
    }
  }

  async function startMicrosoft() {
    if (authBusy) return;
    if (!(await requireClient())) return;
    authBusy = true;
    try {
      revealApp();
      showScreen("screen-login");
      await oauth("azure");
    } finally {
      authBusy = false;
    }
  }

  function visitorNameValue() {
    var input = $("visitor-name");
    if (!input || !G) return "";
    return G.normalizeVisitorName(input.value);
  }

  function prefillVisitorName() {
    var input = $("visitor-name");
    if (!input || input.value.trim() || !currentPaintUser) return;
    var name = P.displayName(currentPaintUser, sessionCode);
    if (/^Visitante(\s|$)/.test(name)) return;
    input.value = name;
  }

  function paintSaveCopy() {
    var guest = guestIntent || !currentPaintUser || P.isGuest(currentPaintUser);
    var note = $("guest-save-note");
    var btn = $("btn-save-questionnaire");
    if (note) {
      note.textContent = guest
        ? "Sem conta. Dá para salvar como visitante: escreva o nome e responda as três perguntas. A casa é inferida — você não escolhe o dojo. O Google não é necessário."
        : "Conta Google conectada. O nome pode ser o da conta. Salvar grava o perfil inferido neste código. Quem não tem conta usa o mesmo questionário como visitante.";
    }
    if (btn) btn.textContent = guest ? "Salvar sem conta e gerar o código" : "Salvar perfil e gerar o código";
  }

  function renderSessionFields(fields) {
    var dl = $("ready-records");
    if (!dl) return;
    dl.replaceChildren();
    (fields || []).forEach(function (pair) {
      var dt = document.createElement("dt");
      dt.textContent = pair[0];
      var dd = document.createElement("dd");
      dd.textContent = pair[1];
      if (pair[0] === "Código da sessão") dd.className = "record-code";
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
  }

  function paintTraits(scores) {
    var list = $("ready-traits");
    if (!list || !Z) return;
    list.replaceChildren();
    var cap = typeof Z.scoreCap === "function" ? Z.scoreCap() : 15;
    Z.PROFILE_IDS.forEach(function (id) {
      var score = scores && scores[id] ? scores[id] : 0;
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.className = "trait-name";
      name.textContent = Z.META[id].archetype;
      var track = document.createElement("span");
      track.className = "trait-track";
      var fill = document.createElement("span");
      fill.className = "trait-fill";
      fill.style.width = Math.round((score / cap) * 100) + "%";
      track.appendChild(fill);
      var value = document.createElement("span");
      value.className = "trait-score";
      value.textContent = String(score);
      li.appendChild(name);
      li.appendChild(track);
      li.appendChild(value);
      list.appendChild(li);
    });
  }

  function paintHouse(house) {
    ["luz", "som", "clima"].forEach(function (key) {
      var el = $("ready-" + key);
      if (el) el.textContent = house && house[key] ? house[key] : "";
    });
  }

  var historyTimer = null;
  var historyChannel = null;

  function paintAlvo(scores) {
    var host = $("ready-alvo");
    if (!host || !Z) return;
    host.replaceChildren();
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 160 160");
    var cx = 80;
    var cy = 80;
    var radius = 58;
    [0.33, 0.66, 1].forEach(function (scale) {
      var ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      ring.setAttribute("cx", String(cx));
      ring.setAttribute("cy", String(cy));
      ring.setAttribute("r", String(radius * scale));
      ring.setAttribute("class", "alvo-ring");
      svg.appendChild(ring);
    });
    var cap = typeof Z.scoreCap === "function" ? Z.scoreCap() : 15;
    var ids = Z.PROFILE_IDS;
    var points = ids.map(function (id, index) {
      var angle = -Math.PI / 2 + (index * Math.PI * 2) / ids.length;
      var amount = scores && scores[id] ? scores[id] : 0;
      var reach = 14 + (Math.max(0, Math.min(cap, amount)) / cap) * (radius - 14);
      return [cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach, angle];
    });
    var shape = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    shape.setAttribute("class", "alvo-shape");
    shape.setAttribute("points", points.map(function (point) {
      return point[0].toFixed(1) + "," + point[1].toFixed(1);
    }).join(" "));
    svg.appendChild(shape);
    points.forEach(function (point, index) {
      var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      var lx = cx + Math.cos(point[2]) * (radius + 14);
      var ly = cy + Math.sin(point[2]) * (radius + 14);
      label.setAttribute("x", lx.toFixed(1));
      label.setAttribute("y", ly.toFixed(1));
      label.setAttribute("class", "alvo-label");
      label.textContent = Z.META[ids[index]].letter;
      svg.appendChild(label);
    });
    host.appendChild(svg);
  }

  function revealParchment() {
    var scroll = $("ready-scroll");
    if (!scroll) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroll.classList.remove("is-open");
    if (reduce) {
      scroll.classList.add("is-open", "is-settled");
      return;
    }
    void scroll.offsetWidth;
    scroll.classList.add("is-open");
  }

  async function accessToken() {
    if (!sb || !sb.auth || typeof sb.auth.getSession !== "function") return "";
    try {
      var got = await sb.auth.getSession();
      return (got && got.data && got.data.session && got.data.session.access_token) || "";
    } catch (err) {
      return "";
    }
  }

  async function refreshHistory() {
    var list = $("ready-timeline");
    if (!list || !window.GenjutsuHistory) return;
    var token = await accessToken();
    if (!token) {
      window.GenjutsuHistory.render(list, []);
      return;
    }
    var query = sessionCode ? "?code=" + encodeURIComponent(sessionCode) : "";
    try {
      var res = await fetch("/api/gen/history" + query, {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store"
      });
      if (!res.ok) return;
      var body = await res.json();
      window.GenjutsuHistory.render(list, body.entries || []);
    } catch (err) {
      /* a leitura do histórico espera a próxima tentativa */
    }
  }

  function watchHistory(user) {
    refreshHistory();
    if (historyTimer) clearInterval(historyTimer);
    historyTimer = setInterval(refreshHistory, 4000);
    if (!sb || !user || typeof sb.channel !== "function") return;
    if (historyChannel) {
      try { sb.removeChannel(historyChannel); } catch (err) { /* canal antigo */ }
    }
    historyChannel = sb.channel("gen-history-" + user.id)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "gen_history",
        filter: "user_id=eq." + user.id
      }, function () { refreshHistory(); })
      .subscribe();
  }

  function paintReady(saved) {
    var phrase = saved && saved.persona ? saved.persona.phrase : "";
    if ($("ready-phrase")) $("ready-phrase").textContent = phrase || "";
    var profile = saved && saved.profile;
    var meta = profile && Z && Z.META[profile.profile_id];
    var sign = $("ready-profile");
    if (sign) {
      sign.hidden = !meta;
      sign.textContent = meta ? meta.archetype : "";
    }
    var kanji = $("ready-kanji");
    if (kanji) kanji.textContent = meta ? meta.kanji : "";
    var title = $("ready-title");
    if (title) title.textContent = meta ? meta.title : "";
    paintTraits(profile && profile.scores);
    paintAlvo(profile && profile.scores);
    var sumi = $("ready-sumi");
    if (sumi) sumi.dataset.profile = profile && profile.profile_id ? profile.profile_id : "";
    paintHouse(meta && meta.house);
    var code = (saved && saved.sessionCode) || sessionCode || "";
    var codeEl = $("ready-quest-code");
    if (codeEl) codeEl.textContent = code || "—";
    renderSessionFields(saved && saved.fields);
    var readyNote = $("ready-guest-note");
    if (readyNote) readyNote.hidden = !(saved && saved.guest);
    revealParchment();
    watchHistory(saved && saved.user);
  }

  function renderQuestProfile(resolved) {
    var defined = !!(resolved && resolved.profile_id);
    var label = defined ? "Perfil do Quest: " + resolved.letter + " · " + resolved.archetype : "";
    var el = $("quiz-profile");
    if (el) {
      el.hidden = !defined;
      el.textContent = label;
    }
    var readyNote = $("ready-guest-note");
    if (readyNote) {
      var guest = guestIntent || (currentPaintUser && P.isGuest(currentPaintUser));
      readyNote.hidden = !guest;
    }
  }

  function selectedValue(field) {
    var current = document.querySelector('.option.selected[data-field="' + field + '"]');
    return current ? current.dataset.value : "";
  }

  function quizAnswers() {
    if (!Z) return ["", "", ""];
    return Z.QUESTIONS.map(function (question) { return selectedValue(question.id); });
  }

  async function startGuest() {
    if (authBusy) return;
    if (!(await requireClient())) return;
    authBusy = true;
    try {
      var existing = await sb.auth.getSession();
      var session = existing && existing.data && existing.data.session;
      var user = session && session.user;
      guestIntent = !user || P.isGuest(user);
      journeyPhase = "quiz";
      if (user) {
        journeyUserId = user.id;
        paintIdentity(user);
      }
      revealApp();
      showScreen("screen-questionnaire");
      setStatus("status-questionnaire", guestIntent
        ? "Escreva seu nome e responda as três perguntas. A gravação não pede login Google."
        : "A conta já tem nome. Responda as três perguntas. Sua conta Google já está conectada.");
    } finally {
      authBusy = false;
    }
  }

  async function leaveJourney() {
    journeyPhase = "leaving";
    try {
      if (sb) await sb.auth.signOut();
    } catch (e) {}
    journeyPhase = "";
    showLoggedOut();
    showLanding();
  }

  document.querySelectorAll(".option").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var field = btn.dataset.field;
      document.querySelectorAll('.option[data-field="' + field + '"]').forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("selected", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderQuestProfile(G.selection.apply(null, quizAnswers()));
    });
  });

  $("btn-google").addEventListener("click", startGoogle);
  $("btn-guest").addEventListener("click", startGuest);
  $("btn-google-bottom").addEventListener("click", startGoogle);
  $("btn-guest-bottom").addEventListener("click", startGuest);
  $("btn-nav-login").addEventListener("click", async function () {
    if (!(await requireClient())) return;
    revealApp();
    showScreen("screen-login");
  });
  $("btn-scroll-more").addEventListener("click", function () {
    $("como-funciona").scrollIntoView({ behavior: "smooth" });
  });

  $("btn-login").addEventListener("click", startGoogle);
  $("btn-guest-login").addEventListener("click", startGuest);
  $("btn-login-ms").addEventListener("click", startMicrosoft);
  $("btn-skip-sync").addEventListener("click", goToPreferences);
  $("btn-relogin").addEventListener("click", startGoogle);
  $("btn-relogin-ms").addEventListener("click", startMicrosoft);
  $("btn-upgrade-google").addEventListener("click", startGoogle);
  $("btn-logout").addEventListener("click", leaveJourney);
  $("btn-leave-ready").addEventListener("click", leaveJourney);

  $("btn-save-questionnaire").addEventListener("click", async function () {
    var answers = quizAnswers();
    var visitorName = visitorNameValue();
    var savingAsGuest = guestIntent || !currentPaintUser || P.isGuest(currentPaintUser);
    var nameInput = $("visitor-name");
    if (savingAsGuest && !visitorName) {
      if (nameInput) {
        nameInput.setAttribute("aria-invalid", "true");
        nameInput.focus();
      }
      setStatus("status-questionnaire", "Escreva seu nome antes de salvar.", true);
      return;
    }
    if (nameInput) nameInput.removeAttribute("aria-invalid");
    if (!G.selection(answers[0], answers[1], answers[2])) {
      setStatus("status-questionnaire", "Responda as três perguntas antes de salvar.", true);
      return;
    }
    if (!sb) {
      setStatus("status-questionnaire", "A conexão com o Supabase não está pronta.", true);
      return;
    }
    setStatus("status-questionnaire", savingAsGuest
      ? "Salvando como visitante, sem conta…"
      : "Salvando suas preferências…");
    saveInProgress = true;
    try {
      var saved = await G.saveWithoutLogin({
        auth: sb.auth,
        folga: answers[0],
        problema: answers[1],
        festa: answers[2],
        dossier: globalDossie,
        isGuest: P.isGuest,
        emailFor: P.emailFor,
        avatarFor: function (user) {
          var avatar = P.avatarFor(user);
          if (avatar.charAt(0) === "/") avatar = location.origin + avatar;
          return avatar;
        },
        visitorName: visitorName,
        personality: P.buildPersonality,
        remember: function (dossier) { globalDossie = dossier; },
        ensureSession: allocateSessionCode,
        activateSession: function (code) {
          return sb.rpc("genjutsu_set_current_session", { p_code: code });
        },
        writeDossier: function (row) {
          return sb.from("dossiers").upsert(row, { onConflict: "user_id" });
        },
        writeSummary: function (row) {
          return sb.from("session_summaries").insert(row);
        }
      });
      guestIntent = saved.guest;
      journeyUserId = saved.user.id;
      currentPaintUser = saved.user;
      if (saved.guest && visitorName) {
        var avatar = location.origin + "/assets/guest-avatar.jpg";
        try {
          await sb.auth.updateUser({
            data: { full_name: visitorName, avatar_url: avatar, guest: true }
          });
        } catch (e) {
          console.warn("nome do visitante:", e);
        }
      }
      renderSessionCode(saved.sessionCode);
      paintIdentity(saved.user);
      paintReady(saved);
      await logInteraction(saved.user, "quiz", globalDossie.preferencias);
      setStatus("status-questionnaire", G.savedMessage(saved.sessionCode, saved.profile, {
        guest: saved.guest,
        profilePendingSql: saved.profilePendingSql
      }));
      journeyPhase = "ready";
      showScreen("screen-ready");
      setStatus("status-questionnaire", "");
    } catch (err) {
      setStatus("status-questionnaire", err.message || "Erro ao salvar.", true);
    } finally {
      saveInProgress = false;
    }
  });

  $("btn-save-config").addEventListener("click", function () {
    var url = $("input-url").value.trim();
    var key = $("input-key").value.trim();
    if (!url || !key) {
      setStatus("status-config", "Preencha a URL e a Anon Key.", true);
      return;
    }
    sessionStorage.setItem("genjutsu_supabase_url", url);
    sessionStorage.setItem("genjutsu_supabase_key", key);
    setupSupabaseClient(url, key, "session");
    showScreen("screen-login");
  });

  $("btn-clear-config").addEventListener("click", function () {
    sessionStorage.removeItem("genjutsu_supabase_url");
    sessionStorage.removeItem("genjutsu_supabase_key");
    $("input-url").value = "";
    $("input-key").value = "";
    setStatus("status-config", "Chaves locais apagadas.");
  });

  $("btn-close-config").addEventListener("click", showLanding);
  $("btn-open-config").addEventListener("click", function () {
    openConfigFallback("");
  });

  configReady = (async function main() {
    var config = await loadConfig();
    if (config) setupSupabaseClient(config.supabaseUrl, config.supabaseAnonKey, config.source);
  })();
})();
