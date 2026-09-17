const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function createFakeChrome() {
  const data = new Map();
  return {
    chrome: {
      storage: {
        local: {
          async get(keys) {
            if (keys === null || keys === undefined) return Object.fromEntries(data);
            const out = {};
            for (const key of [].concat(keys)) if (data.has(key)) out[key] = data.get(key);
            return out;
          },
          async set(operations) {
            for (const [key, value] of Object.entries(operations)) data.set(key, value);
          },
          async remove(keys) {
            for (const key of [].concat(keys)) data.delete(key);
          },
        },
        onChanged: {
          addListener() {},
        },
      },
    },
    data,
  };
}

function install(fake) {
  globalThis.chrome = fake.chrome;
  return fake;
}

install(createFakeChrome());
const cache = require(path.join(__dirname, "..", "extension", "src", "cache.js"));

const RANGE = { kind: "range", min: 24000, max: 28000, currency: "EUR" };

test("cache is enabled by default; range results round-trip", async () => {
  const fake = install(createFakeChrome());
  assert.equal(await cache.getCacheEnabled(), true);
  assert.equal(await cache.getCachedResult("123"), null);

  await cache.saveCachedResult("123", RANGE, null, "description");
  const entry = await cache.getCachedResult("123");
  assert.equal(entry.v, cache.SCHEMA_VERSION);
  assert.equal(entry.v, 3);
  assert.equal(entry.source, "description");
  assert.equal(entry.displayText, null);
  assert.equal(entry.postingLang, "unknown");
  assert.deepEqual(entry.result, RANGE);
  assert.ok(fake.data.has("lgs96:job:123"));
});

test("postingLang round-trips through save and get", async () => {
  install(createFakeChrome());
  await cache.saveCachedResult("100", RANGE, null, "description", "en");
  assert.equal((await cache.getCachedResult("100")).postingLang, "en");
  await cache.saveCachedResult("101", RANGE, null, "description", "it");
  assert.equal((await cache.getCachedResult("101")).postingLang, "it");
  await cache.saveCachedResult("102", RANGE, null, "description", null);
  assert.equal((await cache.getCachedResult("102")).postingLang, null);
  // Every supported posting language round-trips, including fr.
  const supported = ["fr", "de", "es", "pt", "nl", "pl"];
  let id = 103;
  for (const lang of supported) {
    await cache.saveCachedResult(String(id), RANGE, null, "description", lang);
    const entry = await cache.getCachedResult(String(id));
    assert.equal(entry.postingLang, lang, `postingLang ${lang} should round-trip`);
    assert.deepEqual(entry.result, RANGE);
    id++;
  }
  // Invalid values normalize to "unknown" and stay valid.
  await cache.saveCachedResult("120", RANGE, null, "description", "xx");
  const normalized = await cache.getCachedResult("120");
  assert.equal(normalized.postingLang, "unknown");
  assert.deepEqual(normalized.result, RANGE);
});

test("fabricated v2 entries are treated as misses and purged", async () => {
  const fake = install(createFakeChrome());
  fake.data.set("lgs96:job:77", {
    v: 2,
    savedAt: Date.now(),
    result: RANGE,
    displayText: null,
    source: "description",
  });
  assert.equal(await cache.getCachedResult("77"), null);
  assert.equal(fake.data.has("lgs96:job:77"), false);
});

test("v3 entries missing postingLang are rejected and removed", async () => {
  const fake = install(createFakeChrome());
  fake.data.set("lgs96:job:78", {
    v: 3,
    savedAt: Date.now(),
    result: RANGE,
    displayText: null,
    source: "description",
  });
  assert.equal(await cache.getCachedResult("78"), null);
  assert.equal(fake.data.has("lgs96:job:78"), false);
});

test("native card display text is stored and returned", async () => {
  install(createFakeChrome());
  await cache.saveCachedResult(
    "456",
    { kind: "single", amount: 30000, bound: "approx", currency: "EUR" },
    "€30/yr",
    "card"
  );
  const entry = await cache.getCachedResult("456");
  assert.equal(entry.source, "card");
  assert.equal(entry.displayText, "€30/yr");
  assert.equal(entry.result.amount, 30000);
});

