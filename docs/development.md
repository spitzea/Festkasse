# Development

The application deliberately uses no frontend frameworks.

```text
server.js              Node HTTP server, JSON data, login and print endpoints
public/app.js          Browser logic and UI rendering
public/styles.css      Design system, layout and print CSS
data/defaults.json     Neutral base data and system template, versioned
data/active-event.json Live runtime state, not versioned
data/logo.json         Event logo, kept out of the event file, not versioned
```

The binding rules for code, data, commits, push and releases are in
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Local quality check

Before a commit, at least check the JavaScript files for syntax errors:

```bash
node --check server.js
node --check public/app.js
node --check public/report-shared.js
```

Start the application locally:

```bash
npm start
```

It is then reachable at `http://localhost:3000`.

## Testing without touching the live state

The data directory is fixed to `data/` next to `server.js`, so a test server
started in the repository writes to the live register state. Work on a copy
instead:

```bash
git ls-files | tar -cf - -T - | (mkdir -p ../Festkasse-Test && tar -xf - -C ../Festkasse-Test)
cd ../Festkasse-Test
PORT=3100 node server.js
```

The copy contains `data/defaults.json` but no `data/active-event.json`, so the
server creates a fresh, neutral state on first start. Delete the directory when
you are done.

[Back to the README](../README.md)
