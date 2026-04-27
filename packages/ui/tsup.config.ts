import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/tokens/index.ts",
    "src/primitives/index.ts",
    "src/components/index.ts",
    "src/editor/index.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "@tiptap/core",
    "@tiptap/pm",
    "@tiptap/pm/state",
    "@tiptap/pm/view",
    "@tiptap/pm/model",
    "@tiptap/react",
    "@tiptap/starter-kit",
    "@tiptap/extension-image",
    "@tiptap/extension-link",
    "@tiptap/extension-table",
    "@tiptap/extension-table-cell",
    "@tiptap/extension-table-header",
    "@tiptap/extension-table-row",
    "@tiptap/extension-text-align",
    "@tiptap/extension-underline",
  ],
  loader: {
    ".css": "copy",
  },
});
