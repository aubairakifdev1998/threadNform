import type { Metadata } from "next";
import { GuestOnly } from "@/components/auth/guest-only";
import { RegisterForm } from "@/components/layout/register-form";

export const metadata: Metadata = {
  title: "Register",
};

export default function RegisterPage() {
  return (
    <GuestOnly>
      <RegisterForm />
    </GuestOnly>
  );
}
