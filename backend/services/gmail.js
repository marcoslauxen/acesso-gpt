const DEFAULT_GMAIL_SENDER = "noreply@tm.openai.com";
const DEFAULT_GMAIL_RECEIVER = "gptpensador@gmail.com";

function getGmailSender() {
  return process.env.GMAIL_SENDER || DEFAULT_GMAIL_SENDER;
}

function getGmailReceiver() {
  return process.env.GMAIL_RECEIVER || DEFAULT_GMAIL_RECEIVER;
}

function getMissingGmailEnvVars() {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"].filter(
    (envName) => !process.env[envName]
  );
}

async function getGmailAccessToken() {
  const missingVars = getMissingGmailEnvVars();

  if (missingVars.length > 0) {
    throw new Error(
      `Configure as variaveis de ambiente para Gmail: ${missingVars.join(", ")}.`
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || "Nao foi possivel autenticar no Gmail.");
  }

  return data.access_token;
}

async function gmailRequest(requestPath, accessToken, options = {}) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${requestPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Nao foi possivel acessar o Gmail.");
  }

  return data;
}

function decodeBase64Url(value = "") {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function encodeBase64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function extractMessageText(payload) {
  if (!payload) {
    return "";
  }

  const currentText = payload.body?.data ? decodeBase64Url(payload.body.data) : "";
  const childText = (payload.parts || []).map(extractMessageText).join("\n");

  return `${currentText}\n${childText}`;
}

function extractReceivedAt(details) {
  const internalDate = Number(details?.internalDate);

  if (Number.isFinite(internalDate) && internalDate > 0) {
    return new Date(internalDate).toISOString();
  }

  const headers = details?.payload?.headers || [];
  const dateHeader = headers.find((header) => header.name.toLowerCase() === "date");
  const parsedDate = dateHeader ? new Date(dateHeader.value) : new Date();

  return Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
}

function extractSixDigitCode(details) {
  const text = `${details?.snippet || ""}\n${extractMessageText(details?.payload)}`;
  return text.match(/\b\d{6}\b/)?.[0] || null;
}

async function collectGmailCodes(maxCodes = 10, options = {}) {
  const accessToken = await getGmailAccessToken();
  const receivedAfter = options.receivedAfter ? new Date(options.receivedAfter) : null;
  const queryParts = [`from:${getGmailSender()}`];

  if (receivedAfter && !Number.isNaN(receivedAfter.getTime())) {
    queryParts.push(`after:${Math.floor(receivedAfter.getTime() / 1000)}`);
  }

  const query = encodeURIComponent(queryParts.join(" "));
  const listMax = Math.min(100, Math.max(maxCodes * 10, 20));
  const list = await gmailRequest(`messages?q=${query}&maxResults=${listMax}`, accessToken);

  if (!list.messages || list.messages.length === 0) {
    return [];
  }

  const results = [];
  const seen = new Set();

  for (const message of list.messages) {
    if (results.length >= maxCodes) {
      break;
    }

    const details = await gmailRequest(`messages/${message.id}?format=full`, accessToken);
    const code = extractSixDigitCode(details);

    if (!code) {
      continue;
    }

    const receivedAt = extractReceivedAt(details);

    if (receivedAfter && new Date(receivedAt) <= receivedAfter) {
      continue;
    }

    const key = `${message.id}|${code}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push({
      code,
      messageId: message.id,
      receivedAt,
    });
  }

  return results.sort((left, right) => new Date(right.receivedAt) - new Date(left.receivedAt));
}

async function findLatestGmailCode(options = {}) {
  const codes = await collectGmailCodes(1, options);
  return codes[0] || null;
}

function sanitizeHeader(value) {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

function buildCodeEmail({ recipientEmail, recipientName, code }) {
  const safeEmail = sanitizeHeader(recipientEmail);
  const safeName = sanitizeHeader(recipientName);
  const subject = "Seu codigo de acesso";
  const body = [
    `Ola, ${safeName}!`,
    "",
    `Seu codigo de acesso e: ${code}`,
    "",
    "Este codigo foi enviado automaticamente porque voce solicitou pelo aplicativo.",
    "Se voce nao fez essa solicitacao, ignore este e-mail.",
  ].join("\r\n");

  return [
    `To: ${safeEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
}

async function sendCodeEmail({ recipientEmail, recipientName, code }) {
  const accessToken = await getGmailAccessToken();
  const raw = encodeBase64Url(buildCodeEmail({ recipientEmail, recipientName, code }));

  return gmailRequest("messages/send", accessToken, {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
}

async function checkGmailConnection() {
  const accessToken = await getGmailAccessToken();
  return gmailRequest("profile", accessToken);
}

async function checkGmailPermissions() {
  const accessToken = await getGmailAccessToken();
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || "Nao foi possivel validar as permissoes do Gmail.");
  }

  const scopes = new Set(String(data.scope || "").split(/\s+/).filter(Boolean));
  const requiredScopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
  ];

  return {
    missingScopes: requiredScopes.filter((scope) => !scopes.has(scope)),
    scopes: [...scopes],
  };
}

module.exports = {
  DEFAULT_GMAIL_RECEIVER,
  DEFAULT_GMAIL_SENDER,
  buildCodeEmail,
  checkGmailConnection,
  checkGmailPermissions,
  collectGmailCodes,
  decodeBase64Url,
  encodeBase64Url,
  extractMessageText,
  extractReceivedAt,
  extractSixDigitCode,
  findLatestGmailCode,
  getGmailReceiver,
  getGmailSender,
  getMissingGmailEnvVars,
  sendCodeEmail,
};
