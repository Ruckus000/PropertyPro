// Thin wrapper so both apps/web/vitest.config.ts and the repo-root
// vitest.workspace.ts can reference this project by path. Definition lives in
// vitest.shared.ts — edit it there, not here.
import { defineConfig } from 'vitest/config';
import { jsdomProject } from './vitest.shared';

export default defineConfig(jsdomProject);
