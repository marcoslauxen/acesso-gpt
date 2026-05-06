function AppHeader() {
  const { appName, title, description } = window.APP_CONFIG;

  return (
    <div className="text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
        {appName}
      </p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-base text-slate-600">{description}</p>
    </div>
  );
}

window.AppHeader = AppHeader;
