# Notes for AI assistants

This file applies to every AI assistant working in this repository, regardless
of the tool. It is the only file of its kind; tool-specific variants are
deliberately not maintained.

The binding rules for this project are in [CONTRIBUTING.md](CONTRIBUTING.md).
Read them before you change code, data or git history. They apply to you
unchanged.

These are the points that go wrong most often in practice:

**Never touch `data/active-event.json`.** The file is the live register state
of a real event and is not versioned. Do not commit it, do not overwrite it,
do not delete it, do not use it as a basis for testing.

**Start a test server only with its own port and its own data directory.**
Starting against `data/` destroys the register state.

**No `git commit -- <file>` and no `git commit -a`.** Stage files individually
with `git add`, check with `git status`, then commit without a path argument.
The path argument bypasses the index and undoes a `git rm --cached`.

**Do not push unless asked.** Publishing is the maintainer's decision.

**Watch out for parallel sessions.** Several assistants share this working
directory. Before switching branches, running `git reset` or killing a Node
process, check whether somebody else is working on it. For longer work, create
your own worktree.

**Permissions belong on the server.** The interface only hides controls; that
is no substitute for a check in `handleApi`.

**Mind the language split.** English for contributor-facing text: commit
messages, issues, this file, `CONTRIBUTING.md`, `docs/development.md`. German
for operator-facing text: the user interface, `README.md`, release notes and
the installation and operating guides under `docs/`.

**Check the product decisions before reporting a finding.** `CONTRIBUTING.md`
lists things that look like defects but are deliberate, among them the default
passwords that are not forced to change. Do not raise them again.
