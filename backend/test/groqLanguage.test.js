const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeResponseLanguage,
} = require("../services/groqService");

test("normalizes English voice language values", () => {
  assert.equal(normalizeResponseLanguage("en"), "en");
  assert.equal(normalizeResponseLanguage("en-US"), "en");
  assert.equal(normalizeResponseLanguage("English"), "en");
});

test("normalizes Hindi voice language values", () => {
  assert.equal(normalizeResponseLanguage("hi"), "hi");
  assert.equal(normalizeResponseLanguage("hi-IN"), "hi");
  assert.equal(normalizeResponseLanguage("Hindi"), "hi");
});

test("uses automatic language when no preference is sent", () => {
  assert.equal(normalizeResponseLanguage(undefined), "auto");
  assert.equal(normalizeResponseLanguage(""), "auto");
});
