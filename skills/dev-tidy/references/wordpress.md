# WordPress wp-env

WordPress is optional. Its runtime directory and Docker metadata identify stacks; the npm
wp-env command need not be installed. Existing checkout paths preserve data in normal cleanup.
Docker images and build cache are covered by [Docker](docker.md).

To reduce memory without deleting databases or uploads, preview
`dev-tidy --stop-wp-env --skip-git --skip-turbo --skip-docker --kept`.
Stop mode requires project roots for bind ownership; use --root for projects elsewhere.
It checks every bind mount, activity, open runs and --keep again before each stop. Runtime
WordPress/PHPUnit Git clones are not source project roots. Orphan stacks stay in stop mode.

Only when the user explicitly discards all wp-env local data, preview the standalone
`dev-tidy --purge-wp-env`, then add --yes. It discards databases and uploads in retained and
orphan stacks, even without surviving compose files. Resources shared with unrelated containers
stay. Explicit foreign labels and compose locations override matching names.

A private engine-bound journal preserves ownership across partial failure. Retry against the
same engine. After an intentional engine replacement, remove the old journal before previewing
again. Never schedule purge. Read [the command reference](../dev-tidy.md) for exact mode conflicts.
