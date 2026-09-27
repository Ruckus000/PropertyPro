#!/usr/bin/env bash
# Supabase local-stack images for CI: list them, mirror them to GHCR, pre-pull them.
#
#   supabase-images.sh list    <cli-version>
#   supabase-images.sh mirror  <cli-version> <dest-prefix>     # e.g. ghcr.io/ruckus000/supabase
#   supabase-images.sh prepull <cli-version> <mirror-prefix>
#
# WHY. `supabase start` (e2e.yml, stripe-e2e.yml) pulls ~12 images anonymously
# from public.ecr.aws/supabase. Anonymous quota is per source IP and GitHub
# runners share IPs; the e2e run on main @ 8a4d374e logged
# `toomanyrequests: Rate exceeded` on the postgres image and survived only on
# the CLI's retries. The Postgres service container had the same failure mode
# (see ci-image-mirror.yml).
#
# HOW. The CLI resolves an image by first INSPECTING the local Docker cache
# under each candidate name (public.ecr.aws/supabase/<name>, then
# ghcr.io/supabase/<name>, then Docker Hub) and only pulls when none is cached
# (internal/utils/docker.go, DockerResolveImageIfNotCached, CLI v2.116.0). So
# `prepull` fetches each image AUTHENTICATED from our GHCR mirror and tags it
# with the public.ecr.aws name the CLI looks for first. The CLI then finds every
# image cached and pulls nothing.
#
# Deliberately NOT `SUPABASE_INTERNAL_IMAGE_REGISTRY`: setting it makes the CLI
# try ONLY that registry, so one image missing from the mirror (e.g. a CLI bump
# whose mirror run has not finished) would fail `supabase start` outright. With
# the pre-pull, a gap degrades to exactly today's behaviour — the CLI pulls
# that one image itself, with its normal fallback chain — plus a ::warning::.
#
# THE LIST comes from the CLI's own Dockerfile at the pinned release tag — the
# file the CLI embeds and parses for its image versions — not from a list kept
# here, which would rot on the first CLI bump. Every FROM above the "JobImages"
# marker is a service image; the ones below (migra, pg_prove, schema-diff) are
# only used by `supabase db` subcommands, which CI does not run.
#
# Exit codes (list/mirror): 0 ok · 1 a mirror copy failed or did not verify ·
# 2 could not determine the image list. `prepull` always exits 0: it is an
# optimisation with a working fallback, and must never make e2e worse.

set -euo pipefail

# The name the CLI inspects its cache for first; `prepull` tags under it.
CLI_CACHE_PREFIX=public.ecr.aws/supabase
# Where `mirror` copies FROM, in order. Supabase publishes the same images to
# both (the CLI treats them as interchangeable fallbacks). ghcr.io/supabase is
# first because the mirror job's `skopeo login ghcr.io` authenticates it: the
# first mirror run found public.ecr.aws returning `toomanyrequests: Data limit
# exceeded` for all 14 images, each burning ~2.5 min of retries first.
MIRROR_UPSTREAMS="ghcr.io/supabase public.ecr.aws/supabase"

list_images() {
  local version="$1" dockerfile="" path
  if ! printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "supabase-images: bad CLI version '${version}'" >&2
    return 2
  fi
  # The Go CLI moved into apps/cli-go when the repo became a monorepo; older
  # tags keep it at the root.
  for path in apps/cli-go/pkg/config/templates/Dockerfile pkg/config/templates/Dockerfile; do
    # Bounded: a stalled fetch must not hang the e2e job it is meant to help.
    if dockerfile=$(curl -fsSL --connect-timeout 10 --max-time 30 --retry 3 \
        "https://raw.githubusercontent.com/supabase/cli/v${version}/${path}"); then
      break
    fi
    dockerfile=""
  done
  if [ -z "$dockerfile" ]; then
    echo "supabase-images: could not fetch the CLI Dockerfile for v${version}" >&2
    return 2
  fi

  local images
  images=$(printf '%s\n' "$dockerfile" \
    | awk '/JobImages/ { exit } $1 == "FROM" { print $2 }' \
    | awk -F/ '{ print $NF }')

  # Fail closed on anything that does not look like name:tag, and on a list
  # without postgres — both mean the Dockerfile's shape changed under us.
  local n
  n=$(printf '%s\n' "$images" | grep -c . || true)
  if [ "$n" -lt 5 ] \
    || printf '%s\n' "$images" | grep -Evq '^[a-z0-9][a-z0-9._-]*:[A-Za-z0-9._-]+$' \
    || ! printf '%s\n' "$images" | grep -q '^postgres:'; then
    echo "supabase-images: unexpected image list for v${version}:" >&2
    printf '%s\n' "$images" >&2
    return 2
  fi
  printf '%s\n' "$images"
}

