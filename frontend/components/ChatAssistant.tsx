import React, { useEffect, useRef, useState } from "react";
import Spinner from "./Spinner";
import {
  sendAssistantMessage,
  type AssistantMessage,
} from "../services/api";

const INITIAL_MESSAGE: AssistantMessage = {
  role: "assistant",
  content:
    "Olá! Eu sou o Gpteco. Posso ajudar com dúvidas do dia a dia, estudos, textos, ideias, tecnologia e muito mais. O que você gostaria de saber?",
};

function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();

    if (!question || loading) {
      return;
    }

    const conversation = [...messages, { role: "user" as const, content: question }];
    setMessages(conversation);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const data = await sendAssistantMessage(conversation);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.answer },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "O assistente não conseguiu responder.");
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([INITIAL_MESSAGE]);
    setError("");
    setInput("");
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end">
      {open && (
        <section
          className="mb-3 flex h-[min(560px,calc(100vh-110px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25"
          role="dialog"
          aria-label="Assistente virtual"
        >
          <header className="flex items-center justify-between bg-slate-950 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <img
                className="h-11 w-11 rounded-2xl object-cover ring-2 ring-cyan-400/40"
                src="/assets/gpteco-robot.png"
                alt="Gpteco, o assistente virtual"
              />
              <div>
                <p className="font-black">Gpteco</p>
                <p className="mt-0.5 text-xs text-slate-400">Seu ajudante virtual</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
                onClick={clearChat}
              >
                Limpar
              </button>
              <button
                type="button"
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
                onClick={() => setOpen(false)}
              >
                Fechar
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex items-end gap-2 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <img
                    className="h-8 w-8 shrink-0 rounded-xl object-cover"
                    src="/assets/gpteco-robot.png"
                    alt=""
                  />
                )}
                <div
                  className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "rounded-br-md bg-cyan-700 text-white"
                      : "rounded-bl-md border border-slate-200 bg-white text-slate-800 shadow-sm"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-end justify-start gap-2">
                <img
                  className="h-8 w-8 shrink-0 rounded-xl object-cover"
                  src="/assets/gpteco-robot.png"
                  alt=""
                />
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm">
                  <Spinner className="h-4 w-4 border-cyan-700" />
                  Pensando...
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="border-t border-slate-200 bg-white p-3" onSubmit={handleSubmit}>
            <textarea
              className="min-h-20 w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={4000}
              placeholder="Pergunte algo ou cole um pequeno código..."
              disabled={loading}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">Enter envia · Shift+Enter pula linha</span>
              <button
                type="submit"
                className="rounded-xl bg-cyan-700 px-4 py-2 text-sm font-black text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!input.trim() || loading}
              >
                Enviar
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        className="flex h-14 items-center gap-3 rounded-2xl bg-slate-950 px-5 font-black text-white shadow-xl shadow-slate-950/25 transition hover:-translate-y-0.5 hover:bg-slate-800"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? "Fechar assistente" : "Abrir assistente"}
      >
        <img
          className="h-9 w-9 rounded-xl object-cover"
          src="/assets/gpteco-robot.png"
          alt=""
        />
        <span>{open ? "Fechar" : "Fale com o Gpteco"}</span>
      </button>
    </div>
  );
}

export default ChatAssistant;
