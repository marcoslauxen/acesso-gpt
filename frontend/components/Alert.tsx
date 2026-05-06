import React from "react";
interface AlertProps {
  type: "error" | "success";
  message: string;
}

function Alert({ type, message }: AlertProps) {
  if (!message) return null;

  const styles =
    type === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return <div className={"rounded-lg border px-4 py-3 text-sm " + styles}>{message}</div>;
}

export default Alert;
