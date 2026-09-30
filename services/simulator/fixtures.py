"""Deterministic fixtures and synthetic fake PII for simulation."""

# Non-negotiable Invariant 3: No real personal data or secrets.
# All data here is explicitly fake and synthetic.
SYNTHETIC_FAKE_AADHAAR = "0000 0000 0000"
SYNTHETIC_FAKE_PAN = "ABCDE1234F"
SYNTHETIC_FAKE_PHONE = "+91 99999 00000"
SYNTHETIC_FAKE_EMAIL = "synthetic.user@example.invalid"

AGENTS_SPEC = [
    {
        "name": "Support-Bot",
        "role": "support",
        "owner": "Customer Ops",
    },
    {
        "name": "Finance-Agent",
        "role": "finance",
        "owner": "Finance Operations",
    },
    {
        "name": "DevOps-Agent",
        "role": "devops",
        "owner": "Cloud Infrastructure",
    },
]

TOOLS_SPEC = [
    {
        "name": "crm.read_ticket",
        "server": "crm-mcp",
        "sensitivity": "normal",
        "schema_json": {"properties": {"ticket_id": {"type": "string"}}},
    },
    {
        "name": "email.send",
        "server": "comms-mcp",
        "sensitivity": "confidential",
        "schema_json": {
            "properties": {"recipient": {"type": "string"}, "body": {"type": "string"}},
        },
    },
    {
        "name": "crm.export",
        "server": "crm-mcp",
        "sensitivity": "restricted",
        "schema_json": {"properties": {"rows": {"type": "integer"}}},
    },
    {
        "name": "payments.transfer",
        "server": "banking-mcp",
        "sensitivity": "critical",
        "schema_json": {
            "properties": {"amount": {"type": "number"}, "to_account": {"type": "string"}},
        },
    },
    {
        "name": "infra.restart_service",
        "server": "cloud-mcp",
        "sensitivity": "operational",
        "schema_json": {"properties": {"service_name": {"type": "string"}}},
    },
]
