(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuCodigo = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", api.mount);
    else api.mount();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  var LOOKUP_ERROR = "Não achei esse código. Confere as letras?";

  function normalizeCode(raw) {
    return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }

  function splitCode(raw) {
    var code = normalizeCode(raw);
    var chars = ["", "", "", "", "", ""];
    var i;
    for (i = 0; i < code.length && i < 6; i++) chars[i] = code.charAt(i);
    return chars;
  }

  function errorFor(status, error) {
    if (status === 404 || error === "not_found" || error === "invalid_code" || status === 400) {
      return LOOKUP_ERROR;
    }
    return "Não consegui abrir essa sessão agora. Tenta de novo.";
  }

  function inputsOf(rootEl) {
    return rootEl ? Array.prototype.slice.call(rootEl.querySelectorAll("input")) : [];
  }

  function readBoxes(inputs) {
    return normalizeCode(inputs.map(function (el) { return el.value || ""; }).join(""));
  }

  function writeBoxes(inputs, raw) {
    var chars = splitCode(raw);
    inputs.forEach(function (el, i) { el.value = chars[i]; });
    return chars.join("");
  }

  function wireBoxes(rootEl) {
    var inputs = inputsOf(rootEl);
    inputs.forEach(function (el, i) {
      el.addEventListener("input", function () {
        var next = normalizeCode(el.value);
        if (next.length > 1) {
          writeBoxes(inputs, next);
          inputs[Math.min(next.length, inputs.length) - 1].focus();
          return;
        }
        el.value = next;
        if (el.value && i < inputs.length - 1) inputs[i + 1].focus();
      });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !el.value && i > 0) {
          inputs[i - 1].focus();
          inputs[i - 1].value = "";
          e.preventDefault();
        }
      });
    });
    if (rootEl) {
      rootEl.addEventListener("paste", function (e) {
        var text = (e.clipboardData || window.clipboardData).getData("text");
        var code = normalizeCode(text);
        if (code.length < 2) return;
        e.preventDefault();
        writeBoxes(inputs, code);
        inputs[Math.min(code.length, inputs.length) - 1].focus();
      });
    }
    return inputs;
  }

  function recordRows(session) {
    var name = (session && session.display_name) || "";
    var profile = (session && (session.profile_id || session.archetype)) || "";
    var rows = [];
    if (name) rows.push(["Nome", name]);
    if (profile) rows.push(["Perfil", profile]);
    return rows;
  }

  async function fetchSession(code, fetchImpl) {
    var fetchFn = fetchImpl || fetch;
    var res = await fetchFn("/api/session?code=" + encodeURIComponent(normalizeCode(code)), { cache: "no-store" });
    var body = {};
    try { body = await res.json(); } catch (e) { body = {}; }
    if (!res.ok || !body.session) {
      return { error: errorFor(res.status, body.error) };
    }
    return { session: body.session };
  }

  function paintReady(session, P, Z) {
    var code = String(session.session_code || session.id || "").toUpperCase();
    var profileId = (P && P.profileIdFrom)
      ? P.profileIdFrom(session.profile_id || session.archetype)
      : (session.profile_id || "");
    var name = session.display_name || "Visitante";
    var meta = Z && Z.META && profileId ? Z.META[profileId] : null;
    var who = document.getElementById("ready-who");
    if (who) who.textContent = name + (meta ? " · perfil " + meta.archetype : "");
    var proverb = P && P.proverbFor ? P.proverbFor(profileId, code) : "";
    var phrase = document.getElementById("ready-phrase");
    if (phrase) phrase.textContent = proverb || "";
    var codeEl = document.getElementById("ready-quest-code");
    if (codeEl) codeEl.textContent = code || "—";
    var house = meta && meta.house;
    var som = document.getElementById("ready-som-card");
    var clima = document.getElementById("ready-clima-card");
    if (som) som.textContent = house ? house.som : "";
    if (clima) clima.textContent = house ? house.clima : "";
    var thumb = document.getElementById("ready-house-thumb");
    if (thumb && profileId) {
      thumb.src = "/assets/casa/" + String(profileId).toLowerCase() + ".jpg";
      thumb.alt = "Casa " + profileId;
    }
    var title = document.getElementById("record-title");
    if (title) title.textContent = "Salvo sem conta";
    var dl = document.getElementById("ready-records");
    if (dl) {
      dl.replaceChildren();
      recordRows(session).forEach(function (pair) {
        var row = document.createElement("div");
        row.className = "record-row";
        var dt = document.createElement("dt");
        dt.textContent = pair[0];
        var dd = document.createElement("dd");
        dd.textContent = pair[1];
        row.appendChild(dt);
        row.appendChild(dd);
        dl.appendChild(row);
      });
    }
  }

  function codeFromLocation(loc) {
    var href = loc || (typeof location !== "undefined" ? location : { search: "", pathname: "" });
    var params = new URLSearchParams(href.search || "");
    var fromQuery = params.get("c") || params.get("code") || "";
    if (fromQuery) return normalizeCode(fromQuery);
    var parts = String(href.pathname || "").split("/").filter(Boolean);
    if (parts[0] === "codigo" && parts[1]) return normalizeCode(parts[1]);
    return "";
  }

  function mount() {
    var boxes = document.getElementById("code-boxes");
    var form = document.getElementById("code-form");
    var status = document.getElementById("code-status");
    var btn = document.getElementById("btn-open");
    var lookup = document.getElementById("lookup-wrap");
    var ready = document.getElementById("screen-ready");
    var other = document.getElementById("btn-other");
    if (!boxes || !form) return;
    var inputs = wireBoxes(boxes);
    var scope = root || (typeof window !== "undefined" ? window : globalThis);
    var P = scope.GenjutsuPersonality;
    var Z = scope.GenjutsuZcea;

    function setStatus(text) {
      if (status) status.textContent = text || "";
    }

    async function loadBank() {
      try {
        var res = await fetch("/data/proverbios.json", { cache: "no-store" });
        if (res.ok && P && P.setProverbBank) P.setProverbBank(await res.json());
      } catch (e) { /* fallback no personality.js */ }
    }

    async function openCode(raw) {
      await loadBank();
      var code = normalizeCode(raw);
      writeBoxes(inputs, code);
      if (code.length !== 6) {
        setStatus("Digite os 6 caracteres do seu código.");
        return;
      }
      setStatus("");
      if (btn) btn.disabled = true;
      try {
        var found = await fetchSession(code);
        if (found.error) {
          setStatus(found.error);
          return;
        }
        paintReady(found.session, P, Z);
        if (lookup) lookup.hidden = true;
        if (ready) ready.hidden = false;
      } catch (e) {
        setStatus(errorFor(503, "supabase_unreachable"));
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      openCode(readBoxes(inputs));
    });
    if (other) {
      other.addEventListener("click", function () {
        if (ready) ready.hidden = true;
        if (lookup) lookup.hidden = false;
        setStatus("");
        inputs[0].focus();
      });
    }

    loadBank().then(function () {
      var prefill = codeFromLocation();
      if (prefill) {
        writeBoxes(inputs, prefill);
        if (prefill.length === 6) openCode(prefill);
      }
    });
  }

  return {
    LOOKUP_ERROR: LOOKUP_ERROR,
    normalizeCode: normalizeCode,
    splitCode: splitCode,
    errorFor: errorFor,
    recordRows: recordRows,
    fetchSession: fetchSession,
    codeFromLocation: codeFromLocation,
    writeBoxes: writeBoxes,
    readBoxes: readBoxes,
    mount: mount
  };
});
