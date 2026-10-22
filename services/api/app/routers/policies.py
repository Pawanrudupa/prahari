"""Policy Studio Router.

Endpoints for policy version management, validation, dry-run testing,
activation, one-click rollback, and rule hit-count telemetry.
"""

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_admin_audit_event
from app.auth.admin import require_admin_token, require_session_or_admin_token
from app.core.database import get_db
from app.events.bus import publish_event
from app.models.decision import Decision
from app.models.policy import Policy, PolicyVersion
from app.policy.engine import evaluate_policy
from app.policy.loader import load_policy_from_yaml
from app.policy.schemas import EvaluationContext
from app.stubs.injection import scan_injection
from app.stubs.pii import detect_pii

router = APIRouter(prefix="/v1/policies", tags=["policies"])


class PolicyVersionSummary(BaseModel):
    id: UUID
    version: int
    created_by: str | None
    created_at: datetime
    is_active: bool


class PolicySummaryResponse(BaseModel):
    id: UUID
    name: str
    status: str
    active_version: int | None
    versions_count: int


class PolicyVersionDetailResponse(BaseModel):
    id: UUID
    policy_id: UUID
    version: int
    yaml: str
    created_by: str | None
    created_at: datetime
    is_active: bool


class PolicyValidateRequest(BaseModel):
    yaml: str = Field(..., description="YAML policy definition to validate")


class PolicyValidateResponse(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    rules_count: int = 0
    limits_count: int = 0


class PolicySampleInput(BaseModel):
    agent_name: str = "support-agent"
    agent_role: str | None = "support"
    tool: str = "crm.read_ticket"
    args: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] | None = None


class PolicyTestRequest(BaseModel):
    yaml: str = Field(..., description="YAML policy definition to evaluate against")
    sample_input: PolicySampleInput = Field(default_factory=PolicySampleInput)


class PolicyTestResponse(BaseModel):
    decision: str
    rule_id: str | None
    reason: str
    data_classes: list[str] = Field(default_factory=list)
    injection_score: float = 0.0


class PolicyCreateVersionRequest(BaseModel):
    yaml: str = Field(..., description="Valid YAML content for the new immutable version")
    comment: str | None = Field(default=None, description="Optional revision note")


class RuleHitCountItem(BaseModel):
    rule_id: str
    outcome: str
    hit_count: int


