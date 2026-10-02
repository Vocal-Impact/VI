import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, isGoogleSignInConfigured, isPasswordSignInEnabled } from "@/modules/auth";
import { Alert } from "@/shared/ui/layout";
import { Equalizer, FloatingNotes, LogoWordmark } from "@/shared/ui/music";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const ERROR_MESSAGES: Record<string, string> = {
  unable_to_create_user: "This Google account is not on the committee list. Ask an admin to add your email.",
  signup_disabled: "This Google account is not on the committee list. Ask an admin to add your email.",
  account_not_linked: "We couldn't link this Google account. Ask an admin to check your email on the user list.",
};

export default async function SignInPage(props: PageProps<"/sign-in">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await props.searchParams;
  const errorCode = Array.isArray(error) ? error[0] : error;
  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] ?? "Sign-in failed. Please try again.") : null;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Stage panel */}
      <section className="relative flex min-h-64 flex-col items-center justify-center overflow-hidden bg-ink bg-staff px-8 py-12 text-brand-300">
        <FloatingNotes count={12} />
        <div className="relative animate-pop text-center">
          <LogoWordmark variant="white" className="mx-auto w-64 sm:w-80" priority />
          <p className="mt-6 flex items-center justify-center gap-3 font-display text-sm font-bold tracking-[0.2em] text-slate-300 uppercase">
            <Equalizer className="h-4 text-brand-400" bars={4} label={null} />
            Committee backstage
            <Equalizer className="h-4 text-brand-400" bars={4} label={null} />
          </p>
        </div>
      </section>

      {/* Sign-in */}
      <section className="flex items-center justify-center bg-white px-4 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <h1 className="font-display text-3xl font-black text-ink italic">Welcome back</h1>
          <p className="mt-1 mb-6 text-sm text-slate-600">Sign in with your IIT Google account.</p>
          {errorMessage ? (
            <Alert tone="error" className="mb-4">
              {errorMessage}
            </Alert>
          ) : null}
          <SignInForm googleEnabled={isGoogleSignInConfigured()} passwordEnabled={isPasswordSignInEnabled()} />
          <p className="mt-8 text-xs text-slate-500">Only committee members added by an admin can sign in.</p>
        </div>
      </section>
    </main>
  );
}
