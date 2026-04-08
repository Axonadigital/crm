import type { Contact, EmailAndType } from "../../types";
import { getContactAvatar, hash } from "./getContactAvatar";

describe("getContactAvatar", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should return gravatar URL for anthony@marmelab.com", async () => {
    // All fetch calls return ok (gravatar found on first try)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);

    const email: EmailAndType[] = [
      { email: "anthony@marmelab.com", type: "Work" },
    ];
    const record: Partial<Contact> = { email_jsonb: email };

    const avatarUrl = await getContactAvatar(record);
    const hashedEmail = await hash(email[0].email);
    expect(avatarUrl).toBe(
      `https://www.gravatar.com/avatar/${hashedEmail}?d=404`,
    );
  });

  it("should return favicon URL if gravatar does not exist", async () => {
    // Call 1: gravatar check → not found
    // Call 2: favicon fetch (via fetchWithTimeout) → found
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ ok: callCount > 1 } as Response);
    });

    const email: EmailAndType[] = [
      { email: "no-gravatar@gravatar.com", type: "Work" },
    ];
    const record: Partial<Contact> = { email_jsonb: email };

    const avatarUrl = await getContactAvatar(record);
    expect(avatarUrl).toBe("https://gravatar.com/favicon.ico");
  });

  it("should not return favicon URL if not domain not allowed", async () => {
    // Gravatar check fails; gmail.com is in unsupported domains list
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);

    const email: EmailAndType[] = [
      { email: "no-gravatar@gmail.com", type: "Work" },
    ];
    const record: Partial<Contact> = { email_jsonb: email };

    const avatarUrl = await getContactAvatar(record);
    expect(avatarUrl).toBeNull();
  });

  it("should return null if no email is provided", async () => {
    const record: Partial<Contact> = {};

    const avatarUrl = await getContactAvatar(record);
    expect(avatarUrl).toBeNull();
  });

  it("should return null if an empty array is provided", async () => {
    const email: EmailAndType[] = [];
    const record: Partial<Contact> = { email_jsonb: email };

    const avatarUrl = await getContactAvatar(record);
    expect(avatarUrl).toBeNull();
  });

  it("should return null if email has no gravatar or validate domain", async () => {
    // All fetch calls fail
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);

    const email: EmailAndType[] = [
      { email: "anthony@fake-domain-marmelab.com", type: "Work" },
    ];
    const record: Partial<Contact> = { email_jsonb: email };

    const avatarUrl = await getContactAvatar(record);
    expect(avatarUrl).toBeNull();
  });

  it("should return gravatar URL for 2nd email if 1st email has no gravatar nor valid domain", async () => {
    // Call 1: gravatar for email 1 → fail
    // Call 2: favicon for email 1 domain → fail
    // Call 3: gravatar for email 2 → success
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ ok: callCount === 3 } as Response);
    });

    const email: EmailAndType[] = [
      { email: "anthony@fake-domain-marmelab.com", type: "Work" },
      { email: "anthony@marmelab.com", type: "Work" },
    ];
    const record: Partial<Contact> = { email_jsonb: email };

    const avatarUrl = await getContactAvatar(record);
    const hashedEmail = await hash(email[1].email);
    expect(avatarUrl).toBe(
      `https://www.gravatar.com/avatar/${hashedEmail}?d=404`,
    );
  });
});
