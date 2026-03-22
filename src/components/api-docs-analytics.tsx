"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useSession } from "@/context/session-context";
import {
  trackApiDocsLinkClicked,
  trackApiDocsViewed,
} from "@/lib/analytics";

export function ApiDocsViewAnalytics() {
  const { tier, credits, isLoading } = useSession();
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    if (isLoading || hasTrackedRef.current) return;
    hasTrackedRef.current = true;
    trackApiDocsViewed({
      page: "api-docs",
      tier,
      hasCredits: credits > 0,
    });
  }, [credits, isLoading, tier]);

  return null;
}

interface TrackedApiDocsLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  source: "hero_cta" | "quick_link" | "footer";
  target?: "_blank" | "_self";
  rel?: string;
}

export function TrackedApiDocsLink({
  href,
  children,
  className,
  source,
  target,
  rel,
}: TrackedApiDocsLinkProps) {
  const { tier, credits } = useSession();

  const analyticsTarget =
    href.startsWith("/api/") ? "api" : href.startsWith("http") ? "external" : "internal";

  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      className={className}
      onClick={() => {
        trackApiDocsLinkClicked({
          source,
          href,
          target: analyticsTarget,
          tier,
          hasCredits: credits > 0,
        });
      }}
    >
      {children}
    </Link>
  );
}
