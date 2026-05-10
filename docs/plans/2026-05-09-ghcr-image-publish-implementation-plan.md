# GHCR Image Publish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish a production Docker image for Mediavault to GitHub Container Registry on trusted `main` pushes, without adding server auto-deployment.

**Architecture:** Keep the first implementation close to common OSS practice. Existing CI validates the commit, one Docker image job builds the production image, and only trusted `main` pushes publish to GHCR. Operators remain responsible for pulling and running the image on their own servers.

**Canonical image:** `ghcr.io/nbsp1221/mediavault`

---

## 1. Decision Summary

This repository should own Docker image publication, not live server rollout.

The CI/CD boundary is:

- CI validates the commit.
- CI publishes a production Docker image to GHCR only for trusted `main` pushes.
- Operators decide when and where to run the published image.

Do not add SSH deployment, remote Docker socket access, server secrets, reverse proxy provisioning, firewall changes, certificate automation, or automatic `docker compose up` against a real host in this phase.

This first implementation intentionally avoids release-tag publishing. Release tags are useful, but they introduce extra policy decisions around SemVer, prereleases, `v0`, moving major tags, and protected tags. Add them later after `main` image publishing is working.

## 2. Evidence And Complexity Review

Official references for the implementation:

- GitHub Actions package publishing guide:
  - https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images
- GitHub Container Registry guide:
  - https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- Docker GitHub Actions guide:
  - https://docs.docker.com/build/ci/github-actions/
- Docker metadata action:
  - https://github.com/docker/metadata-action
- Docker build-push action:
  - https://github.com/docker/build-push-action

Real-world comparison was performed against public OSS repositories cloned under `/tmp`,
including Immich, Paperless-ngx, Memos, Gitea, Open WebUI, Outline, Appwrite, Mastodon,
Miniflux, Stirling PDF, Reactive Resume, Uptime Kuma, Coolify, Authentik, Authelia,
Grafana, Sentry, Jellyfin, Nextcloud Docker, Photoprism, Portainer, ToolJet, Netdata,
Traefik, n8n, Appsmith, Plane, and others.

Observed pattern summary:

- `docker/metadata-action` plus `docker/build-push-action` is mainstream.
- `flavor: latest=false` plus explicit `latest` rules is mainstream enough.
- `type=ref,event=branch` and `type=ref,event=pr` are the conventional
  metadata-action rules for branch and pull request tags.
- PR build-only with `push: false` is common.
- Passing `steps.meta.outputs.tags` directly to `build-push-action` is common.
- Published-image Compose files are common for self-hosted projects, but changing this
  repository's checked-in Compose file also triggers repo-local verification contracts.
- Exact metadata tag allowlist checks with `mktemp` and `diff -u` were not observed in the sampled projects.
- Tag ancestry checks with `git merge-base --is-ancestor` were not observed as a common Docker publishing gate.
- Special `v0` major-tag suppression is logically defensible, but uncommon as first-implementation workflow logic.
- A separate source-build Compose file used only to verify Dockerfile behavior is not a mainstream first implementation pattern.
- Changing Compose and then skipping the repository's existing Compose smoke contract
  would be internally inconsistent. Therefore this first implementation does not change
  Compose at all.

Complexity rule for this plan:

- Prefer official Docker/GitHub action behavior over custom shell policy.
- Avoid workflow logic that reimplements `docker/metadata-action`.
- Avoid repo-local Docker Compose verification contracts unless they match a clearly common pattern.
- Treat release-tag policy, ancestry checks, metadata allowlist diffing, Compose migration,
  and Docker Compose source-build verification as follow-up work, not first implementation.

## 3. Current Repository Context

Relevant current files:

- `.github/workflows/ci.yml`
  - Runs `typecheck`, `lint`, `test`, `e2e-smoke`, and `build` on `main` pushes and PRs.
- `Dockerfile`
  - Defines a `production` target based on `oven/bun:1.3.5`.
  - Builds app assets and downloads FFmpeg/Shaka Packager during the image build.
- `package.json`
  - Package name is `mediavault`.
  - Contains the authoritative verification scripts.
- `README.md`
  - Documents Docker deployment, but currently mixes local build Compose with `docker-compose pull` update guidance.
