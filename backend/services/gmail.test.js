const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildCodeEmail,
  decodeBase64Url,
  encodeBase64Url,
  extractReceivedAt,
  extractSixDigitCode,
} = require("./gmail");

test("codifica e decodifica base64url", () => {
  const text = "Codigo: 123456";
  assert.equal(decodeBase64Url(encodeBase64Url(text)), text);
});

test("extrai codigo de seis digitos de partes aninhadas", () => {
  const details = {
    payload: {
      parts: [
        {
          body: {
            data: encodeBase64Url("Seu codigo de acesso e 654321."),
          },
        },
      ],
    },
  };

  assert.equal(extractSixDigitCode(details), "654321");
});

test("prioriza a data interna confiavel do Gmail", () => {
  const details = {
    internalDate: "1780596000000",
    payload: {
      headers: [{ name: "Date", value: "Thu, 01 Jan 1970 00:00:00 GMT" }],
    },
  };

  assert.equal(extractReceivedAt(details), "2026-06-04T18:00:00.000Z");
});

test("monta e-mail sem permitir injecao de cabecalho", () => {
  const email = buildCodeEmail({
    recipientEmail: "marcos@example.com\r\nBcc: invasor@example.com",
    recipientName: "Marcos\nTeste",
    code: "123456",
  });

  assert.match(email, /^To: marcos@example\.com Bcc: invasor@example\.com/m);
  assert.doesNotMatch(email, /^Bcc:/m);
  assert.match(email, /123456/);
});
