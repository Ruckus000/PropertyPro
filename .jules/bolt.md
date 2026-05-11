# Codebase Learnings (Bolt)

- When optimizing database interactions involving Drizzle ORM, especially moving from singular updates to bulk updates using `inArray`, always ensure the input array has items before executing the query (e.g., `if (ids.length > 0)`). Empty arrays passed to `inArray` can throw an exception and roll back the whole transaction.
- If processing a large batch of items that also requires calling an external API (like Supabase auth administration), chunk the items array to a reasonable size (e.g., 10 or 20 items per chunk) and process them with `Promise.allSettled`. This avoids triggering third-party API rate limits and ensures that individual external API failures do not halt the entire batch.
