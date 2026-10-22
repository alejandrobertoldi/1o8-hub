import { describe, it, expect } from "vitest";
import {
  emailsFromAacRaw,
  greetingNameFromAacRaw,
  greetingNameForSend,
  namesByEmailFromSources,
  mergeEmails,
  userAssignedToClient,
  portalEmailsFromUsers,
  emailForAccountManager,
  recipientsForClient,
  filterSendRecipients,
  parseCustomRecipients,
  staffThreadCopies,
  MAX_CUSTOM_RECIPIENTS,
} from "./recipients";

describe("emailsFromAacRaw", () => {
  it("reads ClientContactEmail1–5 and skips blanks and junk", () => {
    expect(emailsFromAacRaw({
      ClientContactEmail1: "a@brand.com",
      ClientContactEmail2: "  ",
      ClientContactEmail3: "not-an-email",
      ClientContactEmail4: "b@brand.com",
      AmazonContactEmail: "seller@amazon.com",
    })).toEqual(["a@brand.com", "b@brand.com"]);
  });

  it("parses a JSON string the same as an object", () => {
    expect(emailsFromAacRaw('{"ClientContactEmail1":"x@y.com"}')).toEqual(["x@y.com"]);
  });
});

describe("greetingNameFromAacRaw", () => {
  it("uses ClientContactName1", () => {
    expect(greetingNameFromAacRaw({ ClientContactName1: "Jamie" })).toBe("Jamie");
    expect(greetingNameFromAacRaw({})).toBeNull();
  });
});

describe("namesByEmailFromSources", () => {
  it("maps AAC contacts and lets a hub user name win", () => {
    expect(namesByEmailFromSources(
      [{ name: "Manuel Lancharro", email: "manuel.lancharro@1o8.agency" }],
      {
        ClientContactName1: "Jake Kosten",
        ClientContactEmail1: "jake@gaffer.com",
      },
    )).toEqual({
      "jake@gaffer.com": "Jake Kosten",
      "manuel.lancharro@1o8.agency": "Manuel Lancharro",
    });
  });
});

describe("greetingNameForSend", () => {
  const names = {
    "jake@gaffer.com": "Jake Kosten",
    "manuel.lancharro@1o8.agency": "Manuel Lancharro",
  };

  it("greets the actual recipient by first name", () => {
    expect(greetingNameForSend(["manuel.lancharro@1o8.agency"], names)).toBe("Manuel");
    expect(greetingNameForSend(["jake@gaffer.com"], names)).toBe("Jake");
  });

  it("joins first names when the list mixes people", () => {
    expect(greetingNameForSend(
      ["jake@gaffer.com", "manuel.lancharro@1o8.agency"],
      names,
    )).toBe("Jake and Manuel");
  });

  it("does not repeat the same first name", () => {
    expect(greetingNameForSend(
      ["jake@gaffer.com", "jake@marketfoundry.agency"],
      { "jake@gaffer.com": "Jake Kosten", "jake@marketfoundry.agency": "Jake Kosten" },
    )).toBe("Jake");
  });
});

describe("mergeEmails", () => {
  it("dedupes case-insensitively and keeps the first spelling", () => {
    expect(mergeEmails(["A@Brand.com", "a@brand.com", "b@brand.com"])).toEqual([
      "A@Brand.com",
      "b@brand.com",
    ]);
  });
});

describe("userAssignedToClient", () => {
  it("matches a code in a comma-separated assignment", () => {
    expect(userAssignedToClient("BNU_SC_US,DLR_SC_US", "BNU_SC_US")).toBe(true);
    expect(userAssignedToClient("BNU_SC_US", "DLR_SC_US")).toBe(false);
    expect(userAssignedToClient(null, "BNU_SC_US")).toBe(false);
  });
});

describe("portalEmailsFromUsers", () => {
  it("keeps client/prospect users assigned to this AAC code", () => {
    expect(portalEmailsFromUsers([
      { email: "client@brand.com", role: "client", clientIdCode: "BNU_SC_US" },
      { email: "other@brand.com", role: "client", clientIdCode: "DLR_SC_US" },
      { email: "editor@marketfoundry.agency", role: "editor", clientIdCode: "BNU_SC_US" },
    ], "BNU_SC_US")).toEqual(["client@brand.com"]);
  });
});

