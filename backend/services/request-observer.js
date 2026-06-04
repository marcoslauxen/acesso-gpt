const {
  claimRequestForDelivery,
  completeRequestDelivery,
  failInterruptedDeliveries,
  getCurrentRequestForObserver,
} = require("./code-requests");
const { findLatestGmailCode, sendCodeEmail } = require("./gmail");

const DEFAULT_POLL_INTERVAL_SECONDS = 10;

function getPollIntervalMilliseconds() {
  const seconds = Number.parseInt(process.env.GMAIL_POLL_INTERVAL_SECONDS, 10);

  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 60) {
    return DEFAULT_POLL_INTERVAL_SECONDS * 1000;
  }

  return seconds * 1000;
}

function createRequestObserver(dependencies = {}) {
  const services = {
    claimRequestForDelivery,
    completeRequestDelivery,
    failInterruptedDeliveries,
    findLatestGmailCode,
    getCurrentRequestForObserver,
    sendCodeEmail,
    ...dependencies,
  };
  let running = false;
  let stopped = true;
  let timer = null;
  let wakeRequested = false;

  async function processCurrentRequest() {
    const request = await services.getCurrentRequestForObserver();

    if (!request) {
      return "idle";
    }

    const gmailCode = await services.findLatestGmailCode({
      receivedAfter: request.requestedAt,
    });

    if (!gmailCode) {
      return "waiting";
    }

    const claimedRequest = await services.claimRequestForDelivery(
      request.id,
      gmailCode.messageId
    );

    if (!claimedRequest) {
      return "not-claimed";
    }

    try {
      await services.sendCodeEmail({
        recipientEmail: claimedRequest.userEmail,
        recipientName: claimedRequest.userName,
        code: gmailCode.code,
      });
      await services.completeRequestDelivery(claimedRequest, "sent");
      console.log(`Codigo enviado para ${claimedRequest.userName}.`);
      return "sent";
    } catch (err) {
      await services.completeRequestDelivery(claimedRequest, "failed", err.message);
      console.error(`Falha ao enviar codigo para ${claimedRequest.userName}: ${err.message}`);
      return "failed";
    }
  }

  function scheduleNextRun(delay = getPollIntervalMilliseconds()) {
    if (stopped) {
      return;
    }

    clearTimeout(timer);
    timer = setTimeout(runOnce, delay);
    timer.unref?.();
  }

  async function runOnce() {
    if (running || stopped) {
      return;
    }

    running = true;
    wakeRequested = false;
    let shouldPollAgain = false;

    try {
      const result = await processCurrentRequest();
      shouldPollAgain = result === "waiting";
    } catch (err) {
      console.error(`Falha ao observar Gmail: ${err.message}`);
      shouldPollAgain = true;
    } finally {
      running = false;

      if (shouldPollAgain || wakeRequested) {
        scheduleNextRun();
      }
    }
  }

  async function start() {
    if (!stopped) {
      return;
    }

    stopped = false;

    try {
      await services.failInterruptedDeliveries();
    } catch (err) {
      console.error(`Falha ao recuperar solicitacoes interrompidas: ${err.message}`);
    }

    scheduleNextRun(0);
  }

  function wake() {
    wakeRequested = true;
    scheduleNextRun(0);
  }

  function stop() {
    stopped = true;
    wakeRequested = false;
    clearTimeout(timer);
    timer = null;
  }

  return {
    processCurrentRequest,
    runOnce,
    start,
    stop,
    wake,
  };
}

module.exports = {
  DEFAULT_POLL_INTERVAL_SECONDS,
  createRequestObserver,
  getPollIntervalMilliseconds,
};
