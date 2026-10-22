# Claudify Quick Start

You are three steps from a production grade Claude Code system. This guide works whether you are a seasoned developer or have never opened a terminal before. Skip any section that does not apply to you.

## What Claudify is (read this first)

Claudify is a system you install into Claude Code, the command line version of Claude. It is not a plugin for Claude Desktop, Claude.ai, or Claude CoWork. If you have only ever used the Claude chat app, that is fine: this guide installs the command line tool in Step 1.

In plain terms, Claudify turns Claude Code into an organised assistant that remembers your project, follows a daily workflow, runs quality checks automatically, and gets better the more you use it.

---

## Prerequisites

Install these before you start. Skip any you already have. Claudify works on Mac, Windows, and Linux.

### 1. A paid Anthropic plan
Claude Code needs Pro ($20/mo), Max, Teams, or Enterprise. Sign up at [claude.ai](https://claude.ai) if you do not have one.

### 2. Node.js (so the installer can run)
The `npx` command ships with Node.js. Install the LTS version from [nodejs.org](https://nodejs.org) using the default options. Verify in a fresh terminal:

```bash
node --version
npx --version
```

Both should print a version number. If either says "command not found" or "term not recognized", close the terminal completely, open a new one, and check again.

### 3. jq (so the safety checks work)
The hooks use `jq`, a small command line JSON tool.

```bash
# Mac
brew install jq

# Ubuntu / Debian
sudo apt-get install jq

# Windows (Chocolatey)
choco install jq
```

Verify with `jq --version`. Without `jq` the system still runs, but the safety checks (backups, completeness gates, dangerous command blocking) silently skip.

> **New to the terminal?** The "terminal" is the text window where you type commands: the Terminal app on Mac, PowerShell on Windows, your shell on Linux. A "project folder" is simply the folder that holds the files you want Claude to work on. You point Claude Code at that folder. That is all you need to know to follow the steps below.

> **Claude Desktop vs Claude Code.** These are two different tools. Claude Desktop and Claude CoWork are chat apps. Claudify runs inside Claude Code, the command line tool. Commands like `/start` will not work in the Desktop app. You can keep both installed.

---

## 1. Install Claude Code

Skip this if you already have it (run `claude --version` to check).

```bash
# Mac / Linux / WSL
curl -fsSL https://claude.ai/install.sh | bash

# Windows PowerShell
irm https://claude.ai/install.ps1 | iex
```

> **Heads up:** If you have an `ANTHROPIC_API_KEY` environment variable set, Claude Code bills to your API account instead of your subscription. Run `unset ANTHROPIC_API_KEY` if that is not what you want.

---

## 2. Copy the Claudify files into your project

**If this is a fresh or empty project**, copy everything in:

```bash
cd /path/to/your/project
cp -r /path/to/claudify-download/* .
cp -r /path/to/claudify-download/.claude .
```

This adds the `.claude/` system directory, `CLAUDE.md`, `Task Board.md`, `Scratchpad.md`, and `Daily Notes/`.

**If your project already has a `CLAUDE.md`**, protect it first so the copy does not overwrite it:

```bash
cd /path/to/your/project
mv CLAUDE.md CLAUDE.myproject.md   # keep your existing file safe
cp -r /path/to/claudify-download/* .
cp -r /path/to/claudify-download/.claude .
```

Then open the new `CLAUDE.md`, scroll to the bottom, and paste your project's identity, conventions, and rules into the three sections there ("This project", "Project conventions", "Local context"). That part of the file is yours, and updates never touch it. If you already had a `.claude/` folder, merge by hand: keep your `settings.json` permissions and your `memory.md`, and add Claudify's agents, commands, hooks, and skills alongside them. The onboarding prompt in Step 3 then scans your renamed file and fills in the rest.

### One install for every project (optional)
You do not have to copy the files into every project. You can install the shared system once into your home folder:

```bash
cp -r /path/to/claudify-download/.claude ~/.claude
```

Your per project notes (`memory.md`, `CLAUDE.md`) still live in each project, but the agents, commands, and skills are shared from one place, so the skills library is not duplicated into every folder.

---

## 3. Start Claude Code and run the onboarding prompt

```bash
claude
```

Then paste the onboarding prompt below. It tells Claude to scan your project, adopt the Claudify system, and configure everything for your setup.

### Onboarding Prompt (copy and paste this into Claude Code)

```
I just installed the Claudify operating system into this project. The system files are in .claude/ and the main instructions are in CLAUDE.md.

Please do the following:

1. Read CLAUDE.md to understand the full system architecture.
2. Read .claude/memory.md and .claude/knowledge-base.md.
3. Read .claude/command-index.md to learn all available commands.
4. Scan my project structure (files, folders, language, framework, dependencies).
5. Based on what you find, show me a summary of what you detected.
6. Then ask me a few smart questions to tailor the system to my needs:
   - What are my main goals with this project?
   - What does my typical workflow look like?
   - What tasks do I spend the most time on (or want to automate)?
   - Are there any tools, platforms, or services I use regularly?
7. Based on my answers and your scan, update memory.md with:
   - Project name and description
   - Language/framework/build tool
   - Key file paths
   - Any patterns you noticed
   - My goals and workflow preferences
8. Review the skills in .claude/skills/, then recommend the categories and specific skills most relevant to my project and goals.
9. Run /start to initialise the daily workflow.

Scan first, then ask questions. Don't wait for me before doing the initial scan.
```

---

## What you just installed

**6-layer memory:** Claude remembers context across sessions, learns from mistakes, and gets better over time.

**12 specialist agents:** Auditor (quality gate), Unsticker, Error Whisperer, Rubber Duck, PR Ghostwriter, Yak-Shave Detector, Debt Collector, Onboarding Sherpa, Archaeologist, Verifier, Security Review, Test Writer. They run automatically via commands.

**64 commands:** `/start`, `/sync`, `/wrap-up`, `/safe-clear`, `/audit`, `/onboard`, `/review`, `/retro`, `/launch`, `/report`, and more. Type them in Claude Code and the system handles the rest.

**1,734 skills across 31 categories:** Agriculture, AI Automation, Construction, Consulting, Content, Customer Success, Data, Design, Development, Ecommerce, Education, Email, Energy, Finance, Fitness & Wellness, Food & Beverage, Healthcare, HR, Legal, Marketing, Media, Nonprofit, Operations, Product, Productivity, Real Estate, Sales, SEO, Social Media, Startup, Travel.

**20 automated checks:** Deterministic safety nets that run every time: blocks dangerous shell commands, backs up files before overwriting, catches incomplete content, logs everything.

**Self-improvement engine:** Claude observes patterns, nominates learnings, and the auditor promotes confirmed rules. Your system gets smarter the more you use it.

> **Looking for the "Software Development" skills from the website?** In your install they live under the **Development** category inside `.claude/skills/`. Open `.claude/skills/INDEX.md` for the full map of every category and skill.

### How skills, commands, and agents fit together
- **Skills** are reference knowledge. Claude loads the relevant one automatically when your task matches it. You do not call skills directly, they quietly raise the quality of Claude's work in specific domains.
- **Commands** are the actions you type, like `/start` or `/wrap-up`. Each runs a defined workflow.
- **Agents** are specialist helpers that Claude calls on its own (for example the auditor that quality checks work). You rarely invoke them by hand, the commands and the system trigger them when needed.

In short: you type **commands**, the system runs **agents**, and **skills** quietly raise the quality of everything.

---

## Daily workflow

```
Morning:    /start  ->  work  ->  /sync (if switching tasks)
Afternoon:  work  ->  /safe-clear (if context gets heavy)  ->  work
Evening:    /wrap-up
```

## Commands

| Command | When to use |
|---|---|
| `/start` | Beginning of a work session |
| `/sync` | Mid-session to refresh context |
| `/safe-clear` | Between unrelated tasks or when quality drops |
| `/wrap-up` | End of a work session |
| `/audit` | After finishing something important |
| `/onboard` | Scan a new codebase for orientation |
| `/unstick` | When you're stuck on a problem |
| `/review` | Get a code or work review |
| `/retro` | Sprint retrospective |
| `/system-audit` | Deep infrastructure health check |

## Updates and upgrades

**Getting updates.** Claudify improvements are free. The reliable way to update is to re-download from your original purchase link and copy the new `.claude/` files over your install. Your own content is preserved: the three project sections at the bottom of `CLAUDE.md`, your `.claude/memory.md`, and anything your system has learned in `.claude/knowledge-base.md` stay exactly as they are. Updates only replace the shared system files.

**Upgrading to a bigger package.** Already own Claudify and want to add the SEO or Content layer, or move up to Everything? Email hello@claudify.tech and we will send you the owner upgrade price rather than charging full price again.

## FAQ

**Do I need to know how to code?**
No. Everything is plain English, and the prerequisites and steps above assume no prior terminal experience.

**Does this work with any project?**
Yes, any language, framework, or structure. The onboarding prompt adapts automatically.

**My slash commands do not work. Why?**
You are most likely in Claude Desktop or Claude CoWork. Claudify runs only in Claude Code, the command line tool from Step 1.

**Do I install it once or per project?**
Either. Copy it into each project, or install the shared `.claude/` into your home folder once (see Step 2). Your per project memory stays separate.

## Tips

1. **Run `/safe-clear` between unrelated tasks.** Context pollution is the number one quality killer.
2. **Keep `memory.md` under 100 lines.** Prune aggressively.
3. **Let the knowledge base grow naturally.** Don't pre-fill it, let the auditor promote real learnings.
4. **Trust the hooks.** They catch what instructions miss.
5. **Try `/unstick` when you're blocked.** It is better than spinning.

---

**Need help?** Email hello@claudify.tech and we will get you sorted.
