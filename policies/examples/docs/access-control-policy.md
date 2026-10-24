# Prahari sample policy (fictional)

> **WARNING:** This is a fictional policy document generated strictly for Prahari demonstration, testing, and evaluation purposes. It does not represent real-world statutes, legal standards, or technical certifications.

# Section 1 Scope and Purpose
This Access Control and Agent Authorization Standard defines the principles of least privilege, credential handling, and tool capability grants across all autonomous agent sessions within Prahari.

# Section 2 Principle of Least Privilege
## Section 2.1 Agent Role Categorization
Agents must be registered under one of four designated operational roles:
- **Support**: Read-only lookup of ticket status and customer metadata with redaction. Prohibited from mutating billing records.
- **Billing**: Processing approved invoice adjustments, querying payment statuses, and initiating authorized reconciliation tasks.
- **Auditor**: Read-only oversight of gateway telemetry, policy compliance records, and tamper verification logs.
- **Admin**: System configuration, policy version authoring, and credential rotation. Not authorized for direct customer record extraction.

## Section 2.2 Capability Grants and Granular Tools
No agent may invoke a gateway tool unless an active, unexpired `CapabilityGrant` explicitly links the agent's identity to the specified tool name. Universal or wildcard tool access is strictly rejected at the gateway.

# Section 3 Credential Lifecycle and Token Governance
## Section 3.1 Ephemeral Session Tokens
All agent interaction with the Prahari gateway must use short-lived bearer tokens expiring within 60 minutes. Refresh flows require cryptographic verification of the agent's registered public key.

## Section 3.2 Credential Non-Disclosure
Agents must never echo, forward, or include API keys, database connection strings, or asymmetric secrets in tool arguments or model completion contexts. Injection of credentials into prompts triggers an immediate security denial.

# Section 4 Administrative Actions and Break-Glass Procedures
## Section 4.1 Multi-Party Sign-Off
Modifications to active production policies or bulk agent credential revocations require approval from at least two authorized administrative principals.

## Section 4.2 Emergency Revocation
Security officers retain unilateral authority to immediately place any agent into `suspended` or `archived` status, revoking all active capability grants and closing active gateway connections.
