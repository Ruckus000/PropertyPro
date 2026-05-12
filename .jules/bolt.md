## Performance Optimizations - UNION ALL vs Concurrent Promises

- **Context**: In `pm-portfolio.ts`, metrics aggregations (residents, units, maintenance, compliance, and optionally occupied leases) were previously fetched concurrently using `Promise.all` calling `db.select()` 4-5 times.
- **Optimization**: To reduce application-to-database roundtrips, connection overhead, and context switching, these queries have been consolidated into a single roundtrip using `unionAll`.
- **Implementation details**:
    - Used Drizzle ORM's `unionAll` from `drizzle-orm/pg-core`.
    - Added a discriminator `metric: sql<string>\`'some_metric'\`` to each query branch.
    - Parsed the unified result set back into their respective specific raw arrays (`residentCountsRaw`, `unitCountsRaw`, etc) on the application side.
    - Because the Drizzle type definitions for `unionAll` struggle with dynamic `reduce` building, a type assertion was added: `as Array<{ communityId: number; metric: string; count: number }>`.
- **Caveats & Trade-offs**: While this reduces the network chat, it offloads concurrency from Node (`Promise.all`) to the PostgreSQL query planner. In a real-world high-traffic scenario, this large UNION query might be more complex for the DB to parallelize. Production-like benchmarking is still recommended to verify the true impact of this change under load.
