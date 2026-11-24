(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuSessionTokens = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function num(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  function fromSession(session) {
    var src = session || {};
    return {
      tokens_in: num(src.tokens_in),
      tokens_out: num(src.tokens_out),
      tokens_total: num(src.tokens_total),
      calls: num(src.calls),
      estimated: Boolean(src.tokens_estimated)
    };
  }

  function formatPt(value) {
    return num(value).toLocaleString("pt-BR");
  }

  function formatLine(session) {
    var u = fromSession(session);
    var line = "Esta sessão usou " + formatPt(u.tokens_total) + " tokens (entrada "
      + formatPt(u.tokens_in) + " · saída " + formatPt(u.tokens_out) + ")";
    if (u.estimated) line += " · parte estimada";
    return line;
  }

  function paint(el, session) {
    if (!el) return;
    var u = fromSession(session);
    el.hidden = false;
    el.replaceChildren();
    var total = document.createElement("span");
    total.className = "session-tokens-total";
    total.textContent = "Esta sessão usou " + formatPt(u.tokens_total) + " tokens";
    var split = document.createElement("span");
    split.className = "session-tokens-split";
    split.textContent = "entrada " + formatPt(u.tokens_in) + " · saída " + formatPt(u.tokens_out)
      + (u.estimated ? " · parte estimada" : "");
    el.appendChild(total);
    el.appendChild(split);
  }

  return { fromSession: fromSession, formatLine: formatLine, formatPt: formatPt, paint: paint };
});
