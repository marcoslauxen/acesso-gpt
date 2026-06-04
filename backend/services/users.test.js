const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_AVATAR_BYTES,
  normalizeEmail,
  normalizeName,
  parseAvatarDataUrl,
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

test("valida foto em data URL", () => {
  const avatar = parseAvatarDataUrl(
    `data:image/png;base64,${Buffer.from("imagem").toString("base64")}`
  );

  assert.equal(avatar.mime, "image/png");
  assert.deepEqual(avatar.data, Buffer.from("imagem"));
});

test("rejeita tipo e tamanho de foto invalidos", () => {
  assert.match(parseAvatarDataUrl("data:image/svg+xml;base64,PHN2Zz4=").error, /JPG/i);
  const oversized = Buffer.alloc(MAX_AVATAR_BYTES + 1).toString("base64");
  assert.match(parseAvatarDataUrl(`data:image/jpeg;base64,${oversized}`).error, /400 KB/i);
});
