# FlyBudget-fork deployment (Portainer)

The source code is at `aimedtoannoy/FlyBudget-fork`. The forked image is built
only when the main-branch CI passes, and is published as
`ghcr.io/aimedtoannoy/flybudget:latest` plus an immutable `sha-<full SHA>` tag.

## Before switching from upstream

1. Verify the actual current Portainer volume bind mounts. Do **not** replace
   the current `/data` volume with an empty directory, or the app will look
   like a fresh install.
2. Back up your existing SQLite database using FlyBudget's backup command
   `docker exec flybudget node backup.cjs`. Copy the produced backup file to
   secure storage off this container host. Keep a separate encrypted backup
   of the `FLYBUDGET_DATA_KEY_FILE` key. Never commit real bank data or key.
3. Verify the Docker image package is published and accessible to Portainer.
   GitHub Packages may require registry authentication depending on visibility.
4. Update only the application image reference in your existing Portainer
   stack, preserving your **actual** storage mounts, secret, port mapping,
   network and environment settings. The example compose file in this folder
   is a template, not a command to overwrite your current stack.
5. Deploy through Portainer, confirm the migrations complete, authenticate,
   and sync the bank. Verify an authorization appears as Pending and later
   posts once, preserving its category and notes.
6. Keep the old upstream image tag available for rollback, but remember that
   code rollback after a database migration should be tested first against a
   restored copy of the backup. Do not casually downgrade a migrated database.

No SSH changes or server actions are performed by GitHub Actions. No GitHub
workflow receives Plaid access tokens, production keys or bank data.
