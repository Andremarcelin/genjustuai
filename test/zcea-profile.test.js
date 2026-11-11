const test = require("node:test");
const assert = require("node:assert/strict");
const zcea = require("../js/zcea-profile.js");

const CANON = [
  ["ordem", "respira", "canto", "Zen"],
  ["sistema", "modelo", "mapa", "Cyber"],
  ["impulso", "atalho", "pista", "Excentrico"],
  ["gente", "junto", "anel", "Acolhedor"],
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

test("each option weights one profile more than the others", () => {
  assert.equal(zcea.QUESTIONS.length, 3);
  for (const question of zcea.QUESTIONS) {
    const expected = question.id === "folga" ? 5 : 4;
    assert.equal(question.options.length, expected);
    const primaries = new Set();
    for (const option of question.options) {
      const top = [...zcea.PROFILE_IDS].sort((a, b) => option.scores[b] - option.scores[a])[0];
      assert.equal(top, option.primary);
      assert.ok(option.scores[option.primary] > 0);
      primaries.add(option.primary);
      assert.match(option.label, /^[a-zà-ú]/);
      assert.doesNotMatch(option.label, /luz|madeira|neon|bambu|chá|seda/i);
    }
    assert.deepEqual([...primaries].sort(), [...zcea.PROFILE_IDS].sort());
  }
  const dormir = zcea.QUESTIONS[0].options.find((option) => option.id === "dormir");
  assert.ok(dormir);
  assert.equal(dormir.primary, "Zen");
  assert.deepEqual(dormir.scores, { Zen: 4, Acolhedor: 3, Cyber: 0, Excentrico: 0 });
  assert.match(dormir.label, /dorme até tarde e passa o dia descansando/);
});

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

test("all 80 combinations resolve, with a balanced deterministic split", () => {
  const counts = { Zen: 0, Cyber: 0, Excentrico: 0, Acolhedor: 0 };
  let ties = 0;
  const combos = allCombos();
  assert.equal(combos.length, 80);
  for (const [a, b, c] of combos) {
    const first = zcea.resolve(a, b, c);
    const second = zcea.resolve({ folga: a, problema: b, festa: c });
    assert.equal(first.profile_id, second.profile_id);
    assert.ok(zcea.PROFILE_IDS.includes(first.profile_id));
    counts[first.profile_id] += 1;
    if (first.tie) ties += 1;
  }
  assert.deepEqual(counts, { Zen: 24, Cyber: 15, Excentrico: 18, Acolhedor: 23 });
  assert.equal(ties, 7);
  assert.equal(Object.values(counts).reduce((sum, n) => sum + n, 0), 80);
  for (const id of zcea.PROFILE_IDS) assert.ok(counts[id] >= 12 && counts[id] <= 28);
});

test("choosing dormir still yields a valid ZCEA profile", () => {
  const got = zcea.resolve("dormir", "respira", "canto");
  assert.equal(got.profile_id, "Zen");
  assert.equal(got.letter, "Z");
  assert.equal(got.archetype, "Zen");
  assert.ok(zcea.PROFILE_IDS.includes(got.profile_id));
  assert.equal(got.scores.Zen, 14);
  assert.equal(got.scores.Acolhedor, 6);
  assert.equal(zcea.optionLabel("folga", "dormir"), "dorme até tarde e passa o dia descansando");
});

test("ties break in a fixed order and incomplete answers stay empty", () => {
  assert.deepEqual(zcea.TIE_BREAK, ["Zen", "Acolhedor", "Cyber", "Excentrico"]);
  assert.equal(zcea.resolve("", "", "").profile_id, null);
  assert.equal(zcea.resolve("ordem", "respira", "").profile_id, null);
  assert.equal(zcea.resolve("ordem", "nublado", "canto").profile_id, null);
  assert.equal(zcea.resolve("Ordem", "respira", "canto").profile_id, null);
  assert.equal(zcea.sanitize("Ritmo recolhido"), null);
  assert.equal(zcea.sanitize("Excêntrico"), null);
  assert.equal(zcea.sanitize("Excentrico"), "Excentrico");
  assert.equal(zcea.label("nao-existe"), "");
  const tied = zcea.resolve("ordem", "modelo", "pista");
  assert.equal(tied.tie, true);
  assert.equal(zcea.resolve({ folga: "ordem", problema: "modelo", festa: "pista" }).profile_id, tied.profile_id);
});
