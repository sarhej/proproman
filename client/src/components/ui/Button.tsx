import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({ variant = "primary", className, ...props }: Props) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors",
        variant === "primary" && "border-sky-600 bg-sky-600 text-white hover:bg-sky-700",
        variant === "secondary" && "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
        variant === "ghost" && "border-transparent bg-transparent text-slate-600 hover:bg-slate-100",
        variant === "danger" && "border-red-600 bg-red-600 text-white hover:bg-red-700",
        className
      )}
      {...props}
    />
  );
}
