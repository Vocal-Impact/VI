import { describe, expect, it } from "vitest";
import { getGroupRoster, markInviteJoined, undoInviteJoined } from "@/modules/whatsapp-groups";
import { prisma } from "@/shared/db/prisma";
import { createGroup, createMember, createUser } from "../support/factories";

const statusOf = async (id: string) =>
  prisma.member.findUniqueOrThrow({ where: { id }, select: { status: true, addedToWhatsappAt: true } });

describe("undoing a 'joined' mark made by mistake", () => {
  it("puts them back to invited, and back to prospective if the main group made them active", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const main = await createGroup({ name: "Main", isMainGroup: true });
    const newbie = await createMember({ firstName: "Newbie", status: "PROSPECTIVE" });

    await markInviteJoined(newbie.id, main.id, admin);
    expect((await statusOf(newbie.id)).status).toBe("ACTIVE");

    expect((await undoInviteJoined(newbie.id, main.id, admin)).ok).toBe(true);
    expect(await statusOf(newbie.id)).toEqual({ status: "PROSPECTIVE", addedToWhatsappAt: null });
    const roster = await getGroupRoster(main.id);
    expect(roster?.inGroup.map((row) => row.firstName)).toEqual([]);
    expect(roster?.toInvite.find((row) => row.id === newbie.id)?.membership).toBe("INVITED");

    // Nothing to undo now.
    const again = await undoInviteJoined(newbie.id, main.id, admin);
    expect(!again.ok && again.error.message).toBe("They aren't marked as in this group");
  });

  it("leaves the status alone when they were already active, or are still in another main group", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const main = await createGroup({ name: "Main A", isMainGroup: true });
    const otherMain = await createGroup({ name: "Main B", isMainGroup: true });
    const tenors = await createGroup({ name: "Tenors" });
    const regular = await createMember({ firstName: "Regular", status: "ACTIVE" });
    const newbie = await createMember({ firstName: "Twice", status: "PROSPECTIVE" });

    await markInviteJoined(regular.id, main.id, admin);
    await undoInviteJoined(regular.id, main.id, admin);
    expect((await statusOf(regular.id)).status).toBe("ACTIVE");

    await markInviteJoined(newbie.id, main.id, admin);
    await markInviteJoined(newbie.id, otherMain.id, admin);
    await markInviteJoined(newbie.id, tenors.id, admin);
    await undoInviteJoined(newbie.id, main.id, admin);
    expect((await statusOf(newbie.id)).status).toBe("ACTIVE"); // still in Main B
    await undoInviteJoined(newbie.id, tenors.id, admin);
    expect((await statusOf(newbie.id)).status).toBe("ACTIVE"); // part groups never change the status
  });
});

describe("alumni in WhatsApp groups", () => {
  it("are listed as members of the main group only, and never offered for invites", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const main = await createGroup({ name: "Main", isMainGroup: true });
    const sopranos = await createGroup({ name: "Sopranos" });
    const alumna = await createMember({ firstName: "Alumna", status: "ACTIVE" });
    await markInviteJoined(alumna.id, main.id, admin);
    await markInviteJoined(alumna.id, sopranos.id, admin);
    await prisma.member.update({ where: { id: alumna.id }, data: { status: "ALUMNI" } });
    const otherAlumnus = await createMember({ firstName: "Old", status: "ALUMNI" });

    const mainRoster = await getGroupRoster(main.id);
    expect(mainRoster?.inGroup.map((row) => row.firstName)).toEqual(["Alumna"]);
    const sopranoRoster = await getGroupRoster(sopranos.id);
    expect(sopranoRoster?.inGroup).toEqual([]);
    // Alumni not in the group aren't offered for invites either.
    expect(mainRoster?.toInvite.some((row) => row.id === otherAlumnus.id)).toBe(false);
  });
});
