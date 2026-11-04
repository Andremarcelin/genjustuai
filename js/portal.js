(function () {
  var P = window.GenjutsuPersonality;
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
    var name = P.displayName(user, sessionCode);
    var email = P.emailFor(user);
    var avatar = P.avatarFor(user);
    var guest = P.isGuest(user);
    ["avatar", "ready-avatar"].forEach(function (id) {
      var img = $(id);
      if (!img) return;
      img.src = avatar;
      img.alt = guest ? "Silhueta de visitante" : "Foto de perfil";
    });
    $("user-name").textContent = name;
    $("ready-name").textContent = name;
    $("sync-user").textContent = name;
    var emailLine = email || (guest ? "Sem conta Google" : "");
    $("user-email").textContent = emailLine;
    $("ready-email").textContent = emailLine;
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
    var guest = currentPaintUser ? P.isGuest(currentPaintUser) : false;
    var step = { "screen-login": 1, "screen-sync": 2, "screen-questionnaire": 3, "screen-ready": 4 }[id] || 1;
    setProgress(step, guest);
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
    var result = await sb.from("session_summaries").upsert(
      {
        session_code: sessionCode,
        user_id: user.id,
        display_name: persona.displayName,
        personality_text: persona.text,
        archetype: persona.archetype,
        updated_at: new Date().toISOString()
      },
      { onConflict: "session_code" }
    );
    if (result.error) console.warn("summary:", result.error);
  }

  window.genjutsuLogConversation = logConversation;

  async function saveToSupabase(user) {
    if (!sb || !user) return;
    if (!sessionCode) await ensureSessionCode(user);
    var persona = P.buildPersonality(user, globalDossie, sessionCode);
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
    var result = await sb.from("dossiers").upsert(row, { onConflict: "user_id" });
    if (result.error) console.warn("dossier:", result.error);
  }

  function showLoggedOut() {
    if (journeyPhase === "leaving") return;
    journeyUserId = "";
    journeyPhase = "";
    inflightUserId = "";
    inflight = null;
    currentPaintUser = null;
    $("logged-out").classList.remove("hidden");
    $("logged-in").classList.add("hidden");
    setStatus("status-auth", "");
    setStatus("status-questionnaire", "");
    document.querySelectorAll(".house-card").forEach(function (b) {
      b.classList.remove("selected");
      b.setAttribute("aria-pressed", "false");
    });
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
      $("sync-status").textContent = token ? "Rastro digital sincronizado" : "Cadastro pronto. Escolha a casa.";
      setTimeout(goToPreferences, token ? 700 : 400);
    } catch (err) {
      console.error("Falha geral na coleta", err);
      $("sync-status").textContent = "Não deu para sincronizar o Google. Vamos à casa.";
      setTimeout(goToPreferences, 500);
    }
  }

  function anonymousHelp(error) {
    var msg = (error && (error.message || error.code || "")) + "";
    if (/anonymous/i.test(msg)) {
      return "Sessões anônimas estão desligadas neste Supabase. Em Authentication → Providers, ative Anonymous sign-ins.";
    }
    return "Não foi possível entrar sem conta: " + (error.message || "erro desconhecido");
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

  async function startGuest() {
    if (authBusy) return;
    if (!(await requireClient())) return;
    authBusy = true;
    revealApp();
    showScreen("screen-login");
    setStatus("status-auth", "Abrindo sessão de visitante…");
    try {
      var result = await sb.auth.signInAnonymously();
      if (result.error) {
        setStatus("status-auth", anonymousHelp(result.error), true);
        return;
      }
      var user = result.data && (result.data.user || (result.data.session && result.data.session.user));
      if (user) await showLoggedIn(user);
    } catch (e) {
      setStatus("status-auth", anonymousHelp(e), true);
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

  document.querySelectorAll(".house-card").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".house-card").forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("selected", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
  });

  function selectedHouse() {
    var current = document.querySelector(".house-card.selected");
    return current ? current.dataset.casa : "";
  }

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
    var casa = selectedHouse();
    var house = P.HOUSES[casa];
    if (!house) {
      setStatus("status-questionnaire", "Escolha uma casa antes de salvar.", true);
      return;
    }
    setStatus("status-questionnaire", "Salvando suas preferências…");
    try {
      var result = await sb.auth.getUser();
      var user = result && result.data && result.data.user;
      if (!user) throw new Error("Sessão expirada.");
      if (P.isGuest(user)) globalDossie.fonte = "convidado";
      globalDossie.preferencias = {
        casa: house.id,
        clima_ambiente: house.vibe,
        clima_tempo: house.tempo,
        paleta: house.palette
      };
      await saveToSupabase(user);
      await logInteraction(user, "quiz", globalDossie.preferencias);
      await upsertPublicSummary(user);
      paintIdentity(user);
      setStatus("status-questionnaire", "✓ Perfil salvo. Código da sessão: " + sessionCode);
      journeyPhase = "ready";
      showScreen("screen-ready");
    } catch (err) {
      setStatus("status-questionnaire", "Erro ao salvar: " + err.message, true);
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
