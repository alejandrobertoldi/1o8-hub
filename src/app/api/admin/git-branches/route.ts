import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/js-combine-iterations */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { execSync } from "child_process";

export interface GitBranch {
  name: string;
  shortHash: string;
  date: string;
  author: string;
  subject: string;
  isMain: boolean;
  isCurrent: boolean;
  hasRemote: boolean;
  aheadBehind: { ahead: number; behind: number } | null;
}

export async function GET() {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const currentBranch = execSync("git branch --show-current", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    const raw = execSync(
      "git for-each-ref --sort=-committerdate --format='%(refname:short)|%(objectname:short)|%(committerdate:iso8601)|%(authorname)|%(subject)|%(upstream:short)' refs/heads/",
      { encoding: "utf-8", timeout: 5000 }
    ).trim();

    const defaultBranch = "main";

    const branches: GitBranch[] = raw
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.startsWith("origin"))
      .map((line) => {
        const [name, shortHash, date, author, subject, upstream] =
          line.split("|");

        let aheadBehind: { ahead: number; behind: number } | null = null;
        if (upstream) {
          try {
            const ab = execSync(
              `git rev-list --left-right --count ${name}...${upstream}`,
              { encoding: "utf-8", timeout: 3000 }
            ).trim();
            const [ahead, behind] = ab.split("\t").map(Number);
            aheadBehind = { ahead, behind };
          } catch {
            // branch may not have upstream tracking
          }
        }

        return {
          name,
          shortHash,
          date,
          author,
          subject,
          isMain: name === defaultBranch,
          isCurrent: name === currentBranch,
          hasRemote: !!upstream,
          aheadBehind,
        };
      });

    return NextResponse.json({ branches, currentBranch });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to read git branches" },
      { status: 500 }
    );
  }
}
