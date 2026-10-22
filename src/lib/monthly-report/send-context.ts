import { db } from "@/lib/db";
import { aac, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  emailForAccountManager,
  greetingNameFromAacRaw,
  namesByEmailFromSources,
  recipientsForClient,
} from "./recipients";

export type SendAddressBook = {
  greetingName: string | null;
  recipients: string[];
  accountManagerEmail: string | null;
  namesByEmail: Record<string, string>;
};

export async function loadSendAddressBook(opts: {
  clientIdCode: string;
  accountManager: string | null;
}): Promise<SendAddressBook> {
  const [aacRow] = await db
    .select({ rawData: aac.rawData })
    .from(aac)
    .where(eq(aac.clientIdCode, opts.clientIdCode))
    .limit(1);

  const people = await db
    .select({
      name: users.name,
      email: users.email,
      role: users.role,
      clientIdCode: users.clientIdCode,
    })
    .from(users);

  const mapped = people.map((p) => ({
    email: p.email,
    role: String(p.role),
    clientIdCode: p.clientIdCode,
  }));

  return {
    greetingName: greetingNameFromAacRaw(aacRow?.rawData),
    recipients: recipientsForClient(aacRow?.rawData, mapped, opts.clientIdCode),
    accountManagerEmail: emailForAccountManager(people, opts.accountManager),
    namesByEmail: namesByEmailFromSources(people, aacRow?.rawData),
  };
}
