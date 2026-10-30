#!/usr/bin/env bash
# Copy one postgres:16 image index, by digest, into our GHCR package.
#
#   mirror-postgres-digest.sh <sha256:digest> <dest-repo>   # e.g. ghcr.io/ruckus000/postgres
#
# Shared by ci-image-mirror.yml and postgres-digest-bump.yml, which each carried
# their own copy of this and drifted: the bump job lacked the "already present"
# check, so on 2026-10-19 it re-pulled a digest the 10-12 run had mirrored and
# failed on public.ecr.aws's anonymous quota (`toomanyrequests: Data limit
# exceeded` — per source IP, and GitHub runners share IPs). 10-26 failed the
# same way on a genuinely new digest.
#
# Upstreams are tried in order. Both serve the Docker Hub official image with
# identical bytes (measured 2026-10-30: same index digest, all 16 platform
# manifests served by mirror.gcr.io). Pulling BY DIGEST means an upstream cannot
# substitute content, and the read-back below proves GHCR serves the exact
# pinned bytes whichever one supplied them. mirror.gcr.io goes first for the
# reason supabase-images.sh puts its reliable upstream first: ECR burns ~2 min
# of retries before giving up.
#
# Exit: 0 mirrored or already present, and verified · 1 no upstream worked, or
# the read-back did not match · 2 bad arguments.

set -euo pipefail

# ponytail: both upstreams are anonymous, so a run where both are throttled
# still goes red. Trigger: a red run with both copies failing — then pull ECR
# authenticated (AWS credentials as a repo secret) instead of adding a third.
UPSTREAMS="mirror.gcr.io/library/postgres public.ecr.aws/docker/library/postgres"

digest="${1:-}" dest_repo="${2:-}"
if ! printf '%s' "$digest" | grep -Eq '^sha256:[0-9a-f]{64}$' || [ -z "$dest_repo" ]; then
  echo "usage: mirror-postgres-digest.sh <sha256:digest> <dest-repo>" >&2
  exit 2
fi
hex="${digest#sha256:}"
# A tag per digest keeps every mirrored version tagged (never an orphaned
# untagged version). Consumers pull by digest; the tag is bookkeeping.
dest="${dest_repo}:16-${hex:0:12}"

if skopeo inspect --raw "docker://${dest_repo}@${digest}" >/dev/null 2>&1; then
  echo "Already mirrored: ${dest_repo}@${digest}"
else
  copied=""
  for upstream in $UPSTREAMS; do
    if skopeo copy --all --preserve-digests --retry-times 3 \
        "docker://${upstream}@${digest}" "docker://${dest}"; then
      copied="$upstream"
      break
    fi
    echo "::warning::copy from ${upstream} failed; trying the next upstream"
  done
  if [ -z "$copied" ]; then
    echo "::error::could not mirror ${digest} from any upstream (${UPSTREAMS})"
    exit 1
  fi
  echo "Copied ${copied}@${digest} -> ${dest}"
fi

# Fail closed: a copy that re-wrote the index would change its digest, and
# every consumer's pull-by-digest would fail — including the deploy gate.
got="sha256:$(skopeo inspect --raw "docker://${dest_repo}@${digest}" | sha256sum | cut -d' ' -f1)"
if [ "$got" != "$digest" ]; then
  echo "::error::GHCR returned ${got} for ${digest}"
  exit 1
fi
echo "Verified: ${dest_repo}@${digest}"
