---
name: workspace
description: Use whenever a task produces files, scripts, documents, or results worth keeping — anything that should outlive this conversation. Guides organized, durable use of the workspace tools (workspace_init, workspace_run, workspace_commit).
---

# Working in the workspace

Your workspace is a git repository cloned onto your sandbox's local disk at `/home/user/workspace`. The sandbox is ephemeral — it can vanish between sessions — so **the repository is your only durable state**. Work that isn't committed and pushed does not exist tomorrow. If a workspace tool answers `WORKSPACE_NOT_READY`, a concurrent operation is repairing the clone — retry once after a moment.

## Method

1. **`workspace_init` first, always.** It clones or refreshes the repo and shows the top-level contents. Never assume files from a previous session are present until you've run it.
2. **Look before you write.** List the existing structure (`workspace_run` with `ls -R` or `find`) and follow the conventions already there — directory layout, naming, formats. Extend the existing shape; don't invent a parallel one.
3. **Organize by purpose.** Group files into directories named for what they are (`reports/`, `scripts/`, `data/`, `notes/`), with descriptive kebab-case filenames. A future session — or the user browsing the repo on GitHub — should understand the layout without you there to explain it.
4. **Commit small and often.** Call `workspace_commit` after each meaningful unit of work, with a message saying what changed and why. Don't batch a whole session into one commit — an interrupted session loses everything uncommitted.
5. **Make steps re-runnable.** Commands may execute twice (the backend can retry). Prefer idempotent forms: `mkdir -p`, `>` over `>>` for generated files, scripts that produce the same result on a second run.
6. **Deliver by reference.** When you finish, tell the user what you produced and where — exact paths, one line on each file's content. The repo is on GitHub; they can open it.

## Rules

- **Never write secrets into the workspace** — no tokens, keys, or passwords, even temporarily. The repo's history is durable in the way you want your work, not your credentials, to be.
- Prefer committing the *generator* over bulky *generated* output: a small script plus instructions beats megabytes of derived data, unless the output itself is the deliverable.
- If a command fails oddly (lock errors, "already exists" on fresh paths), re-run it once before diagnosing — you may have raced a duplicate dispatch of yourself.
