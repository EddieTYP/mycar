# scripts/

Small utility scripts used by this repo.

## Files

- `manage-accounts.js`
  - CLI for viewing, adding, deleting, and updating accounts stored in `.env` as `AUTH_ACCOUNTS_JSON`.
  - Typical entrypoint:
    - `npm run accounts -- view`
    - `npm run accounts -- add user2 secret123`
    - `npm run accounts -- set-password user2 newsecret`

- `sync-cloudflare-secrets.sh`
  - Pushes selected values from local `.env` into Cloudflare Pages secrets.
  - Requires `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and Wrangler in the current shell.
  - Writes `.cloudflare-sync-state.json` as a local generated record.
  - Typical entrypoint:
    - `npm run sync:cloudflare`
  - Related local template:
    - `.dev.vars.example` for `wrangler pages dev`

- `smoke-test.sh`
  - Lightweight local API smoke test.
  - Requires a running local server and a valid local `.env` with at least one account in `AUTH_ACCOUNTS_JSON`.
  - Typical entrypoint:
    - `npm run smoke`

## Generated local state

The following files are local-only and git-ignored:

- `.env`
- `.dev.vars`
- `.cloudflare-sync-state.json`
- `LOCAL-DEVELOPMENT-NOTES.md`
