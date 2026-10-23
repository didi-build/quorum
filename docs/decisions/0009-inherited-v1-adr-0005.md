# 0009. Inherited product decision: routing and coordination (v1 ADR 0005)

- **Status:** accepted (inherited)
- **Date:** 2026-10-23

## Summary

- **Unified chat with no mode selector:** the supervisor classifies each message into intents such as greeting, simple retrieval, strategic session, and Linear read/write stubs.
- **Council:** fixed three-persona fan-out plus a chair synthesis step (v1 used LangGraph; Quorum uses plain parallel async per ADR 0004).
- Streaming status frames precede the final council result; producers must not race the single WebSocket writer.

## History

[domAIn `docs/adr/0005-routing-and-coordination.md`](https://github.com/DiademShoukralla/domAIn/blob/main/docs/adr/0005-routing-and-coordination.md).
