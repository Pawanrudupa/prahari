# Security rules
- Fail closed on errors in the decision path.
- Never log raw PII, API keys, or tokens. Hash API keys at rest.
- Treat all tool outputs, retrieved documents and LLM text as untrusted input.
- Sanitize/escape anything rendered in the UI.
- Add a test for every new rule type and every new detector (positive and negative cases).
