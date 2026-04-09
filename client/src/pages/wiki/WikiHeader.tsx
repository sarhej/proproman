import { Link } from "react-router-dom";

export function WikiHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex items-center gap-2 text-slate-700 hover:text-slate-900">
          <img src="/logo.svg" alt="" className="h-8 w-8" />
          <span className="font-semibold">Tymio</span>
        </Link>
        <Link to="/" className="text-sm font-medium text-indigo-700 hover:text-indigo-900">
          Home
        </Link>
      </div>
    </header>
  );
}
