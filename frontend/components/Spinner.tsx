import React from "react";
interface SpinnerProps {
  className?: string;
}

function Spinner({ className = "h-5 w-5 border-white" }: SpinnerProps) {
  return (
    <span
      className={"inline-block animate-spin rounded-full border-2 border-t-transparent " + className}
    />
  );
}

export default Spinner;
