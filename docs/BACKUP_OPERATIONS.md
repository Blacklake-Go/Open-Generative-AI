# PostgreSQL backup operations

`npm run backup:db` creates a PostgreSQL custom-format dump under `data/backups/`. The local directory is restricted to the service account (`0700`) and each dump to owner read/write (`0600`). A partial dump is removed when `pg_dump` fails. When the connection URL contains a database password, the backup script strips it from the `pg_dump` argument and parent database URL environment, writes a matching `PGPASSFILE` entry in a private temporary directory (`0700` directory, `0600` file), and removes the directory after the dump attempt.

When `S3_BACKUP_BUCKET` is set, the job uploads the dump with AWS CLI v2, requests server-side encryption (`S3_BACKUP_SSE=aws:kms` by default), then checks the remote object size and encryption metadata with `head-object`. It verifies the returned server-side encryption algorithm and requires a KMS key identifier when KMS encryption was requested. The local dump remains in place if upload or verification fails. Local dumps older than seven days are pruned only after the current backup step succeeds. The uploader receives AWS-related environment variables only; it does not inherit `DATABASE_URL`.

In `NODE_ENV=production`, a missing `S3_BACKUP_BUCKET` is a backup failure after the local dump is created. The job exits unsuccessfully and sends the existing critical operations alert rather than reporting a successful backup without an offsite copy. Outside production, it may create a local-only dump and logs that the remote copy was skipped.

## Runtime configuration

- `S3_BACKUP_BUCKET` — required for production backup success and to enable the remote copy. In nonproduction, leaving it unset creates only a local dump; in production the job fails and alerts.
- `S3_BACKUP_PREFIX` — optional object prefix; defaults to `postgres`.
- `S3_BACKUP_REGION` — optional destination region; otherwise the AWS CLI profile/role configuration supplies it.
- `S3_BACKUP_SSE` — `aws:kms` by default, or `AES256` for a bucket/provider that does not support KMS encryption headers.
- `S3_BACKUP_KMS_KEY_ID` — optional customer managed KMS key; only valid with `aws:kms`.
- `S3_BACKUP_ENDPOINT` — optional HTTPS endpoint for an S3 compatible service. HTTP and URL credentials are rejected.

Install AWS CLI v2 and grant the service identity only the object write and metadata-read permissions required for the configured prefix. With a customer managed KMS key, grant the service identity the corresponding KMS data-key/encryption permissions. Configure bucket versioning, lifecycle retention, access logging, and alert delivery according to the deployment's data-retention policy; this script does not create or change bucket policy.

## Restore verification

`npm run backup:restore:drill` performs an isolated dump/restore exercise and requires an explicit `TEST_DATABASE_URL` whose database name is isolated. It creates and drops a temporary restore database, so do not point it at production. A configured S3 bucket or a successful upload is not restore evidence; the restore drill must pass and its result must be recorded before launch.

This repository change supplies the upload and verification path but does not prove the production bucket, AWS identity, scheduled execution, alert delivery, retention policy, or a restore drill. Keep backup readiness `UNVERIFIED` until those checks run in the deployment environment.
