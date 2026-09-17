# Contributing to Festkasse

This file describes the binding rules for code, data, commits, push and
releases. They apply to everyone working on this project, including AI
assistants.

Festkasse is a hobby project for German clubs and volunteer fire brigades. The
rules are deliberately short. What is written here applies without exception.

[AGENTS.md](AGENTS.md) summarises for AI assistants the points that go wrong
most often in practice. It does not replace this file.

## Language

The audience decides, not the file extension.

**English** for everything a contributor reads: this file, `AGENTS.md`,
`docs/development.md`, issues, pull requests and commit messages.

**German** for everything an operator reads: the user interface, `README.md`,
release notes, and the guides under `docs/` that cover installation and
operation (`installation.md`, `windows-setup.md`, `raspberry-pi-kiosk.md`,
`features.md`, `legal.md`, `screenshots.md`).

The people running a register at a village fair read German. The people
changing the code read English. A German README linking to an English
development guide is intentional, not an oversight.

## Principles

- No frontend framework, no bundler, no build step. The files under `public/`
  are served exactly as they sit in the repository.
- Runtime dependencies are only added when there is no alternative. `serialport`
  is currently the only one.
- The register must work fully offline. No calls to external services, no fonts
  or scripts from foreign servers.

## Layout

```text
server.js              Node HTTP server, JSON data, login, printing
public/app.js          Browser logic and user interface
public/report-shared.js Reporting logic, shared between server and browser
public/styles.css      Design system, layout and print CSS
data/defaults.json     Neutral base data, versioned
data/active-event.json Live register state, not versioned
```

Logic needed by both the server and the browser belongs in
`public/report-shared.js` and is not duplicated.

## Coding rules

**Permissions are checked on the server.** The interface hides controls by
role, which is convenience and not a safeguard. Every endpoint in `handleApi`
checks the role itself. Whoever adds an endpoint states the required role
explicitly.

**Never put foreign input into HTML unescaped.** Text taken from the state and
written into a template goes through the existing escape function first. That
includes fields only an administrator appears to fill.

**Handle money in cents.** Store and calculate in integers, format only for
display. No floating point arithmetic on prices.

**Constrain file paths.** Paths coming from settings or requests are checked
against the project directory before anything is written.

**No secrets in the code and none in commits.** Passwords exist only as salted
hashes. The documented default passwords in `data/defaults.json` are
intentional and stay.

## Product decisions

Some things look like defects in a review but are deliberate. Do not "fix"
them, and do not raise them again.

**Changing the default passwords is not enforced** (see issue #15). Many clubs
explicitly do not want them changed. A stand is staffed by volunteers who
rotate during the day, often people who have never seen the register before.
Forcing a password change means that at some point on a busy evening nobody
present can log in, which is worse than a well known password on a register
that runs offline or on a private network behind a locked door.
`hasDefaultPassword` therefore only drives the hint on the login screen, which
hides each account individually as soon as that account gets its own password.
Clubs that do want real passwords set them in the admin area.

**No tamper-evident journal.** Plain append-only order storage is enough. This
is a hobby project and the measures stay proportionate; hash chains or similar
are explicitly not wanted.

**Single register.** One cash register plus one or two read-only report
sessions. Multi-terminal operation is not a goal, so the exclusive session lock
is a feature, not a limitation to be engineered away.

## Data rules

`data/active-event.json` holds the live register state including club name,
logo, contact details and bookings. The file **never** belongs in the
repository. It is listed in `.gitignore`. The server creates it from
`data/defaults.json` on first start.

`data/defaults.json` stays neutral. No club name, no logo, no phone number, no
bookings, all three accounts with the documented default passwords.

Before every commit, check with `git status` that no file under `data/` is
staged by accident.

**Tests never run against `data/`.** Anyone starting a server to try something
out uses a separate port and a separate data directory. A test run against the
real directory overwrites the state of a live event.

## Before committing

```bash
node --check server.js
node --check public/app.js
node --check public/report-shared.js
npm start
```

Then, in the interface, at least log in, create a booking, cancel it and open
the report. Anyone who touched roles or login checks all three accounts as
well.

## Commit rules

- One commit, one topic. Do not mix cleanup with a change in behaviour.
- Subject line in English, imperative or plain statement, at most 72
  characters, no trailing period.
- The body explains why, not what. Wrap lines at 72 characters.
- If the commit belongs to an issue, name it in the body.

**Stage files individually, then commit without a path argument:**

```bash
git add server.js public/app.js
git status
git commit
```

Do not use `git commit -- <file>`. That form commits the working tree state and
bypasses the index. A removal staged with `git rm --cached` is lost in the
process and the file ends up back in the repository.

Do not use `git commit -a`. It picks up changes nobody reviewed.

## Branches and push

- Small corrections may go straight to `main`.
- Anything touching more than one file, or spanning several sessions, gets its
  own branch with a descriptive name, such as `fix/qr-code-network-change`.
- Before pushing, run `git log --stat` over your own commits and confirm that
  no runtime or club data is included. Once something is on GitHub it is
  public, even after it is deleted later.
- No force push to `main`.
- History is only rewritten while nothing has been published, and only when
  nobody else is working on the branch.

## Parallel sessions

Several people or assistants occasionally work in the same working directory
at the same time. That leads to swapped branches and overwritten files.

Anyone working on a topic for a while creates their own working directory:

```bash
git worktree add ../Festkasse-<topic> -b fix/<topic>
```

Before switching branches or running `git reset` in the shared directory, check
whether somebody else is working there.

## Releases

1. Raise the version in `package.json`.
2. Confirm that the version shown in the interface matches.
3. Tag and create the release.
4. Release notes are written in German, because operators read them.
5. **Release notes describe only what is actually in the code.** Verify every
   claim against the diff before publishing. An announced security fix that
   never made it into the code is worse than no announcement at all, because
   operators rely on it.
6. If an update needs manual steps on existing installations, say so at the top
   of the notes.

## Reporting security issues

Please do not file security findings as public issues. Report them directly to
the maintainer of the repository.

[Back to the README](README.md)
