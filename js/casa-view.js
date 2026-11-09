(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuCasaView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function houseTitle(displayName) {
    var name = String(displayName || "").replace(/\s+/g, " ").trim();
    return name ? "Casa de " + name : "Sua casa";
  }

  function overlayLights(devices, room) {
    return (devices || [])
      .map(function (item) {
        return item;
      })
      .filter(function (item) { return item && item.overlay === room && item.on; });
  }

  return { houseTitle: houseTitle, overlayLights: overlayLights };
});
