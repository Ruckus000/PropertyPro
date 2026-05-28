# Contact Block

## Purpose

The contact block publishes community-level contact information without exposing private board member contact details. It is a system-of-record block: editors configure which sections to show, and the renderer reads the current data at request time.

## Content Schema

`contactBlockSchema` stores configuration only:

```ts
{
  showBoard: boolean; // default true
  showManagement: boolean; // default true
}
```

## Data Sources

- Management contact comes from `communities.contact_name`, `communities.contact_email`, and `communities.contact_phone`.
- Board roster comes from manager `user_roles` rows with `preset_key` of `board_president` or `board_member`, joined to `users.full_name`.
- Board output is limited to name and title. Personal emails and phone numbers are not selected or rendered.

## Rendering Rules

- Render management and board sections only when enabled in content.
- Hide the management section when all community contact fields are empty.
- Use `display_title` when present; otherwise fall back to the board preset label.
- Show an empty state when both enabled sections have no public data.

## Editor Rules

The PM site editor exposes two checkboxes:

- Management contact
- Board roster

Both default to enabled for new blocks.