describe("emailForAccountManager", () => {
  it("matches the AAC AM name to a hub user", () => {
    expect(emailForAccountManager([
      { name: "Aqib Abbasi", email: "aqib@marketfoundry.agency" },
      { name: "Manu Lancharro", email: "manu@marketfoundry.agency" },
    ], "aqib  abbasi")).toBe("aqib@marketfoundry.agency");
    expect(emailForAccountManager([], "Aqib Abbasi")).toBeNull();
  });
});

describe("recipientsForClient", () => {
  it("merges AAC contacts with portal users for this client", () => {
    expect(recipientsForClient(
      { ClientContactEmail1: "nate@bnutty.com" },
      [
        { email: "carol@bnutty.com", role: "client", clientIdCode: "BNU_SC_US" },
        { email: "other@brand.com", role: "client", clientIdCode: "DLR_SC_US" },
      ],
      "BNU_SC_US",
    )).toEqual(["nate@bnutty.com", "carol@bnutty.com"]);
  });

  it("drops agency staff inboxes from the client To list", () => {
    expect(recipientsForClient(
      {
        ClientContactEmail1: "jake@marketfoundry.agency",
        ClientContactEmail2: "jake@gaffersportfishing.com",
      },
      [
        { email: "manuel.lancharro@1o8.agency", role: "client", clientIdCode: "GAF_SC_US" },
        { email: "jake@gaffersportfishing.com", role: "client", clientIdCode: "GAF_SC_US" },
      ],
      "GAF_SC_US",
    )).toEqual(["jake@gaffersportfishing.com"]);
  });
});

describe("parseCustomRecipients", () => {
  it("keeps valid emails, drops junk, and caps the list", () => {
    expect(parseCustomRecipients(["cfo@brand.com", "nope", "  CFO@brand.com  "])).toEqual([
      "cfo@brand.com",
    ]);
    const many = Array.from({ length: MAX_CUSTOM_RECIPIENTS + 3 }, (_, i) => `a${i}@brand.com`);
    expect(parseCustomRecipients(many)).toHaveLength(MAX_CUSTOM_RECIPIENTS);
  });
});

describe("filterSendRecipients", () => {
  const book = ["nate@bnutty.com", "carol@bnutty.com"];

  it("keeps the full book when the request omits recipients", () => {
    expect(filterSendRecipients(book, undefined)).toEqual(book);
  });

  it("keeps only enabled addresses that are in the book", () => {
    expect(filterSendRecipients(book, ["carol@bnutty.com", "intruder@evil.com"])).toEqual([
      "carol@bnutty.com",
    ]);
  });

  it("includes custom extras that were explicitly requested", () => {
    expect(filterSendRecipients(
      book,
      ["carol@bnutty.com", "cfo@brand.com"],
      ["cfo@brand.com", "intruder@evil.com"],
    )).toEqual(["carol@bnutty.com", "cfo@brand.com"]);
  });

  it("returns empty when every address is disabled", () => {
    expect(filterSendRecipients(book, [])).toEqual([]);
  });
});

describe("staffThreadCopies", () => {
  it("sets Reply-To to the AM and CCs AM + CEO", () => {
    expect(staffThreadCopies({
      to: ["jamie@brand.com"],
      accountManagerEmail: "alex@marketfoundry.agency",
    })).toEqual({
      replyTo: "alex@marketfoundry.agency",
      cc: ["alex@marketfoundry.agency", "jake@marketfoundry.agency"],
    });
  });

  it("skips anyone already in To", () => {
    expect(staffThreadCopies({
      to: ["alex@marketfoundry.agency"],
      accountManagerEmail: "alex@marketfoundry.agency",
    })).toEqual({
      replyTo: "alex@marketfoundry.agency",
      cc: ["jake@marketfoundry.agency"],
    });
  });

  it("does not duplicate when AM is the CEO", () => {
    expect(staffThreadCopies({
      to: ["jamie@brand.com"],
      accountManagerEmail: "jake@marketfoundry.agency",
    })).toEqual({
      replyTo: "jake@marketfoundry.agency",
      cc: ["jake@marketfoundry.agency"],
    });
  });

  it("returns null Reply-To when there is no AM email", () => {
    expect(staffThreadCopies({
      to: ["jamie@brand.com"],
      accountManagerEmail: null,
    })).toEqual({
      replyTo: null,
      cc: ["jake@marketfoundry.agency"],
    });
  });
});