test("no-salary results are cached", async () => {
  install(createFakeChrome());
  await cache.saveCachedResult("789", { kind: "none" }, null, "description");
  const entry = await cache.getCachedResult("789");
  assert.deepEqual(entry.result, { kind: "none" });
});

test("entries expire after three days and are removed", async () => {
  const fake = install(createFakeChrome());
  await cache.saveCachedResult("1", RANGE, null, "description");
  const stored = fake.data.get("lgs96:job:1");
  stored.savedAt = Date.now() - cache.TTL_MS - 1000;
  assert.equal(await cache.getCachedResult("1"), null);
  assert.equal(fake.data.has("lgs96:job:1"), false);
});

test("corrupt entries are rejected and removed", async () => {
  const fake = install(createFakeChrome());
  fake.data.set("lgs96:job:2", { garbage: true });
  fake.data.set("lgs96:job:22", { v: 1, savedAt: Date.now(), result: { kind: "wat" } });
  assert.equal(await cache.getCachedResult("2"), null);
  assert.equal(fake.data.has("lgs96:job:2"), false);
  assert.equal(await cache.getCachedResult("22"), null);
  assert.equal(fake.data.has("lgs96:job:22"), false);
});

test("entries from older schema versions are purged on read", async () => {
  const fake = install(createFakeChrome());
  fake.data.set("lgs96:job:7", {
    v: cache.SCHEMA_VERSION - 1,
    savedAt: Date.now(),
    result: RANGE,
    displayText: null,
    source: "description",
  });
  assert.equal(await cache.getCachedResult("7"), null);
  assert.equal(fake.data.has("lgs96:job:7"), false);
});

test("invalid results and non-numeric ids are never stored", async () => {
  const fake = install(createFakeChrome());
  await cache.saveCachedResult("3", { kind: "error" }, null, "description");
  await cache.saveCachedResult("abc", RANGE, null, "description");
  assert.equal(fake.data.has("lgs96:job:3"), false);
  assert.equal(fake.data.has("lgs96:job:abc"), false);
  assert.equal(await cache.getCachedResult("abc"), null);
});

test("disabled cache ignores reads and writes but retains entries", async () => {
  const fake = install(createFakeChrome());
  await cache.saveCachedResult("4", RANGE, null, "description");
  await cache.setCacheEnabled(false);
  assert.equal(await cache.getCacheEnabled(), false);
  assert.equal(await cache.getCachedResult("4"), null);
  assert.equal(await cache.saveCachedResult("5", RANGE, null, "description"), false);
  assert.equal(fake.data.has("lgs96:job:5"), false);
  assert.ok(fake.data.has("lgs96:job:4"), "entry retained while disabled");
  await cache.setCacheEnabled(true);
  const entry = await cache.getCachedResult("4");
  assert.deepEqual(entry.result, RANGE);
});

test("clear removes job entries but keeps the setting", async () => {
  const fake = install(createFakeChrome());
  await cache.saveCachedResult("6", RANGE, null, "description");
  await cache.saveCachedResult("7", { kind: "none" }, null, "description");
  await cache.setCacheEnabled(false);
  const removed = await cache.clearCache();
  assert.equal(removed, 2);
  assert.equal(fake.data.has("lgs96:job:6"), false);
  assert.equal(fake.data.has("lgs96:job:7"), false);
  assert.equal(await cache.getCacheEnabled(), false);
  assert.equal(await cache.getCacheSize(), 0);
});

test("cloud-sourced entries round-trip with cloud provenance", async () => {
  install(createFakeChrome());
  await cache.saveCachedResult("321", RANGE, null, "cloud");
  const entry = await cache.getCachedResult("321");
  assert.equal(entry.source, "cloud");
  assert.deepEqual(entry.result, RANGE);
});

test("cache size counts only valid fresh entries", async () => {
  const fake = install(createFakeChrome());
  await cache.saveCachedResult("8", RANGE, null, "description");
  await cache.saveCachedResult("9", { kind: "none" }, null, "description");
  fake.data.set("lgs96:job:8", { v: 2, savedAt: 0, result: RANGE, displayText: null, source: "description" });
  fake.data.set("lgs96:setting", true);
  assert.equal(await cache.getCacheSize(), 1);
});
