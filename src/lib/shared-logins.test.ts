import { describe, expect, it } from "vitest";
import {
  canAccessSharedLogin,
  normalizeLoginUrl,
  parseSharedLoginWrite,
} from "./shared-logins";

describe("normalizeLoginUrl", () => {
  it("leaves http(s) URLs alone", () => {
    expect(normalizeLoginUrl("https://helium10.com")).toBe(
      "https://helium10.com"
    );
  });

  it("prefixes a bare domain with https", () => {
    expect(normalizeLoginUrl("expressvpn.com")).toBe("https://expressvpn.com");
  });

  it("returns null for empty input", () => {
    expect(normalizeLoginUrl(null)).toBeNull();
  });
});

describe("parseSharedLoginWrite", () => {
  it("requires a service name", () => {
    expect(parseSharedLoginWrite({ name: "  " }).ok).toBe(false);
  });

  it("rejects an unknown category", () => {
    const result = parseSharedLoginWrite({ name: "Claude", category: "narp" });
    expect(result.ok).toBe(false);
  });

  it("accepts a complete login", () => {
    const result = parseSharedLoginWrite({
      name: " Helium 10 ",
      category: "seo",
      url: "members.helium10.com",
      username: "amazon@marketfoundry.agency",
      password: "secret",
      notes: "Shared seat",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        name: "Helium 10",
        category: "seo",
        url: "https://members.helium10.com",
        username: "amazon@marketfoundry.agency",
        accounts: [
          {
            username: "amazon@marketfoundry.agency",
            password: "secret",
            subscriptions: [],
          },
        ],
        subscriptions: [],
        activationCode: null,
        subscriptionId: null,
        subscriptionIds: [],
        userLimit: null,
        password: "secret",
        notes: "Shared seat",
        allowedUsers: null,
      },
    });
  });

  it("parses activation code, subscription ID, plan, and assigned users", () => {
    const result = parseSharedLoginWrite({
      name: "ExpressVPN",
      category: "vpn",
      activationCode: "ABCD-1234",
      subscriptionId: "sub_9",
      plan: "Plus",
      allowedUsers: [
        { userId: "11111111-1111-4111-8111-111111111111", enabled: true },
        { userId: "22222222-2222-4222-8222-222222222222", enabled: false },
      ],
    });
    expect(result).toEqual({
      ok: true,
      data: {
        name: "ExpressVPN",
        category: "vpn",
        url: null,
        username: null,
        accounts: [
          {
            username: "",
            password: null,
            subscriptions: [
              {
                subscriptionId: "sub_9",
                plan: "Plus",
                activationCode: "ABCD-1234",
                userLimit: null,
                assignedUsers: [
                  {
                    userId: "11111111-1111-4111-8111-111111111111",
                    enabled: true,
                  },
                  {
                    userId: "22222222-2222-4222-8222-222222222222",
                    enabled: false,
                  },
                ],
              },
            ],
          },
        ],
        subscriptions: [
          {
            subscriptionId: "sub_9",
            plan: "Plus",
            activationCode: "ABCD-1234",
            userLimit: null,
            assignedUsers: [
              { userId: "11111111-1111-4111-8111-111111111111", enabled: true },
              {
                userId: "22222222-2222-4222-8222-222222222222",
                enabled: false,
              },
            ],
          },
        ],
        activationCode: "ABCD-1234",
        subscriptionId: "sub_9",
        subscriptionIds: ["sub_9"],
        userLimit: null,
        password: null,
        notes: null,
        allowedUsers: [
          { userId: "11111111-1111-4111-8111-111111111111", enabled: true },
          { userId: "22222222-2222-4222-8222-222222222222", enabled: false },
        ],
      },
    });
  });

  it("nests subscriptions and assigned users under each login user", () => {
    const result = parseSharedLoginWrite({
      name: "Helium 10",
      category: "seo",
      accounts: [
        {
          username: "amazon@marketfoundry.agency",
          password: "one",
          subscriptions: [
            {
              subscriptionId: "sub_a",
              plan: "Platinum",
              activationCode: "ACT-A",
              userLimit: "5",
              assignedUsers: [
                {
                  userId: "11111111-1111-4111-8111-111111111111",
                  enabled: true,
                },
                {
                  userId: "22222222-2222-4222-8222-222222222222",
                  enabled: false,
                },
              ],
            },
            {
              subscriptionId: "sub_b",
              plan: "Diamond",
              activationCode: "ACT-B",
              userLimit: 2,
            },
          ],
        },
        {
          username: "ppc@marketfoundry.agency",
          password: "two",
          subscriptions: [
            {
              subscriptionId: "sub_c",
              plan: "Starter",
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.accounts).toEqual([
      {
        username: "amazon@marketfoundry.agency",
        password: "one",
        subscriptions: [
          {
            subscriptionId: "sub_a",
            plan: "Platinum",
            activationCode: "ACT-A",
            userLimit: 5,
            assignedUsers: [
              { userId: "11111111-1111-4111-8111-111111111111", enabled: true },
              {
                userId: "22222222-2222-4222-8222-222222222222",
                enabled: false,
              },
            ],
          },
          {
            subscriptionId: "sub_b",
            plan: "Diamond",
            activationCode: "ACT-B",
            userLimit: 2,
            assignedUsers: [],
          },
        ],
      },
      {
        username: "ppc@marketfoundry.agency",
        password: "two",
        subscriptions: [
          {
            subscriptionId: "sub_c",
            plan: "Starter",
            activationCode: null,
            userLimit: null,
            assignedUsers: [],
          },
        ],
      },
    ]);
  });

  it("inverts legacy subscription-first writes onto login users", () => {
    const result = parseSharedLoginWrite({
      name: "Helium 10",
      category: "seo",
      subscriptions: [
        {
          subscriptionId: "sub_a",
          activationCode: "ACT-A",
          userLimit: "5",
          accounts: [
            { username: "ops@marketfoundry.agency", password: "one" },
            { username: "seo@marketfoundry.agency", password: "two" },
          ],
        },
        {
          subscriptionId: "sub_b",
          activationCode: "ACT-B",
          userLimit: 2,
          accounts: [{ username: "ppc@marketfoundry.agency", password: "three" }],
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.accounts.map((account) => account.username)).toEqual([
      "ops@marketfoundry.agency",
      "seo@marketfoundry.agency",
      "ppc@marketfoundry.agency",
    ]);
    expect(result.data.accounts[0]?.subscriptions).toEqual([
      {
        subscriptionId: "sub_a",
        plan: null,
        activationCode: "ACT-A",
        userLimit: 5,
        assignedUsers: [],
      },
    ]);
    expect(result.data.accounts[2]?.subscriptions[0]?.subscriptionId).toBe(
      "sub_b"
    );
  });

  it("rejects a non-integer user limit", () => {
    const result = parseSharedLoginWrite({
      name: "Claude",
      userLimit: "plenty",
    });
    expect(result.ok).toBe(false);
  });
});

describe("canAccessSharedLogin", () => {
  const restricted = {
    accounts: [
      {
        username: "team@x.com",
        hasSecret: true,
        subscriptions: [
          {
            subscriptionId: "sub_a",
            plan: "Plus",
            activationCode: null,
            userLimit: 2,
            assignedUsers: [
              {
                id: "v1",
                name: "V",
                email: "v@x.com",
                image: null,
                enabled: true,
              },
              {
                id: "v2",
                name: "Off",
                email: "off@x.com",
                image: null,
                enabled: false,
              },
            ],
          },
        ],
      },
    ],
    accessRestricted: true,
    allowedUsers: [
      {
        id: "v1",
        name: "V",
        email: "v@x.com",
        image: null,
        enabled: true,
      },
      {
        id: "v2",
        name: "Off",
        email: "off@x.com",
        image: null,
        enabled: false,
      },
    ],
  };

  it("lets admins through even when restricted", () => {
    expect(canAccessSharedLogin(restricted, "nobody", true)).toBe(true);
  });

  it("lets enabled users through", () => {
    expect(canAccessSharedLogin(restricted, "v1", false)).toBe(true);
  });

  it("blocks disabled users", () => {
    expect(canAccessSharedLogin(restricted, "v2", false)).toBe(false);
  });
});
