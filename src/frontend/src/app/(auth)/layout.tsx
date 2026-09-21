import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { BRAND } from "@/lib/brand";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[radial-gradient(ellipse_at_top,_oklch(0.94_0.008_95),_transparent_55%),var(--background)]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
        <Link
          href="/"
          className="mb-10 flex items-center justify-center gap-2.5 text-foreground"
        >
          <BrandMark className="size-6" />
          <span className="brand-wordmark text-2xl">{BRAND.name}</span>
        </Link>
        {children}
      </div>
    </div>
  );
}
