"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronRight, GripVertical } from "lucide-react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { describeAllowedParts } from "@/modules/whatsapp-groups/domain";
import { cn } from "@/shared/lib/cn";
import { LinkButton } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/layout";
import { reorderGroupsAction } from "./actions";

export interface GroupListItem {
  id: string;
  name: string;
  isMainGroup: boolean;
  allowedVoiceTypes: string[];
  requiresEligibility: boolean;
  archived: boolean;
  stats: { joinedPeople: number; invitedPeople: number };
}

/**
 * The WhatsApp groups, in the order invites list them. Admins drag a group by
 * its handle (mouse, touch, or keyboard: focus the handle, Space, arrows,
 * Space) to reorder; archived groups stay at the bottom and can't be moved.
 */
export function GroupList({ groups, canManage }: { groups: GroupListItem[]; canManage: boolean }) {
  const [active, setActive] = useState(() => groups.filter((group) => !group.archived));
  const [, startTransition] = useTransition();
  const archived = groups.filter((group) => group.archived);

  // Pick up new data after a save or another admin's change.
  const serverOrder = groups
    .filter((group) => !group.archived)
    .map((group) => group.id)
    .join();
  const [lastServerOrder, setLastServerOrder] = useState(serverOrder);
  if (serverOrder !== lastServerOrder) {
    setLastServerOrder(serverOrder);
    setActive(groups.filter((group) => !group.archived));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active: dragged, over }: DragEndEvent) {
    if (!over || dragged.id === over.id) return;
    const previous = active;
    const from = active.findIndex((group) => group.id === dragged.id);
    const to = active.findIndex((group) => group.id === over.id);
    const next = arrayMove(active, from, to);
    setActive(next);
    startTransition(async () => {
      const result = await reorderGroupsAction(next.map((group) => group.id));
      if (!result.ok) {
        setActive(previous);
        toast.error("Couldn't save the new order. Try again.");
      }
    });
  }

  const rows = (
    <>
      {active.map((group) => (
        <SortableGroupRow key={group.id} group={group} canManage={canManage} />
      ))}
      {archived.map((group) => (
        <GroupRow key={group.id} group={group} canManage={canManage} />
      ))}
    </>
  );

  if (!canManage) return <div className="space-y-3">{rows}</div>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={active.map((group) => group.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">{rows}</div>
      </SortableContext>
      {active.length > 1 ? (
        <p className="text-xs text-slate-500">Drag the ⠿ handle to change the order invites show the groups in.</p>
      ) : null}
    </DndContext>
  );
}

function SortableGroupRow({ group, canManage }: { group: GroupListItem; canManage: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    disabled: !canManage,
  });
  return (
    <GroupRow
      group={group}
      canManage={canManage}
      rowRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      dragging={isDragging}
      handle={
        canManage ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="ml-1 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-600 active:cursor-grabbing"
            aria-label={`Reorder ${group.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </button>
        ) : null
      }
    />
  );
}

function GroupRow({
  group,
  canManage,
  rowRef,
  style,
  dragging = false,
  handle,
}: {
  group: GroupListItem;
  canManage: boolean;
  rowRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
  dragging?: boolean;
  handle?: React.ReactNode;
}) {
  return (
    <div
      ref={rowRef}
      style={style}
      className={cn(
        "flex items-center gap-1 rounded-lg border border-slate-200 bg-white transition-colors hover:border-brand-300 hover:bg-brand-50",
        dragging && "relative z-10 border-brand-400 shadow-lg",
        group.archived && "opacity-70",
      )}
    >
      {handle ?? (canManage ? <span className="ml-1 size-8 shrink-0" aria-hidden="true" /> : null)}
      <Link href={`/whatsapp-groups/${group.id}`} className="min-w-0 flex-1 px-3 py-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{group.name}</span>
          {group.isMainGroup ? <Badge tone="brand">Main</Badge> : null}
          <Badge tone="blue">{describeAllowedParts(group.allowedVoiceTypes)}</Badge>
          {group.requiresEligibility ? <Badge tone="amber">New members after practices</Badge> : null}
          {group.archived ? <Badge>Archived</Badge> : null}
        </span>
        <span className="mt-1 block text-sm text-slate-600">
          {group.stats.joinedPeople} in the group · {group.stats.invitedPeople}{" "}
          {group.stats.invitedPeople === 1 ? "person" : "people"} invited
        </span>
      </Link>
      {canManage ? (
        <LinkButton href={`/whatsapp-groups/${group.id}/edit`} size="sm" variant="ghost">
          Edit
        </LinkButton>
      ) : null}
      <ChevronRight className="mr-3 size-4 shrink-0 text-slate-400" aria-hidden="true" />
    </div>
  );
}
