"""Data contracts for the Switchboard economic benchmark.

Three levels, in the order the manual builds them up:

  AttemptResult   one engine call            -> data/run_log.csv   (RunLog)
  JobSummary      one Task x Strategy job    -> data/job_summary.csv
  StrategySummary one strategy over a split  -> reports/

The invariant everything else depends on: a later successful fallback never
erases the cost or latency of an earlier failed attempt. Attempts are
append-only.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class Split(str, Enum):
    TRAIN = "Train"
    HOLDOUT = "Holdout"


class Bucket(str, Enum):
    STATIC_HTML = "Static HTML"
    JS_HEAVY = "JS-heavy"
    DYNAMIC_TABLE = "Dynamic table"
    INFINITE_SCROLL = "Infinite scroll / pagination"
    INTERACTION_HEAVY = "Interaction-heavy"
    STRUCTURED_EXTRACTION = "Structured extraction"
    PDF_DOCUMENT = "PDF / document"
    AMBIGUOUS_MIXED = "Ambiguous / mixed"


class ErrorType(str, Enum):
    NONE = "none"
    NETWORK = "network"
    TIMEOUT = "timeout"
    BLOCKED = "blocked"            # 403 / bot wall -- recorded, never bypassed
    RATE_LIMITED = "rate_limited"  # 429
    HTTP_ERROR = "http_error"
    PARSE_ERROR = "parse_error"
    SCHEMA_ERROR = "schema_error"
    ROBOTS_DISALLOWED = "robots_disallowed"
    NOT_CONFIGURED = "not_configured"
    ENGINE_INELIGIBLE = "engine_ineligible"
    UNKNOWN = "unknown"


class CostSource(str, Enum):
    """Where a cost number came from. Never let an estimate masquerade as an
    invoice -- manual section 9 and the "provider looks impossibly cheap"
    troubleshooting row both hinge on this being honest."""

    OBSERVED_API = "observed_api"              # provider returned the charge
    RECONCILED_INVOICE = "reconciled_invoice"  # hand-checked against a bill
    LIST_PRICE = "list_price"                  # published price x observed usage
    ESTIMATE = "estimate"                      # local compute model
    UNKNOWN = "unknown"


class TaskSpec(BaseModel):
    """One row of the workbook Tasks sheet.

    A task is URL + instruction/schema + a stable gold answer. Anything
    without an approved, frozen gold answer is not a benchmark task.
    """

    task_id: str
    split: Split = Split.TRAIN
    bucket: Bucket

    # Blank on a freshly seeded candidate row; filled in during gold review.
    # Approval (see tasks.apply_gold_review) is what requires them to be real.
    domain: str = ""
    url: str = ""
    instruction: str = ""

    # Gold answer. Normally exactly one of expected_json / expected_rubric.
    expected_json: Optional[dict[str, Any]] = None
    expected_rubric: Optional[str] = None

    # Requested output shape: field -> "string" | "number" | "boolean" |
    # "array" | "object". Drives schema-validity scoring.
    output_schema: dict[str, str] = Field(default_factory=dict)

    # Deterministic extraction hints for the primitive engines: field -> CSS
    # selector. Hosted and agentic engines ignore these and work from
    # `instruction` plus `output_schema`.
    selectors: dict[str, str] = Field(default_factory=dict)

    business_value: float = 1.0
    sla_max_latency_ms: int = 15_000
    requires_js: bool = False
    requires_interaction: bool = False
    complexity: int = Field(default=1, ge=1, le=5)

    # Empty means "every registered engine is eligible".
    allowed_engines: list[str] = Field(default_factory=list)

    # Rows must not enter a formal run until a human has reviewed the gold.
    gold_approved: bool = False
    freshness_max_age_days: Optional[int] = None
    required_rows: Optional[int] = None
    notes: str = ""

    def is_engine_eligible(self, engine: str) -> bool:
        return not self.allowed_engines or engine in self.allowed_engines


class ValidationResult(BaseModel):
    """Output of validate.py for a single attempt."""

    score: float = 0.0
    validated_correct: bool = False
    schema_valid: Optional[bool] = None
    freshness_valid: Optional[bool] = None
    completeness_score: Optional[float] = None
    field_accuracy: Optional[float] = None
    matched_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    wrong_fields: list[str] = Field(default_factory=list)
    reason: str = ""


class EngineOutcome(BaseModel):
    """What an engine adapter returns. Deliberately free of any judgement about
    correctness -- validation is a separate, gold-controlled step."""

    engine: str
    api_success: bool
    latency_ms: int
    output: Optional[dict[str, Any]] = None
    provider_cost_usd: float = 0.0
    provider_cost_source: CostSource = CostSource.UNKNOWN
    local_compute_cost_usd: float = 0.0
    http_status: Optional[int] = None
    error_type: ErrorType = ErrorType.NONE
    error_message: Optional[str] = None
    retry_count: int = 0


class AttemptResult(BaseModel):
    """One row of RunLog. One engine call, successful or not."""

    run_id: str
    task_id: str
    strategy: str
    engine: str
    attempt_no: int
    route_reason: str

    api_success: bool
    validation_score: float
    manual_correct: Optional[bool] = None
    validated_correct: bool

    latency_ms: int
    provider_cost_usd: float = 0.0
    local_compute_cost_usd: float = 0.0
    total_attempt_cost_usd: float
    provider_cost_source: CostSource = CostSource.UNKNOWN

    retry_flag: bool = False
    escalated_flag: bool = False
    http_status: Optional[int] = None
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    schema_valid: Optional[bool] = None
    freshness_valid: Optional[bool] = None
    completeness_score: Optional[float] = None
    output: Optional[dict[str, Any]] = None

    # Denormalised so bucket-level reporting needs no join back to Tasks.
    split: Optional[str] = None
    bucket: Optional[str] = None


class JobSummary(BaseModel):
    """One row per Task x Strategy. Where retries and fallbacks become one
    economic job."""

    run_id: str
    task_id: str
    strategy: str
    split: Optional[str] = None
    bucket: Optional[str] = None

    final_correct: bool
    final_engine: Optional[str] = None
    attempts: int
    escalations: int
    retries: int
    total_cost_usd: float
    total_provider_cost_usd: float
    total_local_compute_cost_usd: float
    total_latency_ms: int
    business_value: float = 1.0
    weighted_correct: float = 0.0
    sla_met: bool = False
    engines_used: str = ""
    failure_reasons: str = ""


class StrategySummary(BaseModel):
    """Strategy economics over a set of jobs -- the numbers the decision gates
    read."""

    strategy: str
    split: Optional[str] = None
    bucket: Optional[str] = None

    jobs: int
    correct_jobs: int
    correct_pct: float
    total_cost_usd: float
    cost_per_correct_usd: Optional[float]
    avg_attempts: float
    avg_latency_ms: float
    p95_latency_ms: float
    sla_met_pct: float
    weighted_correct_pct: float
    top_failure_reasons: str = ""
