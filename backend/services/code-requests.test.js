const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_REQUEST_HISTORY_LIMIT,
  DEFAULT_REQUEST_TIMEOUT_MINUTES,
  getRequestTimeoutMinutes,
  listRecentRequests,
  normalizeRequestHistoryLimit,
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

test("limita a quantidade de itens do historico", () => {
  assert.equal(normalizeRequestHistoryLimit("5"), 5);
  assert.equal(normalizeRequestHistoryLimit("0"), DEFAULT_REQUEST_HISTORY_LIMIT);
  assert.equal(normalizeRequestHistoryLimit("51"), DEFAULT_REQUEST_HISTORY_LIMIT);
  assert.equal(normalizeRequestHistoryLimit("invalido"), DEFAULT_REQUEST_HISTORY_LIMIT);
});

test("lista somente quem solicitou e a data, sem expor o codigo", async () => {
  let receivedSql = "";
  let receivedParams = [];
  const requestedAt = new Date("2026-08-05T14:30:00.000Z");

  const history = await listRecentRequests(3, {
    query: async (sql, params) => {
      receivedSql = sql;
      receivedParams = params;
      return {
        rows: [
          {
            userName: "Maria Silva",
            requestedAt,
            code: "123456",
          },
        ],
      };
    },
  });

  assert.match(receivedSql, /ORDER BY cr\.requested_at DESC/);
  assert.deepEqual(receivedParams, [3]);
  assert.deepEqual(history, [{ userName: "Maria Silva", requestedAt }]);
  assert.equal("code" in history[0], false);
});
