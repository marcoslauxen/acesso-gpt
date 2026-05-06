function Spinner({ className = "h-5 w-5 border-white" }) {
  return (
    <span
      className={"inline-block animate-spin rounded-full border-2 border-t-transparent " + className}
    />
  );
}

window.Spinner = Spinner;
