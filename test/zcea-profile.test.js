const test = require("node:test");
const assert = require("node:assert/strict");
const zcea = require("../js/zcea-profile.js");

const EXPECTED = [
  ["tranquilo", "frio", "Zen", "Z", "Zen"],
  ["tranquilo", "quente", "Acolhedor", "A", "Acolhedor"],
  ["tranquilo", "ameno", "Acolhedor", "A", "Acolhedor"],
  ["agitado", "frio", "Cyber", "C", "Cyber"],
  ["agitado", "ameno", "Cyber", "C", "Cyber"],
  ["agitado", "quente", "Excentrico", "E", "Excêntrico"],
];

test("every quiz pair maps to exactly one ZCEA profile", () => {
  const seen = new Set();
  for (const [ambiente, tempo, id, letter, archetype] of EXPECTED) {
    const got = zcea.resolve(ambiente, tempo);
    assert.deepEqual(got, { profile_id: id, letter, archetype });
    seen.add(id);
    assert.equal(zcea.label(id), `${letter} · ${archetype}`);
  }
  assert.deepEqual([...seen].sort(), [...zcea.PROFILE_IDS].sort());
  assert.equal(Object.keys(zcea.MAP).length, 6);
});

test("incomplete or unknown answers do not invent a profile", () => {
  assert.equal(zcea.resolve("", "").profile_id, null);
  assert.equal(zcea.resolve("tranquilo", "").profile_id, null);
  assert.equal(zcea.resolve("agitado", "nublado").profile_id, null);
  assert.equal(zcea.resolve("Tranquilo", "frio").profile_id, null);
  assert.equal(zcea.sanitize("Ritmo recolhido"), null);
  assert.equal(zcea.sanitize("Excêntrico"), null);
  assert.equal(zcea.sanitize("Excentrico"), "Excentrico");
  assert.equal(zcea.label("nao-existe"), "");
});
