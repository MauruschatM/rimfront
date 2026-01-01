## 2024-05-23 - Consolidate expensive render loops
**Learning:** In a high-frequency render loop with large datasets (10k+ entities), multiple components iterating over the same dataset separately (O(K*N)) can cause significant main thread blocking.
**Action:** Consolidate data processing into a single `useMemo` in the parent component and pass derived data structures (Maps, filtered arrays, stats objects) to children. This reduces complexity to O(N) and ensures consistency across components.
