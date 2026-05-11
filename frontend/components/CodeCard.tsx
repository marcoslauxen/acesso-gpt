import React from "react";
import { useState } from "react";
import Spinner from "./Spinner";
import type { CodeData } from "../services/api";

interface CodeCardProps {
  codeData: CodeData | null;
  loading: boolean;
  onCopyError?: (message: string) => void;
}

function CodeCard({ codeData, loading, onCopyError }: CodeCardProps) {
  const [copied, setCopied] = useState(false);
  const receivedAt = codeData?.receivedAt
    ? new Date(codeData.receivedAt).toLocaleString("pt-BR")
    : null;

  const code = codeData?.code;
  const canCopy = Boolean(code && code !== "------");

  async function handleCopyMainCode() {
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopyError?.("Nao foi possivel copiar. Verifique as permissoes do navegador.");
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
        <p className="text-sm font-semibold uppercase text-cyan-700">Codigo atual</p>
        <p className="mt-1 text-sm text-slate-500">Ultimo codigo encontrado no Gmail autorizado.</p>
      </div>

      <div className="px-5 py-6 text-center sm:px-8 sm:py-8">
        {loading ? (
          <div className="flex min-h-[108px] flex-col items-center justify-center gap-3 text-cyan-700">
            <Spinner className="h-9 w-9 border-cyan-700" />
            <span className="text-sm font-semibold">Buscando codigo no Gmail...</span>
          </div>
        ) : (
          <div className="mx-auto flex min-h-[108px] max-w-sm flex-wrap items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-950 px-5 py-6 shadow-inner">
            <p className="break-all text-center font-mono text-5xl font-black text-white sm:text-6xl">
              {code || "------"}
            </p>
            <button
              type="button"
              disabled={!canCopy}
              className="shrink-0 rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void handleCopyMainCode()}
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        )}
      </div>

      <div className="grid border-t border-slate-100 bg-slate-50/80 sm:grid-cols-2">
        <div className="border-b border-slate-100 px-5 py-4 sm:border-b-0 sm:border-r">
          <p className="text-xs font-semibold uppercase text-slate-500">Status</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {loading ? "Consultando caixa de entrada" : codeData?.code ? "Codigo pronto" : "Sem codigo"}
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Data e hora</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {loading ? "Aguardando retorno" : receivedAt || "Ainda nao recebido"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default CodeCard;
