# Fix Gemini model resolution in `ai-chat`

## Confirmed diagnosis

- `ai-chat` currently hardcodes `GEMINI_MODEL = "gemini-1.5-flash"` and constructs the request as `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`.
- The resulting path contains exactly one `models/` segment; duplicated path construction is not the cause.
- Production logs show Google returning `404 NOT_FOUND` for `models/gemini-1.5-flash` on August 31, 2026.
- The current unit tests cover pharmacy RBAC context only, so they pass without exercising model resolution or the Gemini HTTP request.
- Google’s current documentation marks Gemini 2.0 Flash as shut down as of June 1, 2026, so changing blindly from 1.5 to 2.0 would retain the outage.

## Implementation

1. Extract Gemini endpoint construction into a small, testable helper that normalizes either `gemini-*` or `models/gemini-*` to one canonical model name and guarantees exactly one `/models/` path segment.
2. Resolve the model against Google AI Studio’s authenticated `v1beta/models` catalog and require `generateContent` support. Prefer a configured `GEMINI_MODEL` when valid; otherwise select a current Flash multimodal model from an explicit supported preference order.
3. Keep Google AI Studio authentication via `x-goog-api-key` and `?key=...`; do not restore the OAuth Bearer header or switch to Vertex AI.
4. Add safe diagnostics that log the selected model, exact outgoing endpoint with the secret redacted, HTTP status, and bounded Google response payload. Never write the API key or full sensitive prompt/image content to logs.
5. Return a clear controlled error if no catalog model supports `generateContent`, rather than issuing a known-invalid request.

## Tests and rollout

1. Add tests for bare and `models/`-prefixed model IDs, single-segment URL construction, catalog filtering, preferred-model selection, and fallback behavior.
2. Run the `ai-chat` edge-function tests.
3. Deploy `ai-chat`.
4. Invoke the deployed function through its real authenticated path, then inspect Supabase logs to confirm the selected model, sanitized URL, and a successful Google `200` response payload.
5. If the deployed catalog differs from documentation, use the catalog’s exact supported model ID and rerun the live request before reporting completion.

## Scope

Only the Gemini request/model-resolution path, its diagnostics, and focused tests will change. Existing RBAC, pharmacy context, MedEx lookup, vision payload handling, and chat UI remain unchanged.
