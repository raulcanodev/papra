# R2 Daily Backup Worker

Cloudflare Worker that copies all objects from `papra-prd` to `papra-prd-backup` daily at midnight UTC. Each backup is stored under `backups/YYYY-MM-DD/`.

## Setup

### 1. Create the backup bucket

```sh
npx wrangler r2 bucket create papra-prd-backup
```

### 2. Install dependencies

```sh
cd workers/r2-daily-backup
pnpm install
```

### 3. Deploy

```sh
pnpm deploy
```

### 4. (Optional) Auto-cleanup old backups

Delete backups older than 30 days:

```sh
npx wrangler r2 bucket lifecycle set papra-prd-backup --file lifecycle-rules.json
```

## Development

```sh
pnpm dev              # Local dev with wrangler
npx wrangler tail     # Stream live logs
```

## Notes

- The cron runs daily at `00:00 UTC` (configurable in `wrangler.toml`).
- For buckets with millions of objects, a single cron run may hit the 15-min Worker timeout. In that case, consider using KV to track cursor progress or switch to Cloudflare Workflows.
