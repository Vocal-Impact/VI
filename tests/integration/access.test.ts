import { describe, expect, it } from "vitest";
import { createAllowlistedUser, listMemberAccess, setMemberAccess, updateUser } from "@/modules/auth";
import { prisma } from "@/shared/db/prisma";
import { createMember, createUser } from "../support/factories";

describe("access & roles (member-linked logins)", () => {
  it("promotes a member to committee, then admin, then removes access", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const member = await createMember({ firstName: "Nethmi", email: "nethmi.w1@iit.ac.lk" });

    const grant = await setMemberAccess(
      { memberId: member.id, level: "COMMITTEE", receivesBirthdayReminders: true },
      admin.id,
    );
    expect(grant.ok).toBe(true);
    const login = await prisma.user.findUniqueOrThrow({ where: { memberId: member.id } });
    expect(login).toMatchObject({
      email: "nethmi.w1@iit.ac.lk",
      name: "Nethmi Test",
      role: "COMMITTEE",
      active: true,
      emailVerified: true,
      receivesBirthdayReminders: true,
    });

    await setMemberAccess({ memberId: member.id, level: "ADMIN", receivesBirthdayReminders: true }, admin.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: login.id } })).role).toBe("ADMIN");

    // A session exists, then access is removed → login disabled and signed out.
    await prisma.session.create({
      data: { id: "s1", token: "t1", userId: login.id, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    await setMemberAccess({ memberId: member.id, level: "NONE", receivesBirthdayReminders: false }, admin.id);
    // "Member" level: committee powers gone, but they can still sign in to reply to practices.
    const removed = await prisma.user.findUniqueOrThrow({ where: { id: login.id } });
    expect(removed).toMatchObject({ role: "MEMBER", active: true });

    // Re-granting reuses the same login (no duplicates).
    await setMemberAccess({ memberId: member.id, level: "COMMITTEE", receivesBirthdayReminders: false }, admin.id);
    expect(await prisma.user.count({ where: { email: "nethmi.w1@iit.ac.lk" } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: login.id } })).role).toBe("COMMITTEE");

    const rows = await listMemberAccess({ level: "WITH_ACCESS" });
    expect(rows.map((row) => [row.firstName, row.level])).toEqual([["Nethmi", "COMMITTEE"]]);
    expect(await prisma.auditLog.count({ where: { entityId: member.id, action: { startsWith: "access." } } })).toBe(4); // grant, promote, demote, re-grant
  });

  it("links an existing login with the same email instead of duplicating it", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const added = await createAllowlistedUser(
      { name: "Kavindu", email: "kavindu@iit.ac.lk", role: "COMMITTEE" },
      admin.id,
    );
    expect(added.ok).toBe(true);
    const member = await createMember({ email: "kavindu@iit.ac.lk" });

    await setMemberAccess({ memberId: member.id, level: "ADMIN", receivesBirthdayReminders: false }, admin.id);
    const login = await prisma.user.findUniqueOrThrow({ where: { email: "kavindu@iit.ac.lk" } });
    expect(login.memberId).toBe(member.id);
    expect(login.role).toBe("ADMIN");
    expect(await prisma.user.count()).toBe(2);
  });

  it("auto-links when an admin adds an account by email for an existing member", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const member = await createMember({ email: "sachini@iit.ac.lk" });
    await createAllowlistedUser({ name: "Sachini", email: "sachini@iit.ac.lk", role: "COMMITTEE" }, admin.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "sachini@iit.ac.lk" } })).memberId).toBe(member.id);
  });

  it("stops admins changing their own access and keeps at least one admin", async () => {
    const member = await createMember({ email: "solo.admin@iit.ac.lk" });
    const first = await createUser({ role: "ADMIN" });
    await setMemberAccess({ memberId: member.id, level: "ADMIN", receivesBirthdayReminders: false }, first.id);
    const memberAdmin = await prisma.user.findUniqueOrThrow({ where: { memberId: member.id } });

    const self = await setMemberAccess(
      { memberId: member.id, level: "NONE", receivesBirthdayReminders: false },
      memberAdmin.id,
    );
    expect(self.ok).toBe(false);
    const selfDemote = await updateUser(
      { userId: first.id, role: "COMMITTEE", active: true, receivesBirthdayReminders: false },
      first.id,
    );
    expect(selfDemote.ok).toBe(false);

    // Another admin removes the first admin → fine; then the last admin can't be removed.
    await updateUser(
      { userId: first.id, role: "COMMITTEE", active: false, receivesBirthdayReminders: false },
      memberAdmin.id,
    );
    const helper = await createUser({ role: "COMMITTEE" });
    const last = await setMemberAccess(
      { memberId: member.id, level: "NONE", receivesBirthdayReminders: false },
      helper.id,
    );
    expect(last.ok).toBe(false);
  });
});
