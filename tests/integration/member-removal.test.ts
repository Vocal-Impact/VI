import { describe, expect, it } from "vitest";
import {
  countRemovedMembers,
  listMembers,
  parseMemberFilter,
  restoreMember,
  softDeleteMember,
} from "@/modules/members";
import { createMember, createUser } from "../support/factories";

describe("removing and restoring members", () => {
  it("hides removed members from the list and lets them be found and restored", async () => {
    const admin = await createUser();
    const keep = await createMember({ firstName: "Keep", status: "INACTIVE" });
    const removed = await createMember({ firstName: "Oops" });

    await softDeleteMember(removed.id, admin.id);

    // Inactive members stay visible; removed ones don't.
    expect((await listMembers()).map((m) => m.id)).toEqual([keep.id]);
    expect(await countRemovedMembers()).toBe(1);

    // The "Removed" option in the status filter finds them.
    const filter = parseMemberFilter({ status: "REMOVED" });
    expect(filter).toEqual({ removed: true });
    const found = await listMembers(filter);
    expect(found.map((m) => m.id)).toEqual([removed.id]);
    expect(found[0]?.deletedAt).toBeInstanceOf(Date);

    await restoreMember(removed.id, admin.id);
    expect(await countRemovedMembers()).toBe(0);
    expect((await listMembers()).map((m) => m.id).sort()).toEqual([keep.id, removed.id].sort());
  });
});
