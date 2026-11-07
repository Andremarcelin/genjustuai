// Lista o histórico já gravado. Não guarda chave nenhuma.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function who(role) {
    if (role === "gen") return "Gen";
    if (role === "house") return "Casa";
    return "Você";
  }

  function render(list, rows) {
    if (!list) return;
    list.replaceChildren();
    var items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      var empty = document.createElement("li");
      empty.className = "history-empty";
      empty.textContent = "A casa ainda não registrou fala nem gesto.";
      list.appendChild(empty);
      return;
    }
    items.forEach(function (row) {
      var li = document.createElement("li");
      li.className = "history-item history-" + (row.role || "visitor");
      var name = document.createElement("span");
      name.className = "history-who";
      name.textContent = who(row.role);
      var text = document.createElement("p");
      text.textContent = String(row.body || "");
      li.appendChild(name);
      li.appendChild(text);
      list.appendChild(li);
    });
  }

  return { render: render };
});
