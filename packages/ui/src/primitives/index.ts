export { Box } from "./Box";
export type { BoxProps } from "./Box";

export { Stack, HStack, VStack, Center, Spacer } from "./Stack";
export type { StackProps } from "./Stack";

// `Label` renamed to `UiLabel` here to avoid colliding with the shadcn form
// `Label` lifted into `./components/ui/label.tsx` — this is the repo's
// existing convention for the same collision (see `.design-sync/entry/index.ts`
// and `.design-sync/conventions.md`, which already document `UiLabel` as the
// typography primitive vs. `Label` as the form control). This typography
// variant has no consumers today (grep confirmed), so the rename is a
// zero-blast-radius resolution; `Text.tsx` itself and its direct-import test
// are untouched.
export { Text, Heading, Label as UiLabel, Caption, Code, Paragraph } from "./Text";
export type { TextProps } from "./Text";
