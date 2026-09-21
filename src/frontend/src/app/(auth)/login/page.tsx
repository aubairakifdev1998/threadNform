import type { Metadata } from "next";
import Link from "next/link";
import { GuestOnly } from "@/components/auth/guest-only";
import { LoginForm } from "@/components/layout/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <GuestOnly>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Access your orders and account details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
          <Link href="/forgot-password" className="hover:text-foreground">
            Forgot password?
          </Link>
          <p>
            New here?{" "}
            <Link
              href="/register"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </p>
        </CardFooter>
      </Card>
    </GuestOnly>
  );
}
