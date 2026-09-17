const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Detector = require(path.join(__dirname, "..", "extension", "src", "language-detector.js"));
const fixtures = require(path.join(__dirname, "..", "train", "salary.json"));

test("UMD module exposes detectPostingLanguage via require", () => {
  assert.equal(typeof Detector.detectPostingLanguage, "function");
});

const ALL_CODES = ["en", "it", "fr", "de", "es", "pt", "nl", "pl", "unknown"];
const SCORE_LANGS = ["en", "it", "fr", "de", "es", "pt", "nl", "pl"];

test("result shape is { code, confidence, scores }", () => {
  const result = Detector.detectPostingLanguage("The team is hiring for this role");
  assert.ok(ALL_CODES.includes(result.code), `code: ${result.code}`);
  assert.equal(typeof result.confidence, "number");
  assert.ok(result.confidence >= 0 && result.confidence <= 1, `confidence: ${result.confidence}`);
  assert.deepEqual(Object.keys(result.scores).sort(), SCORE_LANGS.slice().sort());
  for (const lang of SCORE_LANGS) {
    assert.equal(typeof result.scores[lang], "number", `scores.${lang}`);
  }
});

test("english salary.json fixtures classify as en", () => {
  // Hand-picked indices verified as English postings (12/13/16/18 are
  // marker-free; 7 and 11 contain RAL/CCNL yet stay English overall).
  const englishIndices = [7, 11, 12, 13, 16, 18];
  for (const index of englishIndices) {
    const result = Detector.detectPostingLanguage(fixtures[index].description);
    assert.equal(
      result.code,
      "en",
      `fixture ${index} should be en, got ${result.code}: ${JSON.stringify(fixtures[index].description.slice(0, 60))}`
    );
  }
});

test("italian salary.json fixtures classify as it", () => {
  // Long Italian postings from the corpus.
  const italianIndices = [1, 2, 9, 10];
  for (const index of italianIndices) {
    const result = Detector.detectPostingLanguage(fixtures[index].description);
    assert.equal(
      result.code,
      "it",
      `fixture ${index} should be it, got ${result.code}: ${JSON.stringify(fixtures[index].description.slice(0, 60))}`
    );
  }
});

test("short and ambiguous inputs return unknown", () => {
  for (const input of ["Software Engineer", "Milano", ""]) {
    const result = Detector.detectPostingLanguage(input);
    assert.equal(result.code, "unknown", `input ${JSON.stringify(input)} should be unknown`);
    assert.equal(result.confidence, 0);
  }
});

test("two-word inputs return unknown", () => {
  for (const input of ["hola mundo", "contrat travail", "salaire brut"]) {
    const result = Detector.detectPostingLanguage(input);
    assert.equal(result.code, "unknown", `input ${JSON.stringify(input)} should be unknown`);
    assert.equal(result.confidence, 0);
  }
});

test("french postings classify as fr", () => {
  const postings = [
    "Nous recherchons un profil avec expérience pour un contrat à durée indéterminée avec rémunération brute annuelle et avantages chaque mois dans notre entreprise à Paris",
    "Nous offrons une rémunération brute annuelle avec contrat à durée indéterminée pour tous nos employés avec avantages et télétravail dans cette entreprise",
  ];
  for (const posting of postings) {
    assert.ok(posting.split(/\s+/).length >= 20 && posting.split(/\s+/).length <= 40);
    assert.equal(Detector.detectPostingLanguage(posting).code, "fr");
  }
});

test("german postings classify as de", () => {
  const postings = [
    "Wir suchen Mitarbeiter mit Erfahrung und bieten Vergütung nach Tarifvertrag mit Brutto Gehalt jährlich bei Vollzeit im Unternehmen mit Homeoffice jeden Monat",
    "Wir bieten eine Stelle in Vollzeit mit Vergütung und Tarifvertrag für alle Mitarbeiter mit Erfahrung im Team bei unserem Unternehmen mit monatlichem Gehalt",
  ];
  for (const posting of postings) {
    assert.ok(posting.split(/\s+/).length >= 20 && posting.split(/\s+/).length <= 40);
    assert.equal(Detector.detectPostingLanguage(posting).code, "de");
  }
});

