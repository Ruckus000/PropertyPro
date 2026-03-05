#!/usr/bin/env bash
set -euo pipefail

echo "Setting up PropertyPro development environment..."

if [ -f ".env.local" ]; then
  # Create .env.local symlink for apps/web
  if [ ! -L "apps/web/.env.local" ]; then
    ln -s ../../.env.local apps/web/.env.local
    echo "✓ Created symlink: apps/web/.env.local → ../../.env.local"
  else
    echo "✓ Symlink already exists: apps/web/.env.local"
  fi

  # Create .env.local symlink for apps/admin (when it exists)
  if [ -d "apps/admin" ]; then
    if [ ! -L "apps/admin/.env.local" ]; then
      ln -s ../../.env.local apps/admin/.env.local
      echo "✓ Created symlink: apps/admin/.env.local → ../../.env.local"
    else
      echo "✓ Symlink already exists: apps/admin/.env.local"
    fi
  fi
else
  echo "⚠ Warning: .env.local not found in project root"
  echo "  Copy .env.example to .env.local and fill in your values"
fi

echo ""
echo "Setup complete! Run 'pnpm install' then 'pnpm dev' to start."
