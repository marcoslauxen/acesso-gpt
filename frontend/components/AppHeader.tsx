import React from "react";
import { APP_CONFIG } from "../constants/app";

function AppHeader() {
  const { appName, title, description } = APP_CONFIG;

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg shadow-slate-900/10 ring-1 ring-slate-200/80">
          <img
            src="/assets/app-logo.png"
            alt=""
            width={48}
            height={48}
            className="h-full w-full object-cover"
            decoding="async"
          />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase text-cyan-700">{appName}</p>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">{title}</h1>
        </div>
      </div>
      <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">{description}</p>
    </div>
  );
}

export default AppHeader;
