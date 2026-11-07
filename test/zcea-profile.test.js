const test = require("node:test");
const assert = require("node:assert/strict");
const zcea = require("../js/zcea-profile.js");

const CANON = [
  ["agua", "madeira", "aceno", "Zen"],
  ["pulso", "neon", "enigma", "Cyber"],
  ["cor", "seda", "porta", "Excentrico"],
  ["mesa", "bambu", "cha", "Acolhedor"],
];

function allCombos() {
  const questions = zcea.QUESTIONS;
  const out = [];
  for (const a of questions[0].options) {
    for (const b of questions[1].options) {
      for (const c of questions[2].options) out.push([a.id, b.id, c.id]);
    }
  }
  return out;
}

test("three answers map to one profile, and every profile is reachable", () => {
  assert.equal(zcea.QUESTIONS.length, 3);
  const seen = new Set();
  for (const [recarga, atmosfera, acolhida, id] of CANON) {
    const got = zcea.resolve(recarga, atmosfera, acolhida);
    assert.equal(got.profile_id, id);
    assert.equal(got.letter, zcea.META[id].letter);
    assert.equal(got.archetype, zcea.META[id].archetype);
    assert.equal(zcea.label(id), `${zcea.META[id].letter} · ${zcea.META[id].archetype}`);
    seen.add(id);
  }
  assert.deepEqual([...seen].sort(), [...zcea.PROFILE_IDS].sort());
});

test("all 64 combinations resolve, with a balanced deterministic split", () => {
  const counts = { Zen: 0, Cyber: 0, Excentrico: 0, Acolhedor: 0 };
  let ties = 0;
  const combos = allCombos();
  assert.equal(combos.length, 64);
  for (const [a, b, c] of combos) {
    const first = zcea.resolve(a, b, c);
    const second = zcea.resolve({ recarga: a, atmosfera: b, acolhida: c });
    assert.equal(first.profile_id, second.profile_id);
    assert.ok(zcea.PROFILE_IDS.includes(first.profile_id));
    counts[first.profile_id] += 1;
    if (first.tie) ties += 1;
  }
  assert.deepEqual(counts, { Zen: 17, Cyber: 13, Excentrico: 16, Acolhedor: 18 });
  assert.equal(ties, 5);
  assert.equal(Object.values(counts).reduce((sum, n) => sum + n, 0), 64);
  for (const id of zcea.PROFILE_IDS) assert.ok(counts[id] >= 12 && counts[id] <= 20);
});

test("ties break in a fixed order and incomplete answers stay empty", () => {
  assert.deepEqual(zcea.TIE_BREAK, ["Zen", "Acolhedor", "Cyber", "Excentrico"]);
  assert.equal(zcea.resolve("", "", "").profile_id, null);
  assert.equal(zcea.resolve("agua", "madeira", "").profile_id, null);
  assert.equal(zcea.resolve("agua", "nublado", "aceno").profile_id, null);
  assert.equal(zcea.resolve("Agua", "madeira", "aceno").profile_id, null);
  assert.equal(zcea.sanitize("Ritmo recolhido"), null);
  assert.equal(zcea.sanitize("Excêntrico"), null);
  assert.equal(zcea.sanitize("Excentrico"), "Excentrico");
  assert.equal(zcea.label("nao-existe"), "");
  const tied = zcea.resolve("agua", "neon", "porta");
  assert.equal(tied.tie, true);
  assert.equal(zcea.resolve("agua", "neon", "porta").profile_id, tied.profile_id);
});
