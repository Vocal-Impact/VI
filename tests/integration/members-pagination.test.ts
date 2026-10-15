import { describe, expect, it } from "vitest";
import { listMembersPage } from "@/modules/members";
import { createMember } from "../support/factories";

describe("members list pages", () => {
  it("splits the list into pages in name order and keeps the page in range", async () => {
    for (const firstName of ["Eve", "Ann", "Dan", "Bob", "Cat"]) await createMember({ firstName });

    const first = await listMembersPage({}, 1, 2);
    expect(first).toMatchObject({ total: 5, page: 1, pageCount: 3 });
    expect(first.members.map((m) => m.firstName)).toEqual(["Ann", "Bob"]);
    expect((await listMembersPage({}, 3, 2)).members.map((m) => m.firstName)).toEqual(["Eve"]);

    // Past the end (e.g. after a filter shrank the list) → the last page; nonsense → the first.
    expect((await listMembersPage({}, 99, 2)).page).toBe(3);
    expect((await listMembersPage({}, 0, 2)).page).toBe(1);
  });

  it("pages the filtered list", async () => {
    await createMember({ firstName: "Tom", voiceType: "TENOR" });
    await createMember({ firstName: "Ted", voiceType: "TENOR" });
    await createMember({ firstName: "Sue", voiceType: "SOPRANO" });
    const tenors = await listMembersPage({ voiceType: "TENOR" }, 1, 1);
    expect(tenors).toMatchObject({ total: 2, pageCount: 2 });
    expect(tenors.members.map((m) => m.firstName)).toEqual(["Ted"]);
  });
});
