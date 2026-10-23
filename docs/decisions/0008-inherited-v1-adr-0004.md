# 0008. Inherited product decision: permissions (v1 ADR 0004)

- **Status:** accepted (inherited)
- **Date:** 2026-10-23

## Summary

- Nullable `user_id` and `project_id` on scoped rows; v1 is single-user and single-project but the model stays.
- **`user_id` comes from auth context only, never from the request body.**
- **Every read and write access check goes through one `can_access()` function** (pure, shared across HTTP and WebSocket).
- No separate Permissions table in v1; Quorum keeps the same approach until scale requires otherwise.

## History

[domAIn `docs/adr/0004-permissions.md`](https://github.com/DiademShoukralla/domAIn/blob/main/docs/adr/0004-permissions.md).
