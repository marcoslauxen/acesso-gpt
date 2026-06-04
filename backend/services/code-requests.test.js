const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_REQUEST_TIMEOUT_MINUTES,
  getRequestTimeoutMinutes,
} = require("./code-requests");

test("usa cinco minutos por padrao", () => {
  delete process.env.REQUEST_TIMEOUT_MINUTES;
  assert.equal(getRequestTimeoutMinutes(), DEFAULT_REQUEST_TIMEOUT_MINUTES);
  assert.equal(getRequestTimeoutMinutes(), 5);
});

test("aceita tempo configurado dentro do limite", () => {
  process.env.REQUEST_TIMEOUT_MINUTES = "7";
  assert.equal(getRequestTimeoutMinutes(), 7);
  delete process.env.REQUEST_TIMEOUT_MINUTES;
});

test("ignora configuracoes invalidas", () => {
  for (const value of ["0", "31", "abc"]) {
    process.env.REQUEST_TIMEOUT_MINUTES = value;
    assert.equal(getRequestTimeoutMinutes(), DEFAULT_REQUEST_TIMEOUT_MINUTES);
  }

  delete process.env.REQUEST_TIMEOUT_MINUTES;
});
