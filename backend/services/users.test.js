const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeEmail,
  normalizeName,
  validateUserInput,
} = require("./users");

test("normaliza nomes e e-mails para impedir cadastros duplicados", () => {
  assert.equal(normalizeName("  Maria   da Silva "), "maria da silva");
  assert.equal(normalizeEmail("  MARIA@EXAMPLE.COM "), "maria@example.com");
});

test("valida um cadastro correto", () => {
  assert.deepEqual(validateUserInput("  Maria   Silva ", " MARIA@example.com "), {
    name: "Maria Silva",
    email: "maria@example.com",
  });
});

test("rejeita nome curto e e-mail invalido", () => {
  assert.match(validateUserInput("M", "maria@example.com").error, /nome/i);
  assert.match(validateUserInput("Maria", "email-invalido").error, /e-mail/i);
});
