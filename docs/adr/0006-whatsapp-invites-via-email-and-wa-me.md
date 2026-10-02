# 6. WhatsApp invites by email or wa.me, never automation

- **Status:** Accepted (2026-10-02)

## Context

The committee adds new members to several WhatsApp groups. WhatsApp's Business API is paid, and automating personal accounts breaks its terms.

## Decision

- **Group links:** stored per group, visible to Admin and Committee only.
- **Sending:** the app renders an invite message from a template. It is sent by email (bulk-capable), opened as a pre-filled `https://wa.me/<number>?text=…` chat that a person sends, or copied to the clipboard.
- **Joined status:** recorded by hand. Joining a "main" group makes the member Active.
- **Gating:** groups can require the practice threshold. Admins can override, and overrides are audit-logged.

## Consequences

- **Cost and compliance:** free and within WhatsApp's terms.
- **Effort:** one tap per member for WhatsApp; email works in bulk.
