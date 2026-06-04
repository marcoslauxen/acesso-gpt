const assert = require("node:assert/strict");
const test = require("node:test");
const { createRequestObserver, getCodeSearchStart } = require("./request-observer");

function createDependencies(overrides = {}) {
  return {
    claimRequestForDelivery: async () => ({
      id: "1",
      userId: "2",
      userName: "Marcos",
      userEmail: "marcos@example.com",
    }),
    completeRequestDelivery: async () => true,
    failInterruptedDeliveries: async () => 0,
    findLatestGmailCode: async () => ({
      code: "123456",
      messageId: "gmail-1",
      receivedAt: "2026-06-04T18:01:00.000Z",
    }),
    getCurrentRequestForObserver: async () => ({
      id: "1",
      requestedAt: "2026-06-04T18:00:00.000Z",
    }),
    sendCodeEmail: async () => ({ id: "sent-1" }),
    ...overrides,
  };
}

test("envia e conclui uma solicitacao quando encontra codigo novo", async () => {
  const events = [];
  const observer = createRequestObserver(
    createDependencies({
      sendCodeEmail: async (input) => events.push(["send", input]),
      completeRequestDelivery: async (...args) => events.push(["complete", ...args]),
    })
  );

  const result = await observer.processCurrentRequest();

  assert.equal(result, "sent");
  assert.equal(events[0][0], "send");
  assert.equal(events[0][1].code, "123456");
  assert.equal(events[1][0], "complete");
  assert.equal(events[1][2], "sent");
});

test("procura codigos recebidos ate cinco minutos antes da solicitacao", async () => {
  let receivedAfter;
  const observer = createRequestObserver(
    createDependencies({
      findLatestGmailCode: async (options) => {
        receivedAfter = options.receivedAfter;
        return null;
      },
    })
  );

  assert.equal(await observer.processCurrentRequest(), "waiting");
  assert.equal(receivedAfter, "2026-06-04T17:55:00.000Z");
  assert.equal(
    getCodeSearchStart("2026-06-04T18:00:00.000Z", 3),
    "2026-06-04T17:57:00.000Z"
  );
});

test("continua aguardando quando nenhum codigo novo chegou", async () => {
  let claimed = false;
  const observer = createRequestObserver(
    createDependencies({
      claimRequestForDelivery: async () => {
        claimed = true;
      },
      findLatestGmailCode: async () => null,
    })
  );

  assert.equal(await observer.processCurrentRequest(), "waiting");
  assert.equal(claimed, false);
});

test("continua aguardando quando o codigo recente ja foi utilizado", async () => {
  const observer = createRequestObserver(
    createDependencies({
      claimRequestForDelivery: async () => null,
    })
  );

  assert.equal(await observer.processCurrentRequest(), "waiting");
});

test("registra falha de envio e libera a solicitacao", async () => {
  const completions = [];
  const observer = createRequestObserver(
    createDependencies({
      completeRequestDelivery: async (...args) => completions.push(args),
      sendCodeEmail: async () => {
        throw new Error("Envio recusado");
      },
    })
  );

  assert.equal(await observer.processCurrentRequest(), "failed");
  assert.equal(completions[0][1], "failed");
  assert.equal(completions[0][2], "Envio recusado");
});
