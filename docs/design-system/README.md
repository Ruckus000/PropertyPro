# PropertyPro Design System

A comprehensive, token-based design system for Florida condominium compliance software.

## Research Foundation

This design system was built based on extensive research from:

### Component Architecture
- [Radix UI Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction) - Headless component architecture
- [Compound Component Pattern](https://www.patterns.dev/react/compound-pattern/) - Flexible composition APIs
- [React Slots Pattern](https://dev.to/talissoncosta/slot-based-apis-in-react-designing-flexible-and-composable-components-7pj) - Slot-based component design

### Token Systems
- [Tokens in Design Systems (EightShapes)](https://medium.com/eightshapes-llc/tokens-in-design-systems-25dd82d58421) - Three-tier token architecture
- [Naming Tokens (EightShapes)](https://medium.com/eightshapes-llc/naming-tokens-in-design-systems-9e86c7444676) - Token naming conventions
- [Atlassian Color System](https://atlassian.design/foundations/color/) - Semantic color architecture

### Design Methodology
- [Atomic Design (Brad Frost)](https://atomicdesign.bradfrost.com/chapter-2/) - Component hierarchy
- [Typography in Design Systems](https://medium.com/eightshapes-llc/typography-in-design-systems-6ed771432f1e) - Typography scale design
- [Spacing, Grids, and Layouts](https://www.designsystems.com/space-grids-and-layouts/) - 8pt grid system

### File Organization
- [React Folder Structures (Robin Wieruch)](https://www.robinwieruch.de/react-folder-structure/) - Feature-based organization
- [Delightful File Structure (Josh Comeau)](https://www.joshwcomeau.com/react/file-structure/) - Colocation principles

---

## Architecture

```
propertypro-design-system/
├── tokens/              # Design tokens
│   └── index.ts         # Colors, spacing, typography, motion
├── primitives/          # Low-level building blocks
│   ├── Box.tsx          # Container primitive
│   ├── Stack.tsx        # Flex layout primitive
│   ├── Text.tsx         # Typography primitive
│   └── index.ts
├── components/          # Interactive UI elements
│   ├── Button/
│   │   └── Button.tsx   # Compound button component
│   ├── Badge/
│   │   └── Badge.tsx    # Status badges
│   ├── Card/
│   │   └── Card.tsx     # Card containers
│   └── index.ts
├── patterns/            # Higher-level UI patterns
│   ├── DataRow.tsx      # Table-like rows
│   ├── SectionHeader.tsx
│   ├── AlertBanner.tsx
│   ├── EmptyState.tsx
│   └── index.ts
├── hooks/               # Shared React hooks
├── utils/               # Helper functions
└── index.ts             # Main export
```

---

## Token System

### Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  PRIMITIVE TOKENS (What exists)                                  │
│  Reference values only - NEVER use directly in components        │
│  e.g., primitiveColors.blue[500], primitiveSpace[4]             │
├─────────────────────────────────────────────────────────────────┤
│  SEMANTIC TOKENS (How to use)                                    │
│  Purpose-driven - USE these in components                        │
│  e.g., semanticColors.text.primary, semanticSpacing.stack.md    │
├─────────────────────────────────────────────────────────────────┤
│  COMPONENT TOKENS (Where to use)                                 │
│  Component-specific - USE for specific components                │
│  e.g., componentTokens.button.height.md                         │
└─────────────────────────────────────────────────────────────────┘
```

### Example Usage

```tsx
// ❌ Wrong - Using primitive directly
<div style={{ color: primitiveColors.gray[900] }}>

// ✅ Correct - Using semantic token
<div style={{ color: semanticColors.text.primary }}>

// ✅ Correct - Using Text component (recommended)
<Text color="primary">Hello</Text>
```

### Color Tokens

| Category | Purpose | Example |
|----------|---------|---------|
| `text.*` | Text colors | `text.primary`, `text.secondary`, `text.tertiary` |
| `surface.*` | Backgrounds | `surface.page`, `surface.default`, `surface.muted` |
| `border.*` | Borders | `border.default`, `border.subtle`, `border.focus` |
| `interactive.*` | Interactive elements | `interactive.default`, `interactive.hover` |
| `status.*` | Status indicators | `status.success`, `status.warning`, `status.danger` |

### Spacing Tokens

Based on 8pt grid with 4pt half-step:

| Token | Value | Use Case |
|-------|-------|----------|
| `space[1]` | 4px | Icon padding, tight gaps |
| `space[2]` | 8px | Inline spacing, small gaps |
| `space[3]` | 12px | Compact spacing |
| `space[4]` | 16px | Default component padding |
| `space[6]` | 24px | Section gaps |
| `space[8]` | 32px | Major sections |

### Typography Scale

Modular scale (~1.2 ratio) with base 15px:

| Variant | Size | Weight | Use Case |
|---------|------|--------|----------|
| `display` | 28px | Bold | Hero text, large metrics |
| `heading1` | 22px | Semibold | Page titles |
| `heading2` | 18px | Semibold | Section titles |
| `heading3` | 15px | Semibold | Card titles |
| `body` | 15px | Normal | Default text |
| `bodySm` | 13px | Normal | Secondary text |
| `caption` | 11px | Medium | Labels, metadata |
| `mono` | 11px | Normal | Code, IDs |

---

## Component Patterns

### Compound Components

Components use the compound component pattern for flexible composition:

```tsx
// Simple usage
<Button variant="primary">Click me</Button>

// Compound usage with icon
<Button variant="secondary">
  <Button.Icon><PlusIcon /></Button.Icon>
  <Button.Label>Add Item</Button.Label>
</Button>

// Card with structure
<Card>
  <Card.Header bordered>
    <Card.Title>Compliance Status</Card.Title>
    <Card.Actions>
      <Button variant="ghost" size="sm">Export</Button>
    </Card.Actions>
  </Card.Header>
  <Card.Body>
    Content here
  </Card.Body>
  <Card.Footer>
    <Button>Save Changes</Button>
  </Card.Footer>
</Card>
```

### Polymorphic Components

Primitives accept an `as` prop for semantic HTML:

```tsx
<Text variant="heading2" as="h1">
  This renders as an h1 tag
</Text>

<Stack as="ul" gap="sm">
  <Box as="li">Item 1</Box>
  <Box as="li">Item 2</Box>
</Stack>
```

### Status Indicators (Accessibility)

All status indicators include icon + color + text for accessibility:

```tsx
// ✅ Accessible - includes icon, color, and label
<StatusBadge status="compliant" />
// Renders: [✓ icon] + green background + "Compliant" text

// Can hide parts if needed, but aria-label is preserved
<StatusBadge status="overdue" showLabel={false} />
// Still accessible via aria-label
```

---

## Quick Reference

### Primitives

| Component | Purpose | Example |
|-----------|---------|---------|
| `Box` | Container with token-based styling | `<Box padding="md" background="surface">` |
| `Stack` | Flex layout | `<Stack direction="row" gap="md">` |
| `HStack` | Horizontal stack | `<HStack gap="sm">` |
| `VStack` | Vertical stack | `<VStack gap="lg">` |
| `Text` | Typography | `<Text variant="heading2" color="primary">` |
| `Heading` | Semantic heading | `<Heading level={2}>Title</Heading>` |

### Components

| Component | Purpose | Variants |
|-----------|---------|----------|
| `Button` | Interactive button | primary, secondary, ghost, danger, link |
| `Badge` | Status indicator | success, warning, danger, info, neutral |
| `StatusBadge` | Pre-configured status | compliant, pending, overdue, etc. |
| `Card` | Content container | elevated, status, interactive |
| `MetricCard` | KPI display | With value, label, change indicator |

### Patterns

| Pattern | Purpose |
|---------|---------|
| `DataRow` | Table-like row with grid columns |
| `SectionHeader` | Section title with subtitle and actions |
| `AlertBanner` | Contextual alert messages |
| `EmptyState` | Placeholder for empty content |

---

## Migration from Original Code

### Before (flat tokens)
```javascript
const T = {
  rail: "#16181D",
  text: "#111827",
  success: "#059669",
  // ... 30+ flat values
}
```

### After (hierarchical tokens)
```typescript
const semanticColors = {
  text: {
    primary: primitiveColors.gray[900],
    secondary: primitiveColors.gray[600],
    // ...
  },
  status: {
    success: {
      foreground: primitiveColors.green[700],
      background: primitiveColors.green[50],
      // ...
    }
  }
}
```

### Before (inline components)
```jsx
<span style={{
  display: "inline-flex",
  fontSize: 11,
  fontWeight: 600,
  color: "#059669",
  background: "#ECFDF5",
  padding: "3px 10px",
  borderRadius: 20,
}}>
  Compliant
</span>
```

### After (design system components)
```jsx
<StatusBadge status="compliant" />
```

---

## Best Practices

### 1. Use Semantic Tokens

```tsx
// ❌ Avoid
<div style={{ color: '#111827' }}>

// ✅ Prefer
<Text color="primary">
```

### 2. Use Spacing Tokens

```tsx
// ❌ Avoid
<div style={{ padding: '11px 16px' }}>

// ✅ Prefer
<Box padding="md">
```

### 3. Compose with Primitives

```tsx
// ❌ Avoid
<div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>

// ✅ Prefer
<Stack direction="row" gap="md" align="center">
```

### 4. Use Compound Components

```tsx
// ❌ Avoid prop soup
<Card
  title="Title"
  subtitle="Subtitle"
  headerActions={[<Button />]}
  footerActions={[<Button />]}
>

// ✅ Prefer composition
<Card>
  <Card.Header>
    <Card.Title>Title</Card.Title>
    <Card.Actions><Button /></Card.Actions>
  </Card.Header>
  <Card.Body>...</Card.Body>
</Card>
```

### 5. Accessibility First

```tsx
// ❌ Avoid color-only indicators
<span style={{ color: 'red' }}>Error</span>

// ✅ Include icon + color + text
<StatusBadge status="danger" />
```

---

## Contributing

When adding new components:

1. **Follow the hierarchy**: tokens → primitives → components → patterns
2. **Use semantic tokens**: Never reference primitive tokens directly in components
3. **Support composition**: Prefer compound components over configuration props
4. **Include accessibility**: ARIA labels, keyboard navigation, focus states
5. **Document usage**: Add JSDoc comments and update this README
