import { describe, expect, it } from "vitest";
import { escapeHtml, textToHtml } from "./email";
import { birthdayDigestEmail, groupInviteEmail } from "./templates";

describe("email templates", () => {
  it("builds a single-birthday digest", () => {
    const email = birthdayDigestEmail("c@iit.ac.lk", "Kavindu", "Fri, 2 Oct 2026", [
      { name: "Amaya Perera", voiceType: "Alto", turningAge: 22, whatsappNumber: "+94771234567" },
    ]);
    expect(email.to).toBe("c@iit.ac.lk");
    expect(email.subject).toBe("🎂 It's Amaya Perera's birthday today");
    expect(email.text).toContain("Amaya Perera (Alto) — turning 22 — WhatsApp +94771234567");
  });

  it("summarises several birthdays in the subject", () => {
    const person = { name: "A", voiceType: "Alto", turningAge: null, whatsappNumber: "+94770000000" };
    expect(birthdayDigestEmail("c@iit.ac.lk", "K", "today", [person, person]).subject).toBe(
      "🎂 2 Vocal Impact birthdays today",
    );
  });

  it("escapes HTML and links invite URLs", () => {
    const email = groupInviteEmail("m@iit.ac.lk", "Hi <b>you</b>\nhttps://chat.whatsapp.com/Abc123456789");
    expect(email.html).toContain("Hi &lt;b&gt;you&lt;/b&gt;<br>");
    expect(email.html).toContain('<a href="https://chat.whatsapp.com/Abc123456789"');
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
    expect(textToHtml("a\nb")).toContain("a<br>b");
  });

  it("adds the logo header only when a public logo URL is given", () => {
    expect(textToHtml("hi", "https://vi.example/brand/logo-email.png")).toContain(
      '<img src="https://vi.example/brand/logo-email.png"',
    );
    expect(textToHtml("hi")).not.toContain("<img");
  });
});
