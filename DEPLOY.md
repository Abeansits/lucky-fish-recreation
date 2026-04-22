# Lucky Fish — deploy notes

Live URL: **https://lucky-fish-production.up.railway.app**

Hosted on Railway. Pure static site served by `nginx:alpine`. No build step.

## First deploy

Already done (2026-04-21). These notes are for future redeploys + recovery.

## Project IDs

- Project: `lucky-fish` — `aced217a-ae45-4a07-8823-33e6028b020f`
- Service: `lucky-fish` — `819e42c6-631b-49d6-a9d0-45f361c1dd2d`
- Environment: `production` — `b9e6213c-c472-4591-acf8-06ec711ee3c8`
- Workspace: `Sebastian Nystorm's Projects`

## Redeploy (any time you change index.html / style.css / game.js / assets)

From the repo root:

```bash
railway up --detach -m "short description of change"
```

That's it. `railway.json` is not used — link state lives in `.railway/config.json` (auto-created by `railway init`).

## How it's built

- `Dockerfile` is two lines: `FROM nginx:alpine` + `COPY . /usr/share/nginx/html`.
- `.dockerignore` strips `.git`, `screenshots/`, `scripts/`, `*.md`, env/key files, and the Dockerfile itself before `COPY .`.
- `.railwayignore` strips the same noise from the upload tarball `railway up` sends to the builder. Do NOT add `Dockerfile` to `.railwayignore` — Railway needs to see it there or it falls back to Railpack auto-detection and builds the wrong thing.
- Service has `PORT=80` variable set. nginx default listens on 80; Railway proxies. Setting this explicitly prevents drift if Railway ever changes its default.

## Common ops

```bash
# Watch a deploy
railway logs --service lucky-fish --lines 100

# Check service status
railway service status --all --json

# Variables
railway variables --service lucky-fish --json
railway variables --set KEY=value --service lucky-fish

# Stop the service (rollback to nothing)
railway down

# Redeploy the last successful build without uploading
railway redeploy --service lucky-fish
```

## If redeploy breaks

1. `railway logs --service lucky-fish --lines 200` — look at build + runtime logs.
2. Build failed? Check nginx base image pull + COPY path.
3. Runtime 502 for the first 10-15 seconds after deploy? Normal — TCP proxy waits for container.
4. Persistent 502? Check `railway variables` — if `PORT` got unset or changed away from 80, set it back.
5. Assets 404? Something in `.dockerignore` is too aggressive. The rule of thumb: files needed by `index.html` / `game.js` must NOT match any pattern there.

## Custom domain (future)

Not set up. To add your own domain (e.g. `luckyfish.example.com`):

```bash
railway domain add luckyfish.example.com --service lucky-fish
```

Then add the CNAME Railway prints to your DNS. TLS is auto-provisioned.

## Dashboard

https://railway.com/project/aced217a-ae45-4a07-8823-33e6028b020f
