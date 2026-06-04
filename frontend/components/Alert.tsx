import React from "react";
interface AlertProps {
  type: "error" | "success" | "info";
  message: string;
}

function Alert({ type, message }: AlertProps) {
  if (!message) return null;

  const styles =
    type === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : type === "info"
        ? "border-cyan-200 bg-cyan-50 text-cyan-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return <div className={"rounded-xl border px-4 py-3 text-sm font-medium " + styles}>{message}</div>;
}

export default Alert;
