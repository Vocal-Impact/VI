import { describe, expect, it } from "vitest";
import { escapeHtml, textToHtml } from "./email";
import { button, renderEmailLayout, richText } from "./layout";
import { birthdayDigestEmail, groupInviteEmail, testEmail } from "./templates";

describe("email layout", () => {
  const base = { title: "T", preheader: "Preview line", heading: "Hello", bodyHtml: "<p>Body</p>", footerNote: "Why" };

  it("is a complete, branded HTML document with a hidden preheader", () => {
    const html = renderEmailLayout(base);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<div style="display:none');
    expect(html).toContain("Preview line");
    expect(html).toContain("VOCAL IMPACT"); // text wordmark when there's no public logo URL
    expect(html).toContain("<p>Body</p>");
  });

  it("uses the logo image when a public URL is given", () => {
    const html = renderEmailLayout({ ...base, logoUrl: "https://vi.example/brand/logo-primary-white.png" });
    expect(html).toContain('<img src="https://vi.example/brand/logo-primary-white.png"');
    expect(html).not.toContain("VOCAL IMPACT");
  });

  it("escapes everything it's given as text", () => {
    const html = renderEmailLayout({ ...base, heading: "<script>x</script>", footerNote: "a & b" });
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("a &amp; b");
  });

  it("builds bulletproof buttons and linkified rich text", () => {
    expect(button("https://chat.whatsapp.com/Abc", "Join VI Main")).toMatch(
      /<td[^>]*bgcolor="#6d28d9"[\s\S]*href="https:\/\/chat\.whatsapp\.com\/Abc"[\s\S]*Join VI Main/,
    );
    expect(richText("Hi <b>\nhttps://x.lk/a")).toBe(
      'Hi &lt;b&gt;<br><a href="https://x.lk/a" style="color:#6d28d9;word-break:break-all">https://x.lk/a</a>',
    );
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
    expect(textToHtml("a\nb")).toContain("a<br>b");
  });
});

describe("birthday email", () => {
  it("has a card and a WhatsApp button per person", () => {
    const email = birthdayDigestEmail("c@iit.ac.lk", "Kavindu", "Fri, 2 Oct 2026", [
      { name: "Amaya Perera", voiceType: "Alto", turningAge: 22, whatsappNumber: "+94771234567" },
    ]);
    expect(email.to).toBe("c@iit.ac.lk");
    expect(email.subject).toBe("🎂 It's Amaya Perera's birthday today");
    expect(email.text).toContain("Amaya Perera (Alto) — turning 22 — WhatsApp +94771234567");
    expect(email.html).toContain("Amaya Perera");
    expect(email.html).toContain('href="https://wa.me/94771234567"');
    expect(email.html).toContain("Wish them on WhatsApp");
    expect(email.html).toContain("turning <b");
  });

  it("summarises several birthdays in the subject", () => {
    const person = { name: "A", voiceType: "Alto", turningAge: null, whatsappNumber: "+94770000000" };
    expect(birthdayDigestEmail("c@iit.ac.lk", "K", "today", [person, person]).subject).toBe(
      "🎂 2 Vocal Impact birthdays today",
    );
  });
});

describe("WhatsApp invite email", () => {
  it("shows the committee's message with a Join button per group where the list goes", () => {
    const email = groupInviteEmail({
      to: "nethmi@iit.ac.lk",
      firstName: "Nethmi",
      text: "Hi Nethmi!\n• VI Main — https://chat.whatsapp.com/Main123\nSee you!",
      before: "Hi Nethmi! Here are your groups:\n",
      after: "\nSee you at the next practice!",
      groups: [
        { name: "VI Main", inviteLink: "https://chat.whatsapp.com/Main123" },
        { name: "Altos", inviteLink: "https://chat.whatsapp.com/Alto456" },
      ],
    });
    expect(email.subject).toBe("Your Vocal Impact WhatsApp group links 🎶");
    expect(email.text).toContain("https://chat.whatsapp.com/Main123");
    expect(email.html).toContain("You&#39;re invited, Nethmi! 🎶");
    expect(email.html).toContain("Join VI Main");
    expect(email.html).toContain("Join Altos");
    // Order within the body (the hidden preheader at the top also mentions the groups).
    const body = email.html.slice(email.html.indexOf("invited, Nethmi"));
    const order = ["Here are your groups", "Join VI Main", "Join Altos", "See you at the next practice"].map((part) =>
      body.indexOf(part),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((index) => index > 0)).toBe(true);
  });
});

describe("test email", () => {
  it("uses the same layout", () => {
    const email = testEmail("admin@iit.ac.lk", "Soshan");
    expect(email.html).toContain("It works!");
    expect(email.text).toContain("Hi Soshan");
  });
});
