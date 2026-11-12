(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuChatFormat = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function splitTrailingPunctuation(raw) {
    var text = String(raw || "");
    var match = text.match(/^(.*?)([),.;:!?]+)$/);
    if (!match) return { url: text, trail: "" };
    if (!/[A-Za-z0-9/_~-]$/.test(match[1])) return { url: text, trail: "" };
    return { url: match[1], trail: match[2] };
  }

  function linkLabel(href) {
    try {
      var parsed = new URL(href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "link";
      var host = String(parsed.hostname || "").replace(/^www\./i, "");
      return host || "link";
    } catch (err) {
      return "link";
    }
  }

  function safeHref(raw) {
    try {
      var parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.href;
    } catch (err) {
      return "";
    }
  }

  function formatChatHtml(text) {
    var src = String(text == null ? "" : text);
    var out = "";
    var last = 0;
    URL_RE.lastIndex = 0;
    var match;
    while ((match = URL_RE.exec(src))) {
      out += escapeHtml(src.slice(last, match.index));
      var parts = splitTrailingPunctuation(match[0]);
      var href = safeHref(parts.url);
      if (!href) {
        out += escapeHtml(match[0]);
      } else {
        var label = linkLabel(href);
        out += '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' + escapeHtml(label) + "</a>" + escapeHtml(parts.trail);
      }
      last = match.index + match[0].length;
    }
    out += escapeHtml(src.slice(last));
    return out;
  }

  return {
    escapeHtml: escapeHtml,
    linkLabel: linkLabel,
    formatChatHtml: formatChatHtml
  };
});
