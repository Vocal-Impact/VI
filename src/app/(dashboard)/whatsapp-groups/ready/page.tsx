import Link from "next/link";
import { requirePermission, hasPermission } from "@/modules/auth";
import { listWhatsAppQueue } from "@/modules/whatsapp-groups";
import { cn } from "@/shared/lib/cn";
import { PageHeader } from "@/shared/ui/layout";
import { markAddedAction } from "../../members/actions";
import { EligibleList } from "./eligible-list";

export const metadata = { title: "Ready for WhatsApp" };

const FILTERS = [
  { key: "not-invited", label: "Not invited yet" },
  { key: "invited", label: "Invited" },
  { key: "all", label: "All" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

export default async function EligiblePage(props: PageProps<"/whatsapp-groups/ready">) {
  const user = await requirePermission("groups:read");
  const { show } = await props.searchParams;
  const filter: Filter = FILTERS.some((f) => f.key === show) ? (show as Filter) : "not-invited";
  const { rows, threshold } = await listWhatsAppQueue();

  const counts = {
    "not-invited": rows.filter((row) => !row.invitedAt).length,
    invited: rows.filter((row) => row.invitedAt).length,
    all: rows.length,
  };
  const visible = rows.filter((row) =>
    filter === "all" ? true : filter === "invited" ? row.invitedAt !== null : row.invitedAt === null,
  );

  return (
    <>
      <PageHeader
        back={
          <Link href="/whatsapp-groups" className="text-sm text-brand-700 hover:underline">
            ← WhatsApp groups
          </Link>
        }
        title="Ready for WhatsApp"
        description={`Active members who aren't in the main group yet, then every prospective member. Those with ${threshold}+ practices can join the main groups.`}
      />
      <nav aria-label="Filter" className="mb-4 flex gap-1 border-b border-slate-200">
        {FILTERS.map(({ key, label }) => (
          <Link
            key={key}
            href={key === "not-invited" ? "/whatsapp-groups/ready" : `/whatsapp-groups/ready?show=${key}`}
            aria-current={filter === key ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap",
              filter === key
                ? "border-brand-700 text-brand-800"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {label} ({counts[key]})
          </Link>
        ))}
      </nav>
      <EligibleList
        key={filter}
        threshold={threshold}
        canWrite={hasPermission(user.role, "invites:send")}
        markAdded={markAddedAction}
        members={visible.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          kind: row.kind,
          voiceType: row.voiceType,
          whatsappNumber: row.whatsappNumber,
          attendedCount: row.attendedCount,
          invitedAt: row.invitedAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