test("spanish postings classify as es", () => {
  const postings = [
    "Buscamos perfil con experiencia para contrato indefinido con salario bruto anual según convenio con jornada completa y beneficios cada mes en nuestra empresa",
    "Ofrecemos empleo con contrato temporal y salario bruto anual bajo convenio colectivo con beneficios y jornada completa para todos nuestros empleados",
  ];
  for (const posting of postings) {
    assert.ok(posting.split(/\s+/).length >= 20 && posting.split(/\s+/).length <= 40);
    assert.equal(Detector.detectPostingLanguage(posting).code, "es");
  }
});

test("portuguese postings classify as pt", () => {
  const postings = [
    "Procuramos perfil com experiência para contrato com salário bruto anual e recrutamento para vaga de emprego com jornada e benefícios cada mês na nossa empresa",
    "Oferecemos vaga de emprego com contrato e salário bruto anual com benefícios e recrutamento aberto para todos os candidatos na nossa empresa este ano",
  ];
  for (const posting of postings) {
    assert.ok(posting.split(/\s+/).length >= 20 && posting.split(/\s+/).length <= 40);
    assert.equal(Detector.detectPostingLanguage(posting).code, "pt");
  }
});

test("dutch postings classify as nl", () => {
  const postings = [
    "Wij zoeken een profiel met ervaring voor een vast contract met bruto salaris per jaar volgens cao met voltijd en thuiswerken elke maand in ons bedrijf",
    "Wij bieden een vacature met vast contract en bruto salaris per maand volgens de cao met voltijd functie en voordelen voor alle medewerkers in het team",
  ];
  for (const posting of postings) {
    assert.ok(posting.split(/\s+/).length >= 20 && posting.split(/\s+/).length <= 40);
    assert.equal(Detector.detectPostingLanguage(posting).code, "nl");
  }
});

test("polish postings classify as pl", () => {
  const postings = [
    "Szukamy kandydatów z doświadczeniem na pełny etat z wynagrodzeniem brutto rocznie w procesie rekrutacja w naszej firmie każdego miesiąca z benefitami dla każdego",
    "Oferujemy stanowisko na umowę z wynagrodzeniem brutto i rekrutacja otwarta dla każdego kandydata z doświadczeniem w naszym zespole przez cały rok",
  ];
  for (const posting of postings) {
    assert.ok(posting.split(/\s+/).length >= 20 && posting.split(/\s+/).length <= 40);
    assert.equal(Detector.detectPostingLanguage(posting).code, "pl");
  }
});

test("ambiguous spanish-portuguese input never leaks to a third language", () => {
  const result = Detector.detectPostingLanguage("con contrato para todos");
  assert.ok(
    ["es", "pt", "unknown"].includes(result.code),
    `ambiguous input leaked to ${result.code}`
  );
});

test("nullish and non-string inputs return unknown without throwing", () => {
  for (const input of [null, undefined]) {
    const result = Detector.detectPostingLanguage(input);
    assert.equal(result.code, "unknown");
    assert.equal(result.confidence, 0);
  }
});

test("bare strong markers below the scored-word minimum stay unknown", () => {
  // "RAL 30k" scores 2 words and "CCNL Commercio" scores 3, both under
  // the detector's minimum of 4 scored words — thin text never guesses.
  for (const input of ["RAL 30k", "CCNL Commercio"]) {
    const result = Detector.detectPostingLanguage(input);
    assert.equal(result.code, "unknown", `input ${JSON.stringify(input)} should be unknown`);
  }
});

test("repeated weighted markers below the token-count minimum stay unknown", () => {
  // Weighted markers count as one token each: two strong tokens score 4
  // points but are only 2 matched tokens, under the minimum of 4.
  for (const input of ["CDI CDD", "CAO CAO", "convenio convenio"]) {
    const result = Detector.detectPostingLanguage(input);
    assert.equal(result.code, "unknown", `input ${JSON.stringify(input)} should be unknown`);
    assert.equal(result.confidence, 0);
  }
});

test("strong IT markers above the threshold classify as it", () => {
  const result = Detector.detectPostingLanguage("RAL 30k e CCNL Commercio confermati");
  assert.equal(result.code, "it");
  assert.ok(result.confidence > 0 && result.confidence <= 1);
});

test("large input completes quickly (perf smoke test)", () => {
  const big = "the ".repeat(250000); // ~1MB
  const start = process.hrtime.bigint();
  const result = Detector.detectPostingLanguage(big);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(result.code, "en");
  assert.ok(elapsedMs < 50, `1MB input took ${elapsedMs.toFixed(1)}ms, expected < 50ms`);
});
