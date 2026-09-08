export { Box } from "./Box";
export type { BoxProps } from "./Box";

export { Stack, HStack, VStack, Center, Spacer } from "./Stack";
export type { StackProps } from "./Stack";

// `Label` renamed to `TextLabel` here to avoid colliding with the shadcn form
// `Label` lifted into `./components/ui/label.tsx` — this typography variant
// has no consumers today (grep confirmed), so the rename is a zero-blast-radius
// resolution; `Text.tsx` itself and its direct-import test are untouched.
export { Text, Heading, Label as TextLabel, Caption, Code, Paragraph } from "./Text";
export type { TextProps } from "./Text";
