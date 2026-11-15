# Docker images and build cache

A Docker CLI without a reachable engine is blocked, not proof that no Docker data exists.
Use `docker system df` to measure. Image virtual sizes share layers, so compare filesystem free
space after cleanup rather than adding image sizes.

Preview `dev-tidy --skip-git --skip-turbo --skip-wp-env --kept` for images and build cache only.
This works without project roots. Repeat the same flags with --yes after authorization.
Running and stopped containers protect referenced images. The newest generic runtime tags stay.
Normal cleanup removes unused wp-env build tags and superseded runtime versions.

When the capability inventory detects WordPress data, read [WordPress](wordpress.md).
A missing wp-env directory does not prove that orphan containers or images are absent.
Only the script touches Docker containers and volumes. Preserve unrelated local databases.
Read [the command reference](../dev-tidy.md) for scheduling. Scheduling never enables purge.
