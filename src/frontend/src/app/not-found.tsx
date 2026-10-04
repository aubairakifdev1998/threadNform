import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <p className="label-eyebrow text-muted-foreground">404</p>
      <h1 className="heading-display text-3xl sm:text-4xl">Page not found</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        That link doesn&apos;t match anything in the shop or account. Check the
        address, or continue from the catalogue.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link href="/shop" className={cn(buttonVariants())}>
          Browse the shop
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
          Home
        </Link>
      </div>
    </div>
  );
}
