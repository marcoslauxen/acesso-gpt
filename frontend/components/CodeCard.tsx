import React from "react";
import Spinner from "./Spinner";
import type { CodeData } from "../services/api";

interface CodeCardProps {
  codeData: CodeData | null;
  loading: boolean;
}

function CodeCard({ codeData, loading }: CodeCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
      <p className="text-sm font-medium text-slate-500">Ultimo codigo recebido</p>
      <div className="mt-3 rounded-xl bg-white px-4 py-6 shadow-inner">
        {loading ? (
          <div className="flex min-h-[60px] items-center justify-center gap-3 text-blue-700">
            <Spinner className="h-8 w-8 border-blue-700" />
            <span className="text-sm font-semibold">Buscando codigo no Gmail...</span>
          </div>
        ) : (
          <p className="font-mono text-5xl font-bold tracking-widest text-blue-700">
            {codeData?.code || "------"}
          </p>
        )}
      </div>
      <p className="mt-4 text-sm text-slate-600">
        {loading
          ? "Aguarde enquanto consultamos os e-mails autorizados."
          : codeData?.receivedAt
            ? "Recebido em: " + new Date(codeData.receivedAt).toLocaleString("pt-BR")
            : "Nenhum codigo foi recebido ainda."}
      </p>
    </div>
  );
}

export default CodeCard;
