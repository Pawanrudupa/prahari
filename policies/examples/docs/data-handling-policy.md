# Prahari sample policy (fictional)

> **WARNING:** This is a fictional policy document generated strictly for Prahari demonstration, testing, and evaluation purposes. It does not represent real-world statutes, legal advice, or regulatory mandates.

# Section 1 Scope and Purpose
This Data Handling and Privacy Protection Standard governs how automated agents, internal microservices, and human operators process, store, and transmit corporate and customer information within the synthetic enterprise environment.

# Section 2 Data Classification Framework
All data elements managed by agents must be classified into one of four sensitivity tiers:
- **Public**: General product catalogs, open documentation, and public company disclosures.
- **Internal**: Internal procedures, non-sensitive communication, and synthetic operational metrics.
- **Confidential**: Proprietary algorithms, unannounced feature specs, and aggregated business analytics.
- **Restricted (PII)**: Personally identifiable information, customer identifiers, phone numbers, email addresses, government identity tokens, and financial instruments.

# Section 3 PII Redaction and Sanitization Rules
## Section 3.1 Masking of Personal Identifiers
When an automated agent retrieves customer records for support, diagnostic, or reporting tasks, all Restricted data classes must be dynamically redacted or masked before passing to downstream prompts or third-party APIs.
Masking rules:
- National identity identifiers must show only the final 4 digits.
- Email addresses must have the local username portion partially masked (e.g., `j***@example.com`).
- Phone numbers must retain country prefix and terminal two digits.

## Section 3.2 Bulk Data Export Prohibitions
No autonomous agent may execute an unrestricted export, dump, or exfiltration of tabular data exceeding 100 rows containing Confidential or Restricted data. Any attempt to export customer tables in bulk requires explicit human supervisor approval and an auditable escalation token.

# Section 4 Data Retention and Storage Minimization
## Section 4.1 Ephemeral Processing
Agents must maintain no long-term persistence of decrypted customer attributes in local caches, vector databases, or temporary scratchpads. Data held in memory must be evicted within the session lifetime.

## Section 4.2 Logging Sanitation
Raw customer payloads, plaintext secrets, session tokens, and passwords must never be written to audit logs, application telemetry, or standard error streams. Audit records must reference schema data-class labels rather than literal field values.
