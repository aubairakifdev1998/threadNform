"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CategoryOneItem = {
  id: string;
  title: string;
  count: string;
  href: string;
  imageSrc?: string | null;
};

export function CategoryOne({
  title = "Shop by Category",
  description = "Browse our diverse collection of premium products.",
  viewAllHref = "/shop",
  viewAllLabel = "View all",
  items,
  className,
}: {
  title?: string;
  description?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  items: CategoryOneItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={cn("w-full", className)}>
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end lg:mb-10">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground lg:text-base">
            {description}
          </p>
        </div>
        <Link
          href={viewAllHref}
          className={cn(buttonVariants(), "group")}
        >
          {viewAllLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <CategoryCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export function CategoryCard({
  item,
  className,
}: {
  item: CategoryOneItem;
  className?: string;
}) {
  return (
    <Link href={item.href} className="block">
      <motion.div
        className={cn(
          "group relative flex h-56 cursor-pointer flex-col justify-end overflow-hidden rounded-xl border border-border/60 bg-secondary",
          className,
        )}
      >
        <div className="absolute inset-0">
          {item.imageSrc ? (
            <Image
              src={item.imageSrc}
              alt=""
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-110"
              sizes="(max-width: 768px) 100vw, 33vw"
            />
          ) : (
            <div className="h-full w-full bg-secondary" />
          )}
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        <div className="relative flex w-full items-end justify-between gap-4 p-6">
          <div className="shrink-0">
            <h3 className="text-2xl font-semibold text-zinc-100">{item.title}</h3>
            <p className="text-sm font-medium text-white/90">{item.count}</p>
          </div>
          <motion.div className="flex size-8 translate-y-4 items-center justify-center rounded-full bg-white text-black opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100">
            <ArrowRight className="size-4" strokeWidth={2} />
          </motion.div>
        </div>
      </motion.div>
    </Link>
  );
}
