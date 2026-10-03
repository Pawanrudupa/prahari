export interface PipelineGate {
  id: string;
  step: number;
  name: string;
  shortLabel: string;
  category: "auth" | "validation" | "threat" | "policy" | "audit";
  status: "Active" | "Demo Detector" | "Planned (Heuristic)";
  description: string;
  technicalMechanism: string;
  docReference: string;
  positionX: number; // 3D coordinate along X axis
}

export const PIPELINE_GATES: PipelineGate[] = [
  {
    id: "identity",
    step: 1,
    name: "Identity & Key Verification",
    shortLabel: "01 Identity",
    category: "auth",
    status: "Active",
    description: "Authenticates caller identity against hashed agent API keys before parsing tool intent.",
    technicalMechanism: "Constant-time key prefix lookup & SHA-256 hash comparison. Rejects unknown or disabled agents with HTTP 401 and creates an audit record.",
    docReference: "docs/03-ARCHITECTURE.md § 1. Identity & Auth",
    positionX: -14,
  },
  {
    id: "schema",
    step: 2,
    name: "Parameter Schema Validation",
    shortLabel: "02 Schema",
    category: "validation",
    status: "Active",
    description: "Validates JSON arguments against registered MCP tool parameter schemas.",
    technicalMechanism: "Strict JSON schema type checking. Fails closed on missing required parameters or unrecognized argument keys before tool dispatch.",
    docReference: "docs/03-ARCHITECTURE.md § 2. Request Schema Checks",
    positionX: -10,
  },
  {
    id: "injection",
    step: 3,
    name: "Prompt Injection Scan",
    shortLabel: "03 Injection Scan",
    category: "threat",
    status: "Demo Detector",
    description: "Scans untrusted arguments and inbound context for prompt injection patterns and jailbreak attempts.",
    technicalMechanism: "Evaluates regex heuristic patterns and suspicious instruction override delimiters (e.g. system prompt override, ignore prior instructions).",
    docReference: "docs/03-ARCHITECTURE.md § 3. Threat Modeling (ASI01)",
    positionX: -6,
  },
  {
    id: "pii",
    step: 4,
    name: "PII Detection & Redaction",
    shortLabel: "04 PII Masking",
    category: "threat",
    status: "Demo Detector",
    description: "Tags sensitive data classes and redacts personal identifiers to enforce privacy compliance.",
    technicalMechanism: "Detects Indian personal identifiers (Aadhaar, PAN) and contact data (emails, phone numbers). Replaces raw values with entity tokens.",
    docReference: "docs/03-ARCHITECTURE.md § 4. Privacy & Data Classes",
    positionX: -2,
  },
  {
    id: "policy",
    step: 5,
    name: "Deterministic Policy Engine",
    shortLabel: "05 Policy Engine",
    category: "policy",
    status: "Active",
    description: "Enforces strict organization-defined governance rules with non-negotiable precedence.",
    technicalMechanism: "Evaluates rules deterministically: deny > escalate > redact > allow > default deny. Policy engine decisions are immutable and cannot be overridden by AI.",
    docReference: "docs/03-ARCHITECTURE.md § 5. Policy Engine & Invariants",
    positionX: 2,
  },
  {
    id: "limits",
    step: 6,
    name: "Rate & Loop Limits",
    shortLabel: "06 Limits & Loop",
    category: "policy",
    status: "Active",
    description: "Enforces sliding-window call frequency, daily budgets, and runaway loop brakes.",
    technicalMechanism: "Computes SHA-256 call signatures across (agent, tool, args). Repeated identical calls trip the loop-brake (L1) to halt infinite cycles.",
    docReference: "docs/03-ARCHITECTURE.md § 6. Limits & Budgets",
    positionX: 6,
  },
  {
    id: "risk",
    step: 7,
    name: "ML Risk Scoring",
    shortLabel: "07 Risk Scoring",
    category: "threat",
    status: "Planned (Heuristic)",
    description: "Synthesizes cumulative anomaly telemetry to tighten evaluation criteria for high-risk operations.",
    technicalMechanism: "Scoring models only ever tighten rules (e.g. turning allow into escalate or deny); ML signals never permit what policy forbids.",
    docReference: "docs/03-ARCHITECTURE.md § 7. ML & Risk Signals",
    positionX: 10,
  },
  {
    id: "audit",
    step: 8,
    name: "Cryptographic Audit Log",
    shortLabel: "08 Audit Chain",
    category: "audit",
    status: "Active",
    description: "Serializes and commits tamper-evident decisions into a hash-chained ledger.",
    technicalMechanism: "Appends record with SHA-256 hash incorporating previous record hash. Periodic HMAC-signed checkpoints guarantee sequential integrity.",
    docReference: "docs/03-ARCHITECTURE.md § 8. Append-Only Audit Trail",
    positionX: 14,
  },
];

export interface OutcomeBranch {
  id: "allow" | "redact" | "escalate" | "deny";
  name: string;
  badgeLabel: string;
  color: string;
  position: [number, number, number];
  description: string;
}

export const OUTCOME_BRANCHES: OutcomeBranch[] = [
  {
    id: "allow",
    name: "Tool Execution Pod",
    badgeLabel: "ALLOW",
    color: "#10B981",
    position: [19, 2.2, 0],
    description: "Action executed transparently downstream. Serial record committed to audit chain.",
  },
  {
    id: "redact",
    name: "Filtered Pass-Through Pod",
    badgeLabel: "REDACT",
    color: "#F59E0B",
    position: [19, 0.7, 0],
    description: "Personal identifiers sanitized & replaced with typed data class tags before execution.",
  },
  {
    id: "escalate",
    name: "Human Approval Pod",
    badgeLabel: "ESCALATE",
    color: "#A855F7",
    position: [19, -0.7, 0],
    description: "Held at Human Approval Pod awaiting manual operator authorize/reject decision.",
  },
  {
    id: "deny",
    name: "Policy Shield Shatter",
    badgeLabel: "DENY",
    color: "#F43F5E",
    position: [19, -2.2, 0],
    description: "Immediate rejection. Packet shatters; failure logged in hash-chained audit trail.",
  },
];

