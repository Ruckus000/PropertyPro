## 2024-05-11 - MonthGrid O(N*M) Rendering Optimization
**Learning:** Found an O(N*M) filtering bottleneck in the `MonthGrid` component where an array of events was filtered on every render inside a loop iterating over 35-42 days.
**Action:** Replaced the O(N*M) filter with a `useMemo` hash map lookup that runs in O(N+M) time. This pattern should be applied to any calendar grid or list components handling large sets of grouped items.