- `.github/workflows/docker-compose-smoke.yml`
  - Existing path-scoped Docker Compose smoke workflow.
  - This first implementation does not change Compose, so this workflow should not need refactoring.

## 4. Scope

### In Scope

- Add one Docker image job to `.github/workflows/ci.yml`.
- Build the production Docker image for PRs without publishing.
- Publish the production Docker image to GHCR on trusted `main` pushes.
- Publish only these `main` tags in the first implementation:
  - `latest`
  - `main`
  - `sha-<short-sha>`
- Use `docker/metadata-action` for tags and OCI labels.
- Use `docker/build-push-action` with the `production` Dockerfile target.
- Use `GITHUB_TOKEN` for GHCR publishing.
- Keep server rollout as operator-owned.
- Update README Docker docs to describe GHCR image publication and direct image pull/run guidance without changing the checked-in Compose file.

### Non-Scope

- No automatic deployment to a real server.
- No release-tag image publishing.
- No SemVer tag policy.
- No strict SemVer regex in GitHub Actions.
- No tag ancestry checks.
- No metadata output allowlist diff.
- No special `v0` tag handling.
- No multi-architecture build.
- No Docker Hub or Quay publication.
- No GitHub Release creation.
- No default `compose.yaml` rename.
- No `docker-compose.yaml` migration.
- No separate source-build Compose file.
- No Docker Compose source-build verification contract.
- No Docker Compose smoke refactor in this first implementation.
- No manual `workflow_dispatch` image build path.
- No Buildx provenance or SBOM attachment in the first implementation.
- No change to the local repository folder name.

## 5. Publishing Policy

### Events

The workflow should respond to:

- `push` to `main`
- `pull_request` targeting `main`

Do not add tag triggers in this first implementation.

### Behavior

- On `pull_request`:
  - Build the image.
  - Do not push.
  - This verifies Dockerfile/build correctness without publishing PR artifacts.
- On `push` to `main`:
  - Build and push to GHCR.
  - Publish `latest`, `main`, and `sha-<short-sha>`.

### Tags

Configure `docker/metadata-action` with conventional ref tag rules. Use `latest=false`,
then explicitly enable `latest` only for the `main` branch.

Required `main` tags:

```text
ghcr.io/nbsp1221/mediavault:latest
ghcr.io/nbsp1221/mediavault:main
ghcr.io/nbsp1221/mediavault:sha-<short-sha>
```

Do not publish release tags until a separate release policy is agreed and implemented.

## 6. Implementation Tasks

### Task 1: Add Docker Image Job To CI

**Files:**

- Modify: `.github/workflows/ci.yml`

**Step 1: Keep triggers simple**

Use:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

**Step 2: Keep top-level permissions read-only**

Use:

```yaml
permissions:
  contents: read
```

**Step 3: Add one Docker image job**

Add one job after the existing verification jobs:

```yaml
  docker-image:
    runs-on: ubuntu-latest
    needs: [typecheck, lint, test, e2e-smoke, build]
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout code
        uses: actions/checkout@v6.0.2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4

      - name: Log in to GitHub Container Registry
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract Docker metadata
        id: meta
        uses: docker/metadata-action@v6
        with:
          images: ghcr.io/nbsp1221/mediavault
          flavor: |
            latest=false
          tags: |
            type=raw,value=latest,enable=${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix=sha-,format=short,enable=${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}

      - name: Build Docker image
        uses: docker/build-push-action@v7
        with:
          context: .
          file: ./Dockerfile
          target: production
          push: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: false
```

This keeps the first workflow close to the official Docker example: one metadata step, one
build step, and push controlled by the trusted event condition.

**Step 4: Do not add custom tag validation**

Do not add a `Verify Docker metadata tags` shell step in this first implementation.
The sampled OSS projects generally pass metadata-action tags directly into build-push-action.

**Step 5: Run syntax-oriented local checks**

Run:

```bash
git diff --check
```

If `actionlint` is installed locally, run:

```bash
actionlint .github/workflows/ci.yml
```

If `actionlint` is not installed, note that GitHub Actions syntax will be verified by the
first workflow run.

### Task 2: Update README Docker Image Docs

**Files:**

- Modify: `README.md`

**Step 1: Document the published image**

Include:

