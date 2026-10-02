import { LinkButton } from "@/shared/ui/button";
import { LogoMark } from "@/shared/ui/music";

export const metadata = { title: "Not allowed" };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-staff px-4 text-center [--staff-color:rgb(17_17_17/0.06)]">
      <LogoMark className="w-16" />
      <h1 className="font-display text-2xl font-black text-ink italic">This part is for another section</h1>
      <p className="max-w-sm text-slate-600">
        You don&apos;t have access to that page. Ask an admin if you think you should.
      </p>
      <LinkButton href="/">Back to the dashboard</LinkButton>
    </main>
  );
}
