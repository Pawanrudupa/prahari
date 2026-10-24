# Prahari sample policy (fictional)

> **WARNING:** This is a fictional policy document generated strictly for Prahari demonstration, testing, and evaluation purposes. It does not represent real-world statutes, banking guidelines, or regulatory mandates.

# Section 1 Scope and Purpose
This Payments Governance and Anti-Fraud Standard establishes the controls, limits, and approval protocols enforced by the Prahari gateway for automated agents executing financial transactions and balance operations.

# Section 2 Transaction Thresholds and Dual Control
## Section 2.1 Single-Transaction Limits
Automated agents operating without real-time human intervention are permitted to initiate transactions up to a maximum threshold of INR 10,000 per request, provided the recipient account is pre-whitelisted and validated.

## Section 2.2 Dual-Authorization Escalation Threshold
Any financial transaction exceeding INR 50,000, or any transfer involving newly registered recipient accounts, must be held in an `escalate` state awaiting human officer sign-off. The gateway will reject immediate execution and emit an approval ticket.

# Section 3 Velocity and Rate Limits
## Section 3.1 Cumulative Daily Spend Cap
An agent's cumulative disbursements within any rolling 24-hour cycle must not exceed INR 250,000 without administrative quota expansion. Once the daily cap is reached, all subsequent payment tool invocations must fail closed with a rate limit denial.

## Section 3.2 Burst Velocity Restrictions
Agents must not execute more than 5 consecutive payment disbursements within a 60-second window. Rapid repeated transactions indicate potential rogue agent loops or compromised execution contexts.

# Section 4 Sensitive Financial Instrument Protection
## Section 4.1 Cardholder Data Exclusion
Autonomous agents are strictly forbidden from retrieving, manipulating, or storing raw Primary Account Numbers (PAN), Card Verification Values (CVV), or bank account PINs. All payment invocations must use tokenized payment references.

## Section 4.2 Reversal and Refund Authorization
Autonomous refunds greater than INR 5,000 require verification against original transaction receipts and supervisor sign-off. Direct charge reversals cannot be executed by tier-1 customer support agents.
