---
description: Run the hook-proofs harness and present the PASS/FAIL table for every shipped hook
argument-hint: "[hook-name]"
allowed-tools:
  - Read
  - Bash(bash:*)
  - Bash(chmod:*)
  - Bash(ls:*)
---

Run the hook-proofs test harness. Every shipped hook has a test file proving three things: it FIRES as documented (realistic payload, exit 0, documented side effect), it BLOCKS as documented (gating hooks only: violating payload, documented block mechanism, documented message), and it NEVER BREAKS THE SESSION (malformed or empty stdin still exits cleanly).

## Steps

### Step 1: Run the harness

```bash
bash .claude/hooks/tests/run-all.sh
```

With an argument, run a single hook's proof instead:

```bash
bash .claude/hooks/tests/run-all.sh test-<hook-name>.sh
```

### Step 2: Present the results

Show the user the PASS/FAIL table exactly as the harness printed it, plus the summary line. Do not paraphrase failures away.

### Step 3: On any FAIL

1. Read the failing test file (`.claude/hooks/tests/test-<name>.sh`) and the hook it tests.
2. Diagnose whether the HOOK regressed or the ENVIRONMENT is missing a dependency (jq, python3).
3. Never weaken a hook's documented behavior to make a test pass. If the hook is genuinely broken, fix the hook, re-run, and log the incident to `.claude/logs/incident-log.md`.
4. Report the root cause to the user with the exact file and line.

## Notes

- The harness runs against a temporary fixture project directory; it never touches your real `.claude/logs` or memory files.
- Runs in under 30 seconds, no network access.
- Tests live in `.claude/hooks/tests/`; the shared assertion library is `_assert.sh`.
