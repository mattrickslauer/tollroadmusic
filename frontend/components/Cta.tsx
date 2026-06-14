import type { ReactNode } from "react";

type CtaVariant = "primary" | "green" | "ghost";

/** A pill call-to-action link in one of the brand button variants. */
export default function Cta({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: CtaVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={`btn btn-${variant}${className ? ` ${className}` : ""}`}>
      {children}
    </a>
  );
}
