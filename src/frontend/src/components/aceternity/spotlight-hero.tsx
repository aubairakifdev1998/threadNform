"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Spotlight({
  className,
  fill = "white",
}: {
  className?: string;
  fill?: string;
}) {
  return (
    <svg
      className={cn(
        "pointer-events-none absolute z-[1] h-[169%] w-[138%] animate-spotlight opacity-0 lg:w-[84%]",
        className,
      )}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 3787 2842"
      fill="none"
      aria-hidden
    >
      <g filter="url(#filter)">
        <ellipse
          cx="1924.71"
          cy="273.501"
          rx="1924.71"
          ry="273.501"
          transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
          fill={fill}
          fillOpacity="0.18"
        />
      </g>
      <defs>
        <filter
          id="filter"
          x="0.860352"
          y="0.838989"
          width="3785.16"
          height="2840.26"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feGaussianBlur stdDeviation="151" result="effect1_foregroundBlur" />
        </filter>
      </defs>
    </svg>
  );
}

/** Aceternity-inspired background beams */
export function BackgroundBeams({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
      aria-hidden
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,oklch(0.9_0.01_95)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.9_0.01_95)_1px,transparent_1px)] bg-size-[48px_48px] opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
      {!reduceMotion &&
        Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className="absolute h-[140%] w-px bg-gradient-to-b from-transparent via-foreground/25 to-transparent"
            style={{
              left: `${12 + i * 15}%`,
              top: "-20%",
              animation: `beam-drift ${7 + i}s ease-in-out ${i * 0.4}s infinite alternate`,
            }}
          />
        ))}
    </div>
  );
}

