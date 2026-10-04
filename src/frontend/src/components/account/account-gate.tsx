"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Section } from "@/components/layout/section";
import { AccountShimmer } from "@/components/ui/page-shimmers";
import { cn } from "@/lib/utils";
import type { User } from "@/types/api";

export function AccountSignedOut() {
  const pathname = usePathname();
  return (
    <Section width="narrow" space="loose">
      <p className="label-eyebrow text-brand">Account</p>
      <h1 className="heading-display mt-2 text-4xl">Sign in to continue</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Orders, tracking, payments, invoices, and addresses live here once you
        are signed in.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/login?next=${encodeURIComponent(pathname || "/account")}`}
          className={cn(buttonVariants())}
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Create account
        </Link>
      </div>
    </Section>
  );
}

export function AccountLoading() {
  return <AccountShimmer />;
}

export function AccountPageHeader({
  title,
  description,
  user,
  action,
}: {
  title: string;
  description?: string;
  user?: User | null;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
      <div>
        <p className="label-eyebrow text-brand">Account</p>
        <h1 className="heading-display mt-2 text-3xl sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        {user ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">
              {user.fullName || user.email}
            </span>
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
