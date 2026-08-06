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
        ? "border-[#cfe58f] bg-[#eff8d6] text-[#315329]"
      : "border-[#b9dfaa] bg-[#e8f7df] text-[#285b36]";

  return <div className={"rounded-2xl border px-4 py-3.5 text-sm font-bold leading-5 " + styles}>{message}</div>;
}

export default Alert;