/** Aceternity Text Generate Effect */
export function TextGenerateEffect({
  words,
  className,
}: {
  words: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const parts = words.split(" ");

  if (reduceMotion) {
    return <span className={className}>{words}</span>;
  }

  return (
    <span className={cn("inline", className)}>
      {parts.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, filter: "blur(6px)" }}
          whileInView={{ opacity: 1, filter: "blur(0px)" }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{
            delay: i * 0.06,
            duration: 0.45,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="mr-[0.28em] inline-block"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

export function TextReveal({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return <TextGenerateEffect words={text} className={className} />;
}

/** Aceternity Moving Border button shell */
export function MovingBorderButton({
  children,
  className,
  containerClassName,
  as: Comp = "button",
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  as?: "button" | "a" | "div";
} & React.HTMLAttributes<HTMLElement>) {
  const reduceMotion = useReducedMotion();

  return (
    <Comp
      className={cn(
        "relative inline-flex overflow-hidden p-px",
        containerClassName,
      )}
      {...(props as object)}
    >
      {!reduceMotion && (
        <span
          className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,oklch(0.35_0.02_265)_50%,transparent_100%)] opacity-70"
          aria-hidden
        />
      )}
      <span
        className={cn(
          "relative z-10 inline-flex h-full w-full items-center justify-center bg-background px-6 py-3 text-sm font-medium tracking-wide text-foreground",
          className,
        )}
      >
        {children}
      </span>
    </Comp>
  );
}

/** Aceternity Focus Cards — hover dims siblings */
export function FocusCards({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const items = Array.isArray(children) ? children : [children];

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((child, i) => (
        <div
          key={i}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          className={cn(
            "transition duration-300",
            hovered !== null && hovered !== i
              ? "opacity-45 blur-[1px]"
              : "opacity-100",
          )}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/** Aceternity-style bottom-border label input */
export function LabelInput({
  id,
  label,
  className,
  ...props
}: {
  id: string;
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        placeholder=" "
        className="peer block w-full border-0 border-b border-border bg-transparent px-0 py-3 text-sm text-foreground outline-none transition placeholder:text-transparent focus:border-foreground"
        {...props}
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-0 top-3 origin-left text-sm text-muted-foreground transition-all peer-focus:-translate-y-5 peer-focus:scale-90 peer-focus:text-foreground peer-[:not(:placeholder-shown)]:-translate-y-5 peer-[:not(:placeholder-shown)]:scale-90"
      >
        {label}
      </label>
    </div>
  );
}

export function HoverBorderGradient({
  children,
  className,
  containerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => setHovered(true), 2500);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative p-px transition-shadow",
        hovered && !reduceMotion ? "shadow-md shadow-foreground/8" : "",
        containerClassName,
      )}
    >
      <div className={cn("relative z-10 overflow-hidden bg-card", className)}>
        {children}
      </div>
    </div>
  );
}

type HeroSpotlightProps = {
  title?: string;
  subtitle: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  seasonLabel?: string;
  mediaType?: "IMAGE" | "VIDEO" | "NONE";
  mediaUrl?: string | null;
  posterUrl?: string | null;
};

export function HeroSpotlight({
  title,
  subtitle,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  seasonLabel = "New collection",
  mediaType = "NONE",
  mediaUrl,
  posterUrl,
}: HeroSpotlightProps) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const hasMedia = Boolean(mediaUrl) && mediaType !== "NONE";

  return (
    <section
      ref={ref}
      className="surface-grain relative min-h-[88svh] overflow-hidden bg-secondary/60"
    >
      {hasMedia ? (
        <div className="absolute inset-0">
          {mediaType === "VIDEO" ? (
            <video
              className="h-full w-full scale-105 object-cover opacity-85"
              autoPlay
              muted
              loop
              playsInline
              poster={posterUrl ?? undefined}
              src={mediaUrl ?? undefined}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl ?? undefined}
              alt=""
              className="h-full w-full scale-105 object-cover opacity-85"
            />
          )}
          {/* Soft wash — keep type clear over sky footage */}
          <div className="absolute inset-0 bg-gradient-to-r from-background/35 via-background/10 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/20 via-transparent to-background/5" />
        </div>
      ) : (
        <>
          <BackgroundBeams />
          {!reduceMotion && (
            <Spotlight
              className="-top-40 left-0 md:-top-20 md:left-40"
              fill="black"
            />
          )}
        </>
      )}

      <div className="relative z-10 mx-auto grid min-h-[min(88svh,920px)] max-w-7xl items-end gap-8 px-4 pb-12 pt-24 sm:gap-10 sm:px-6 sm:pb-16 sm:pt-28 lg:grid-cols-12 lg:px-8 lg:pb-20">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="min-w-0 lg:col-span-7"
        >
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:text-[0.7rem] sm:tracking-[0.22em]">
            {seasonLabel}
          </p>
          <h1 className="heading-display mt-3 text-[clamp(2.1rem,10vw,5.5rem)] leading-[0.95] text-foreground sm:mt-4 sm:leading-[0.92]">
            <TextGenerateEffect words={title ?? "New Collection"} />
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:mt-6 sm:text-base">
            {subtitle}
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:mt-10 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <Link
              href={primaryHref}
              className="inline-flex h-12 w-full items-center justify-center gap-3 bg-foreground px-7 text-sm font-medium tracking-wide text-background transition hover:opacity-90 sm:w-auto"
            >
              {primaryLabel}
              <span aria-hidden>→</span>
            </Link>
            {secondaryHref && secondaryLabel ? (
              <Link
                href={secondaryHref}
                className="inline-flex h-12 w-full items-center justify-center border border-border px-7 text-sm font-medium tracking-wide text-foreground transition hover:border-foreground sm:w-auto"
              >
                {secondaryLabel}
              </Link>
            ) : null}
          </div>
        </motion.div>

        {!hasMedia ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.9,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="hidden gap-3 lg:col-span-5 lg:grid lg:grid-cols-2"
            aria-hidden
          >
            <div className="aspect-[3/4] bg-muted/80 ring-1 ring-border/60" />
            <div className="mt-10 aspect-[3/4] bg-muted ring-1 ring-border/60" />
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}
