const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_GROQ_MODEL,
  GROQ_API_URL,
  GroqConfigurationError,
  normalizeMessages,
  requestGroqChat,
} = require("./groq-assistant");

test("normaliza e limita o historico enviado ao assistente", () => {
  const input = Array.from({ length: 14 }, (_, index) => ({
    role: index % 2 === 0 ? "assistant" : "user",
    content: ` mensagem ${index} `,
  }));
  const result = normalizeMessages(input);

  assert.equal(result.messages.length, 12);
  assert.equal(result.messages[0].content, "mensagem 2");
  assert.equal(result.messages.at(-1).role, "user");
});

test("rejeita conversa sem uma pergunta no final", () => {
  assert.match(
    normalizeMessages([{ role: "assistant", content: "Posso ajudar?" }]).error,
    /pergunta/i
  );
});

test("exige chave da Groq", async () => {
  await assert.rejects(
    requestGroqChat([{ role: "user", content: "Ola" }], {
      apiKey: "",
      fetchImpl: async () => {
        throw new Error("nao deveria chamar");
      },
    }),
    GroqConfigurationError
  );
});

test("envia a conversa para a Groq e devolve a resposta", async () => {
  let requestUrl;
  let requestOptions;

  const result = await requestGroqChat(
    [{ role: "user", content: "Explique const em JavaScript" }],
    {
      apiKey: "groq-test",
      fetchImpl: async (url, options) => {
        requestUrl = url;
        requestOptions = options;
        return {
          ok: true,
          json: async () => ({
            model: DEFAULT_GROQ_MODEL,
            choices: [{ message: { content: "Const declara uma variavel." } }],
          }),
        };
      },
    }
  );

  const body = JSON.parse(requestOptions.body);

  assert.equal(requestUrl, GROQ_API_URL);
  assert.equal(requestOptions.headers.Authorization, "Bearer groq-test");
  assert.equal(body.model, DEFAULT_GROQ_MODEL);
  assert.equal(body.messages.at(-1).content, "Explique const em JavaScript");
  assert.equal(result.answer, "Const declara uma variavel.");
});