```bash
docker pull ghcr.io/nbsp1221/mediavault:latest
```

State that the image is published by CI after verified `main` pushes.

**Step 2: Avoid misleading Compose instructions**

Do not document `docker compose pull` as the primary update path while the checked-in
`docker-compose.yaml` still uses a local `build:` block.

Do not change `docker-compose.yaml` in this implementation. A future Compose migration can
make the default Compose file image-based and update README commands at the same time.

**Step 3: Document operator responsibility**

State:

```text
Mediavault publishes production images to GHCR. Pulling and restarting the service on a host is an operator-owned deployment step.
```

**Step 4: Preserve HTTPS warning**

Keep the existing warning that remote browser use requires HTTPS reverse proxy or equivalent
TLS termination.

**Step 5: Keep source-build Compose docs separate**

If README keeps local Docker Compose instructions, label them clearly as source-build/local
operation. Do not present them as the GHCR image update path.

### Task 3: Local Verification Before Handoff

Run:

```bash
git diff --check
bun run verify:base
```

Expected:

- `git diff --check`: exit 0
- `bun run verify:base`: exit 0

Do not run or modify Docker Compose smoke for this implementation because Compose files are
not in scope.

### Task 4: Post-Merge Verification

After the implementation commit is pushed to `main`, verify GitHub Actions:

```bash
gh run list --branch main --limit 10
gh run watch <run-id>
```

Expected:

- `CI` succeeds.
- `docker-image` succeeds.

Then verify package publication:

```bash
gh api /users/nbsp1221/packages/container/mediavault
```

Expected:

- GHCR package exists.
- Package name is `mediavault`.

If the package already exists but is not connected to this repository, the first publish
can fail until the package permissions are adjusted in GitHub Packages. Treat that as a
repository/package permission issue, not a workflow design failure.

Optionally verify pull:

```bash
docker pull ghcr.io/nbsp1221/mediavault:latest
docker image inspect ghcr.io/nbsp1221/mediavault:latest
```

Expected:

- Pull succeeds if package visibility and authentication allow it.
- Image labels include source and revision metadata.

## 7. Rollback Plan

If image publishing breaks CI:

1. Revert the CI workflow change.
2. Delete incorrect GHCR tags from GitHub Packages if necessary.
3. Re-run CI without publish changes.

## 8. Deferred Hardening

Consider these only after the first GHCR image publish works:

- Release-tag publishing.
- Stable SemVer tag policy.
- Protected tag rules for release tags.
- Multi-architecture images.
- Full-length SHA pinning for all workflow actions.
- Buildx provenance and SBOM attachment.
- Separate GitHub artifact attestations with `actions/attest`.
- Published-image smoke tests that pull from GHCR.
- Migration of `docker-compose.yaml` to consume the published GHCR image.
- A separate development or test Compose file, only if there is a concrete mainstream use case.

## 9. Final Acceptance Checklist

- [ ] `.github/workflows/ci.yml` has one `docker-image` job.
- [ ] `docker-image` depends on `typecheck`, `lint`, `test`, `e2e-smoke`, and `build`.
- [ ] PRs build the production Docker image but do not push it.
- [ ] No manual `workflow_dispatch` image build path is added.
- [ ] Trusted `main` pushes publish to `ghcr.io/nbsp1221/mediavault`.
- [ ] Trusted `main` pushes publish `latest`, `main`, and `sha-<short-sha>`.
- [ ] No release-tag publish behavior is added.
- [ ] No metadata allowlist diff step is added.
- [ ] No tag ancestry check is added.
- [ ] Workflow-level permissions are `contents: read`.
- [ ] Package write permission is scoped to the `docker-image` job.
- [ ] No Buildx provenance or SBOM attachment is added.
- [ ] `docker-compose.yaml` is not changed.
- [ ] No source-build Compose file is added.
- [ ] No Docker Compose source-build verification contract is added.
- [ ] README explains GHCR image publication without presenting the current source-build Compose file as the GHCR update path.
- [ ] README keeps server rollout as operator-owned.
- [ ] README does not imply plain remote HTTP is production-complete.
- [ ] `git diff --check` passes.
- [ ] `bun run verify:base` passes.
- [ ] GitHub Actions publish run succeeds after merge.
- [ ] GHCR package exists as `mediavault`.
