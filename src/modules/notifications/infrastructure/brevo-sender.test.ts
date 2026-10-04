import { describe, expect, it, vi } from "vitest";
import { parseMailbox } from "../domain/email";
import { BrevoEmailSender } from "./brevo-sender";

const message = { to: "member@iit.ac.lk", subject: "Hello", text: "Hi there", html: "<p>Hi there</p>" };

describe("parseMailbox", () => {
  it("splits a display name from the address", () => {
    expect(parseMailbox("Vocal Impact <committee@iit.ac.lk>")).toEqual({
      name: "Vocal Impact",
      email: "committee@iit.ac.lk",
    });
    expect(parseMailbox('"Vocal Impact" <committee@iit.ac.lk>')).toEqual({
      name: "Vocal Impact",
      email: "committee@iit.ac.lk",
    });
    expect(parseMailbox(" committee@iit.ac.lk ")).toEqual({ email: "committee@iit.ac.lk" });
  });
});

describe("BrevoEmailSender", () => {
  it("posts the email to Brevo's transactional API with the api-key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "<id>" }), { status: 201 }));
    await new BrevoEmailSender("xkeysib-test", "Vocal Impact <committee@iit.ac.lk>", fetchMock).send(message);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: "Vocal Impact", email: "committee@iit.ac.lk" },
      to: [{ email: "member@iit.ac.lk" }],
      subject: "Hello",
      htmlContent: "<p>Hi there</p>",
      textContent: "Hi there",
    });
  });

  it("surfaces Brevo's error so the committee can see what went wrong", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ code: "unauthorized", message: "Key not found" }), { status: 401 }),
      );
    await expect(new BrevoEmailSender("bad", "a@b.lk", fetchMock).send(message)).rejects.toThrow(
      "Brevo responded 401 (unauthorized: Key not found)",
    );
  });
});
