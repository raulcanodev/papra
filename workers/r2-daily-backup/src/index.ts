interface Env {
  SOURCE_BUCKET: R2Bucket;
  BACKUP_BUCKET: R2Bucket;
}

const LIST_PAGE_SIZE = 1000;

async function copyObject({ key, sourceBucket, backupBucket, prefix }: {
  key: string;
  sourceBucket: R2Bucket;
  backupBucket: R2Bucket;
  prefix: string;
}): Promise<boolean> {
  const source = await sourceBucket.get(key);

  if (!source) {
    return false;
  }

  await backupBucket.put(`${prefix}${key}`, source.body, {
    httpMetadata: source.httpMetadata,
    customMetadata: source.customMetadata,
  });

  return true;
}

async function backupAllObjects({ sourceBucket, backupBucket, prefix }: {
  sourceBucket: R2Bucket;
  backupBucket: R2Bucket;
  prefix: string;
}): Promise<{ copied: number; skipped: number }> {
  let cursor: string | undefined;
  let copied = 0;
  let skipped = 0;

  do {
    const listed = await sourceBucket.list({ cursor, limit: LIST_PAGE_SIZE });

    for (const { key } of listed.objects) {
      const wasCopied = await copyObject({ key, sourceBucket, backupBucket, prefix });

      if (wasCopied) {
        copied++;
      } else {
        skipped++;
      }
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  return { copied, skipped };
}

function getBackupPrefix(): string {
  const date = new Date().toISOString().split('T')[0];
  return `backups/${date}/`;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const prefix = getBackupPrefix();

    const backupPromise = backupAllObjects({
      sourceBucket: env.SOURCE_BUCKET,
      backupBucket: env.BACKUP_BUCKET,
      prefix,
    }).then(({ copied, skipped }) => {
      console.log(`Backup complete: ${copied} objects copied, ${skipped} skipped → ${prefix}`);
    });

    ctx.waitUntil(backupPromise);
    await backupPromise;
  },
} satisfies ExportedHandler<Env>;
