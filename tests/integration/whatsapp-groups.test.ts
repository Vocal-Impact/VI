import { describe, expect, it } from "vitest";
import { setAttendance } from "@/modules/attendance";
import {
  getGroupRoster,
  listGroups,
  listWhatsAppQueue,
  markInviteJoined,
  reorderGroups,
  sendInvites,
} from "@/modules/whatsapp-groups";
import { prisma } from "@/shared/db/prisma";
import { todayLocal } from "@/shared/lib/clock";
import { addDays } from "@/shared/lib/dates";
import { createGroup, createMember, createPractice, createUser } from "../support/factories";

async function attend(memberId: string, times: number, admin: { id: string; role: string }) {
  for (let i = 1; i <= times; i += 1) {
    const practice = await createPractice(addDays(todayLocal(), -i * 7));
    await setAttendance({ practiceId: practice.id, memberId, present: true }, admin);
  }
}

describe("WhatsApp group counts", () => {
  it("counts people (not invite attempts), ignoring failed sends", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const group = await createGroup({ requiresEligibility: false });
    const [a, b, c] = await Promise.all([createMember(), createMember(), createMember()]);

    // a: invited twice; b: invited then joined; c: only a failed attempt.
    await prisma.groupInvite.createMany({
      data: [
        { memberId: a.id, groupId: group.id, channel: "EMAIL", status: "SENT", sentById: admin.id },
        { memberId: a.id, groupId: group.id, channel: "WHATSAPP_LINK", status: "SENT", sentById: admin.id },
        { memberId: b.id, groupId: group.id, channel: "EMAIL", status: "SENT", sentById: admin.id },
        { memberId: c.id, groupId: group.id, channel: "EMAIL", status: "FAILED", sentById: admin.id },
      ],
    });
    await markInviteJoined(b.id, group.id, admin);

    const [listed] = await listGroups();
    expect(listed?.stats).toEqual({ invitedPeople: 2, joinedPeople: 1 });
  });
});

describe("voice-part groups", () => {
  it("only lets that part in, unless an admin overrides", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const committee = await createUser({ role: "COMMITTEE" });
    const tenors = await createGroup({ name: "Tenors", requiresEligibility: false, allowedVoiceTypes: ["TENOR"] });
    const tenor = await createMember({ voiceType: "TENOR", status: "ACTIVE" });
    const alto = await createMember({ voiceType: "ALTO", status: "ACTIVE" });

    expect((await sendInvites({ memberIds: [tenor.id], groupIds: [tenors.id], channel: "MANUAL" }, committee)).ok).toBe(
      true,
    );
    const refused = await sendInvites({ memberIds: [alto.id], groupIds: [tenors.id], channel: "MANUAL" }, committee);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.message).toContain("For Tenors only");
    const notAllowed = await sendInvites(
      { memberIds: [alto.id], groupIds: [tenors.id], channel: "MANUAL", overrideEligibility: true },
      committee,
    );
    expect(notAllowed.ok).toBe(false);
    const overridden = await sendInvites(
      { memberIds: [alto.id], groupIds: [tenors.id], channel: "MANUAL", overrideEligibility: true },
      admin,
    );
    expect(overridden.ok).toBe(true);
  });
});

describe("group roster", () => {
  it("orders: active not in group → eligible not invited → invited → can't join; joined listed separately", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const main = await createGroup({ name: "VI Main", isMainGroup: true, requiresEligibility: true });
    const activeMissing = await createMember({ firstName: "Zed", status: "ACTIVE" });
    const ready = await createMember({ firstName: "Yara" });
    const invited = await createMember({ firstName: "Xavi" });
    const tooNew = await createMember({ firstName: "Amy" });
    const inGroup = await createMember({ firstName: "Wes", status: "ACTIVE" });
    await createMember({ firstName: "Old", status: "ALUMNI" });
    await attend(ready.id, 3, admin);
    await attend(invited.id, 3, admin);
    await sendInvites({ memberIds: [invited.id], groupIds: [main.id], channel: "MANUAL" }, admin);
    await markInviteJoined(inGroup.id, main.id, admin);

    const roster = (await getGroupRoster(main.id))!;
    expect(roster.toInvite.map((row) => row.firstName)).toEqual(["Zed", "Yara", "Xavi", "Amy"]);
    expect(roster.toInvite.at(-1)).toMatchObject({ eligible: false, reason: "Needs 3 practices (has 0)" });
    expect(roster.inGroup.map((row) => row.firstName)).toEqual(["Wes"]);
    expect(roster.stats).toEqual({ invitedPeople: 2, joinedPeople: 1 });
    expect(activeMissing.id).toBe(roster.toInvite[0]?.id);
    expect(tooNew.id).toBe(roster.toInvite[3]?.id);
  });
});

describe("Ready for WhatsApp list", () => {
  it("shows active members missing from the main group first, then every prospective member", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const main = await createGroup({ name: "VI Main", isMainGroup: true });
    const activeMissing = await createMember({ firstName: "Active", status: "ACTIVE" });
    const activeIn = await createMember({ firstName: "Done", status: "ACTIVE" });
    const ready = await createMember({ firstName: "Ready" });
    const readyInvited = await createMember({ firstName: "Invited" });
    const attending = await createMember({ firstName: "Attending" });
    await attend(ready.id, 3, admin);
    await attend(readyInvited.id, 3, admin);
    await attend(attending.id, 1, admin);
    await markInviteJoined(activeIn.id, main.id, admin);
    await sendInvites({ memberIds: [readyInvited.id], groupIds: [main.id], channel: "MANUAL" }, admin);

    const { rows } = await listWhatsAppQueue();
    expect(rows.map((row) => [row.name.split(" ")[0], row.kind, row.invitedAt !== null])).toEqual([
      ["Active", "ACTIVE_NOT_IN_GROUP", false],
      ["Ready", "READY", false],
      ["Invited", "READY", true],
      ["Attending", "STILL_ATTENDING", false],
    ]);
    expect(rows.some((row) => row.id === activeIn.id)).toBe(false);
    expect(rows[0]?.id).toBe(activeMissing.id);
  });
});

describe("ordering groups", () => {
  it("saves a dragged order and never loses a group missing from a stale list", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const a = await createGroup({ name: "A" });
    const b = await createGroup({ name: "B" });
    const c = await createGroup({ name: "C" });
    const order = async () => (await listGroups()).map((group) => group.name);

    expect((await reorderGroups([c.id, a.id, b.id], admin.id)).ok).toBe(true);
    expect(await order()).toEqual(["C", "A", "B"]);

    // A list from before "D" was added still keeps D (at the end); unknown ids are ignored.
    const d = await createGroup({ name: "D" });
    await reorderGroups([b.id, c.id, a.id, "00000000-0000-0000-0000-000000000000"], admin.id);
    expect(await order()).toEqual(["B", "C", "A", "D"]);
    expect(d.id).toBeTruthy();
  });
});
