import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isGoogleSignInConfigured, isPasswordSignInEnabled } from "@/modules/auth";
import { Alert } from "@/shared/ui/layout";
import { Equalizer, FloatingNotes, LogoWordmark } from "@/shared/ui/music";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const ERROR_MESSAGES: Record<string, string> = {
  unable_to_create_user:
    "We couldn't find a Vocal Impact member with this Google account. Sign in with your IIT email.",
  signup_disabled: "We couldn't find a Vocal Impact member with this Google account. Sign in with your IIT email.",
  account_not_linked: "We couldn't link this Google account. Ask a committee member to check your email.",
};

export default async function SignInPage(props: PageProps<"/sign-in">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await props.searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] ?? "Sign-in failed. Please try again.") : null;

  return (
    <main className="flex min-h-dvh flex-col lg:grid lg:grid-cols-2">
      {/* Stage panel */}
      <section className="relative flex shrink-0 flex-col items-center justify-center overflow-hidden bg-ink bg-staff px-8 py-10 text-brand-300 lg:min-h-64 lg:py-12">
        <FloatingNotes count={12} />
        <div className="relative animate-pop text-center">
          <LogoWordmark variant="white" className="mx-auto w-64 sm:w-80" priority />
          <p className="mt-6 flex items-center justify-center gap-3 font-display text-sm font-bold tracking-[0.2em] text-slate-300 uppercase">
            <Equalizer className="h-4 text-brand-400" bars={4} label={null} />
            Backstage
            <Equalizer className="h-4 text-brand-400" bars={4} label={null} />
          </p>
        </div>
      </section>

      {/* Sign-in */}
      <section className="flex flex-1 items-start justify-center bg-white px-4 pt-8 pb-10 lg:items-center lg:py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <h1 className="font-display text-3xl font-black text-ink italic">Welcome back</h1>
          <p className="mt-1 mb-6 text-sm text-slate-600">Sign in with your IIT Google account.</p>
          {errorMessage ? (
            <Alert tone="error" className="mb-4">
              {errorMessage}
            </Alert>
          ) : null}
          <SignInForm googleEnabled={isGoogleSignInConfigured()} passwordEnabled={isPasswordSignInEnabled()} />
        </div>
      </section>
    </main>
  );
}