@router.get(
    "",
    response_model=list[PolicySummaryResponse],
    summary="List policies and active version info",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def list_policies(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PolicySummaryResponse]:
    stmt = select(Policy).order_by(Policy.name.asc())
    policies = (await db.execute(stmt)).scalars().all()

    items: list[PolicySummaryResponse] = []
    for pol in policies:
        # Get count of versions
        ver_count_stmt = select(func.count(PolicyVersion.id)).where(
            PolicyVersion.policy_id == pol.id
        )
        ver_count = (await db.execute(ver_count_stmt)).scalar() or 0

        # Get active version number
        active_ver_num: int | None = None
        if pol.active_version_id:
            active_ver = await db.get(PolicyVersion, pol.active_version_id)
            if active_ver:
                active_ver_num = active_ver.version

        items.append(
            PolicySummaryResponse(
                id=pol.id,
                name=pol.name,
                status=pol.status,
                active_version=active_ver_num,
                versions_count=ver_count,
            )
        )
    return items


@router.get(
    "/{policy_id}/versions",
    response_model=list[PolicyVersionSummary],
    summary="List immutable versions for a policy",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def list_policy_versions(
    policy_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PolicyVersionSummary]:
    policy = await db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    stmt = (
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy_id)
        .order_by(PolicyVersion.version.desc())
    )
    versions = (await db.execute(stmt)).scalars().all()

    return [
        PolicyVersionSummary(
            id=v.id,
            version=v.version,
            created_by=v.created_by,
            created_at=v.created_at,
            is_active=(v.id == policy.active_version_id),
        )
        for v in versions
    ]


@router.get(
    "/{policy_id}/versions/{version}",
    response_model=PolicyVersionDetailResponse,
    summary="Get YAML and details of a specific policy version",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def get_policy_version_detail(
    policy_id: UUID,
    version: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PolicyVersionDetailResponse:
    policy = await db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    stmt = select(PolicyVersion).where(
        PolicyVersion.policy_id == policy_id,
        PolicyVersion.version == version,
    )
    ver = (await db.execute(stmt)).scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail=f"Policy version {version} not found")

    return PolicyVersionDetailResponse(
        id=ver.id,
        policy_id=ver.policy_id,
        version=ver.version,
        yaml=ver.yaml,
        created_by=ver.created_by,
        created_at=ver.created_at,
        is_active=(ver.id == policy.active_version_id),
    )


@router.post(
    "/validate",
    response_model=PolicyValidateResponse,
    summary="Validate policy YAML syntax and schema without saving",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def validate_policy(req: PolicyValidateRequest) -> PolicyValidateResponse:
    try:
        parsed = load_policy_from_yaml(req.yaml)
        return PolicyValidateResponse(
            valid=True,
            errors=[],
            rules_count=len(parsed.rules),
            limits_count=len(parsed.limits),
        )
    except Exception as exc:
        return PolicyValidateResponse(
            valid=False,
            errors=[str(exc)],
            rules_count=0,
            limits_count=0,
        )


@router.post(
    "/test",
    response_model=PolicyTestResponse,
    summary="Dry-run sample input against policy YAML to see outcome and matching rule",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def test_policy(req: PolicyTestRequest) -> PolicyTestResponse:
    try:
        policy_def = load_policy_from_yaml(req.yaml)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid policy YAML: {exc}",
        ) from exc

    # Inbound injection & PII detection
    inp = req.sample_input
    injection_score = scan_injection(inp.context)
    data_classes = detect_pii(inp.args)

    eval_ctx = EvaluationContext(
        agent_id=uuid4(),
        agent_role=inp.agent_role,
        agent_name=inp.agent_name,
        tool=inp.tool,
        args=inp.args,
        data_classes=data_classes,
        injection_score=injection_score,
    )

    decision = evaluate_policy(policy_def, eval_ctx)

    return PolicyTestResponse(
        decision=decision.outcome,
        rule_id=decision.rule_id,
        reason=decision.reason,
        data_classes=data_classes,
        injection_score=injection_score,
    )


@router.post(
    "/{policy_id}/versions",
    response_model=PolicyVersionDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new immutable policy version (Admin only)",
    dependencies=[Depends(require_admin_token)],
)
async def create_policy_version(
    policy_id: UUID,
    req: PolicyCreateVersionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PolicyVersionDetailResponse:
    policy = await db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    # Invariant: Validate before save
    try:
        load_policy_from_yaml(req.yaml)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot save invalid policy: {exc}",
        ) from exc

    # Compute next version number
    max_ver_stmt = select(func.max(PolicyVersion.version)).where(
        PolicyVersion.policy_id == policy_id
    )
    curr_max = (await db.execute(max_ver_stmt)).scalar() or 0
    next_ver = curr_max + 1

    new_ver = PolicyVersion(
        id=uuid4(),
        policy_id=policy_id,
        version=next_ver,
        yaml=req.yaml,
        created_by="admin",
    )
    db.add(new_ver)
    await db.commit()
    await db.refresh(new_ver)

    # Record admin audit event
    await record_admin_audit_event(
        session=db,
        event_type="policy.version_created",
        details={
            "policy_id": str(policy_id),
            "version": next_ver,
            "comment": req.comment,
        },
    )

    return PolicyVersionDetailResponse(
        id=new_ver.id,
        policy_id=new_ver.policy_id,
        version=new_ver.version,
        yaml=new_ver.yaml,
        created_by=new_ver.created_by,
        created_at=new_ver.created_at,
        is_active=(new_ver.id == policy.active_version_id),
    )


@router.post(
    "/{policy_id}/versions/{version}/activate",
    response_model=PolicyVersionDetailResponse,
    summary="Activate a specific policy version (Admin only, Fail-closed)",
    dependencies=[Depends(require_admin_token)],
)
async def activate_policy_version(
    policy_id: UUID,
    version: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PolicyVersionDetailResponse:
    policy = await db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    stmt = select(PolicyVersion).where(
        PolicyVersion.policy_id == policy_id,
        PolicyVersion.version == version,
    )
    ver = (await db.execute(stmt)).scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail=f"Version {version} not found")

    # Invariant: Fail closed if the new policy won't load
    try:
        load_policy_from_yaml(ver.yaml)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Activation rejected: target policy failed validation ({exc}). "
                "Keeping existing active version."
            ),
        ) from exc

    old_active_id = policy.active_version_id
    policy.active_version_id = ver.id
    policy.status = "active"
    await db.commit()
    await db.refresh(policy)

    # Record admin audit event
    await record_admin_audit_event(
        session=db,
        event_type="policy.activated",
        details={
            "policy_id": str(policy_id),
            "version": version,
            "version_id": str(ver.id),
            "previous_version_id": str(old_active_id) if old_active_id else None,
        },
    )

    # Broadcast event
    await publish_event(
        "policy.activated",
        {
            "policy_id": str(policy_id),
            "version": version,
            "activated_at": datetime.now().isoformat(),
        },
    )

    return PolicyVersionDetailResponse(
        id=ver.id,
        policy_id=ver.policy_id,
        version=ver.version,
        yaml=ver.yaml,
        created_by=ver.created_by,
        created_at=ver.created_at,
        is_active=True,
    )


@router.post(
    "/{policy_id}/rollback",
    response_model=PolicyVersionDetailResponse,
    summary="One-click rollback to previous policy version (Admin only)",
    dependencies=[Depends(require_admin_token)],
)
async def rollback_policy(
    policy_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PolicyVersionDetailResponse:
    policy = await db.get(Policy, policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    if not policy.active_version_id:
        raise HTTPException(status_code=400, detail="No active version to rollback from")

    current_active = await db.get(PolicyVersion, policy.active_version_id)
    if not current_active:
        raise HTTPException(status_code=400, detail="Current active version record missing")

    # Find the version strictly immediately preceding current_active.version
    stmt = (
        select(PolicyVersion)
        .where(
            PolicyVersion.policy_id == policy_id,
            PolicyVersion.version < current_active.version,
        )
        .order_by(PolicyVersion.version.desc())
        .limit(1)
    )
    prev_ver = (await db.execute(stmt)).scalar_one_or_none()
    if not prev_ver:
        raise HTTPException(status_code=400, detail="No previous version found for rollback")

    # Invariant: Fail closed if previous policy fails validation
    try:
        load_policy_from_yaml(prev_ver.yaml)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Rollback failed: previous version corrupt ({exc})",
        ) from exc

    policy.active_version_id = prev_ver.id
    await db.commit()
    await db.refresh(policy)

    # Record admin audit event
    await record_admin_audit_event(
        session=db,
        event_type="policy.rollback",
        details={
            "policy_id": str(policy_id),
            "rolled_back_to_version": prev_ver.version,
            "rolled_back_from_version": current_active.version,
        },
    )

    return PolicyVersionDetailResponse(
        id=prev_ver.id,
        policy_id=prev_ver.policy_id,
        version=prev_ver.version,
        yaml=prev_ver.yaml,
        created_by=prev_ver.created_by,
        created_at=prev_ver.created_at,
        is_active=True,
    )


@router.get(
    "/rule-hit-counts",
    response_model=list[RuleHitCountItem],
    summary="Rule execution hit counts from decision history",
    dependencies=[Depends(require_session_or_admin_token)],
)
async def get_rule_hit_counts(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[RuleHitCountItem]:
    stmt = (
        select(
            Decision.rule_id,
            Decision.outcome,
            func.count(Decision.id).label("hit_count"),
        )
        .where(Decision.rule_id.is_not(None))
        .group_by(Decision.rule_id, Decision.outcome)
        .order_by(func.count(Decision.id).desc())
    )
    rows = (await db.execute(stmt)).all()

    return [
        RuleHitCountItem(
            rule_id=str(r.rule_id),
            outcome=str(r.outcome),
            hit_count=int(r.hit_count),
        )
        for r in rows
    ]
