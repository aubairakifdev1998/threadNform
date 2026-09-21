"use client";

import { AuthProvider } from "@/components/auth/auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TooltipProvider delay={200}>
        {children}
        <Toaster richColors position="top-right" closeButton />
      </TooltipProvider>
    </AuthProvider>
  );
}
