"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/modules/auth/client";
import { Button } from "@/shared/ui/button";
import { Field, Input } from "@/shared/ui/form";
import { Alert } from "@/shared/ui/layout";

export function SignInForm({ googleEnabled, passwordEnabled }: { googleEnabled: boolean; passwordEnabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setPending(true);
    await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/sign-in" });
  }

  async function signInWithPassword(formData: FormData) {
    setPending(true);
    setError(null);
    const { error: signInError } = await authClient.signIn.email({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    if (signInError) {
      setError(signInError.message ?? "Sign-in failed");
      setPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {googleEnabled ? (
        <Button size="lg" className="w-full" onClick={signInWithGoogle} disabled={pending}>
          <GoogleIcon /> Sign in with Google
        </Button>
      ) : null}

      {!googleEnabled && !passwordEnabled ? (
        <Alert tone="warning" title="Sign-in is not configured">
          Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see .env.example).
        </Alert>
      ) : null}

      {passwordEnabled ? (
        <form action={signInWithPassword} className="space-y-3 border-t border-slate-100 pt-5">
          <p className="text-xs font-medium tracking-wide text-amber-700 uppercase">Development sign-in</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" variant="outline" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in with password"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 rounded-full bg-white p-0.5">
      <path
        fill="#4285F4"
        d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"
      />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z" />
      <path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"
      />
    </svg>
  );
}
