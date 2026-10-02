import { LinkButton } from "@/shared/ui/button";
import { LogoMark } from "@/shared/ui/music";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-staff px-4 text-center [--staff-color:rgb(17_17_17/0.06)]">
      <LogoMark className="w-20 animate-pop" />
      <h1 className="font-display text-3xl font-black text-ink italic">That note isn&apos;t in the score</h1>
      <p className="text-slate-600">The page you were looking for doesn&apos;t exist (or was removed).</p>
      <LinkButton href="/">Back to the dashboard</LinkButton>
    </main>
  );
}
