const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARACTERS = 4000;
const MAX_TOTAL_CHARACTERS = 12000;

const SYSTEM_PROMPT = [
  "Voce e um assistente curto e prestativo dentro de um aplicativo interno.",
  "Responda sempre em portugues do Brasil, a menos que o usuario peca outro idioma.",
  "Ajude com perguntas gerais e explique pequenos trechos de codigo com clareza.",
  "Quando corrigir codigo, mostre uma versao corrigida e explique o erro de forma objetiva.",
  "Nao invente informacoes atuais ou em tempo real. Diga claramente quando nao tiver acesso a dados ao vivo.",
  "Nao afirme que executou codigo, abriu links ou consultou a internet.",
];

class GroqConfigurationError extends Error {
  constructor() {
    super("Configure GROQ_API_KEY no arquivo .env para ativar o assistente.");
    this.name = "GroqConfigurationError";
  }
}

class GroqRequestError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "GroqRequestError";
    this.status = status;
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return { error: "Envie uma lista de mensagens." };
  }

  const normalized = messages
    .filter(
      (message) =>
        message &&
        ["user", "assistant"].includes(message.role) &&
        typeof message.content === "string"
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content)
    .slice(-MAX_MESSAGES);

  if (normalized.length === 0 || normalized.at(-1)?.role !== "user") {
    return { error: "Envie uma pergunta para o assistente." };
  }

  if (normalized.some((message) => message.content.length > MAX_MESSAGE_CHARACTERS)) {
    return {
      error: `Cada mensagem deve ter no maximo ${MAX_MESSAGE_CHARACTERS} caracteres.`,
    };
  }

  const totalCharacters = normalized.reduce(
    (total, message) => total + message.content.length,
    0
  );

  if (totalCharacters > MAX_TOTAL_CHARACTERS) {
    return { error: "A conversa ficou muito longa. Limpe o chat e tente novamente." };
  }

  return { messages: normalized };
}

async function requestGroqChat(messages, dependencies = {}) {
  const apiKey = Object.hasOwn(dependencies, "apiKey")
    ? dependencies.apiKey
    : process.env.GROQ_API_KEY;
  const model = dependencies.model || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
  const fetchImpl = dependencies.fetchImpl || fetch;

  if (!apiKey) {
    throw new GroqConfigurationError();
  }

  const normalized = normalizeMessages(messages);

  if (normalized.error) {
    throw new GroqRequestError(normalized.error, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  timeout.unref?.();

  try {
    const response = await fetchImpl(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT.join(" ") },
          ...normalized.messages,
        ],
        temperature: 0.3,
        max_completion_tokens: 800,
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        throw new GroqRequestError("A chave da Groq foi recusada.", 503);
      }

      if (response.status === 429) {
        throw new GroqRequestError(
          "O limite gratuito da Groq foi atingido. Aguarde um pouco e tente novamente.",
          429
        );
      }

      throw new GroqRequestError(
        data.error?.message || "A Groq nao conseguiu responder agora.",
        502
      );
    }

    const answer = data.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      throw new GroqRequestError("A Groq retornou uma resposta vazia.", 502);
    }

    return { answer, model: data.model || model };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new GroqRequestError("A Groq demorou demais para responder.", 504);
    }

    if (err instanceof GroqRequestError) {
      throw err;
    }

    throw new GroqRequestError("Nao foi possivel conectar ao assistente.", 503);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_GROQ_MODEL,
  GROQ_API_URL,
  GroqConfigurationError,
  GroqRequestError,
  MAX_MESSAGES,
  normalizeMessages,
  requestGroqChat,
};
