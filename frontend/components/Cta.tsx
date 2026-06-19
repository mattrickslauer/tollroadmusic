import type { ReactNode } from "react";
import Link from "next/link";

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
  const cls = `btn btn-${variant}${className ? ` ${className}` : ""}`;
  // Internal route → <Link> so entering the app is a client navigation and the
  // global player survives. Hash anchors (scroll) and external URLs stay <a>.
  if (href.startsWith("/")) {
    return <Link href={href} className={cls}>{children}</Link>;
  }
  return <a href={href} className={cls}>{children}</a>;
}