raw_digest() {
  echo "sha256:$(skopeo inspect --raw "docker://$1" | sha256sum | cut -d' ' -f1)"
}

mirror_images() {
  local version="$1" dest_prefix="$2" images img src dest failed=0 copied=0 present=0
  images=$(list_images "$version") || return 2
  for img in $images; do
    dest="${dest_prefix}/${img}"
    if skopeo inspect --raw "docker://${dest}" >/dev/null 2>&1; then
      echo "present  ${dest}"
      present=$((present + 1))
      continue
    fi
    src=""
    for upstream in $MIRROR_UPSTREAMS; do
      if skopeo copy --all --preserve-digests --retry-times 3 \
          "docker://${upstream}/${img}" "docker://${dest}"; then
        src="${upstream}/${img}"
        break
      fi
      echo "::warning::copy from ${upstream}/${img} failed; trying the next upstream"
    done
    if [ -z "$src" ]; then
      echo "::error::could not mirror ${img} from any upstream"
      failed=1
      continue
    fi
    # The copy must be byte-identical: compare the index digest we now serve
    # with the one upstream serves under the same tag.
    if [ "$(raw_digest "$dest")" != "$(raw_digest "$src")" ]; then
      echo "::error::${dest} does not match ${src} after copy"
      failed=1
      continue
    fi
    echo "mirrored ${src} -> ${dest}"
    copied=$((copied + 1))
  done
  echo "supabase images for CLI v${version}: ${copied} mirrored, ${present} already present, failed=${failed}"
  return "$failed"
}

prepull_images() {
  local version="$1" mirror_prefix="$2" images img dir total=0 ok=0
  if ! images=$(list_images "$version"); then
    echo "::warning::Could not list the Supabase images for CLI v${version}; supabase start will pull them itself."
    return 0
  fi
  dir=$(mktemp -d)
  # In parallel, like the CLI's own pre-pull: sequential pulls of ~12 images
  # would cost more wall-clock than the problem they solve.
  for img in $images; do
    total=$((total + 1))
    (
      if docker pull --quiet "${mirror_prefix}/${img}" >/dev/null 2>"${dir}/${img}.err" \
        && docker tag "${mirror_prefix}/${img}" "${CLI_CACHE_PREFIX}/${img}"; then
        touch "${dir}/${img}.ok"
      fi
    ) &
  done
  wait
  for img in $images; do
    if [ -e "${dir}/${img}.ok" ]; then
      ok=$((ok + 1))
    else
      echo "::warning::${mirror_prefix}/${img} not served by the mirror ($(tr '\n' ' ' < "${dir}/${img}.err")); supabase start will pull it anonymously."
    fi
  done
  rm -rf "$dir"
  echo "Supabase images pre-pulled from ${mirror_prefix}: ${ok}/${total}"
  return 0
}

cmd="${1:-}"
case "$cmd" in
  list)    [ $# -eq 2 ] || { echo "usage: $0 list <cli-version>" >&2; exit 2; }
           list_images "$2" ;;
  mirror)  [ $# -eq 3 ] || { echo "usage: $0 mirror <cli-version> <dest-prefix>" >&2; exit 2; }
           mirror_images "$2" "$3" ;;
  prepull) [ $# -eq 3 ] || { echo "usage: $0 prepull <cli-version> <mirror-prefix>" >&2; exit 2; }
           prepull_images "$2" "$3" ;;
  *)       echo "usage: $0 {list|mirror|prepull} ..." >&2; exit 2 ;;
esac
