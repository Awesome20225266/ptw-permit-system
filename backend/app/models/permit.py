"""models/permit.py — PTW workflow schemas."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Status enum (mirrors DB_STATUS_TO_UI from S1.py)
# ---------------------------------------------------------------------------

class PTWStatus(str, Enum):
    OPEN = "OPEN"
    WIP = "WIP"
    APPROVED = "APPROVED"
    CLOSED = "CLOSED"
    REJECTED = "REJECTED"


# ---------------------------------------------------------------------------
# Work Order
# ---------------------------------------------------------------------------

class WorkOrder(BaseModel):
    work_order_id: str
    site_name: Optional[str] = None
    status: Optional[str] = None          # derived by derive_ptw_status()
    date_s1_created: Optional[datetime] = None
    date_s2_forwarded: Optional[datetime] = None
    date_s3_approved: Optional[datetime] = None
    date_s2_rejected: Optional[datetime] = None
    date_s3_rejected: Optional[datetime] = None
    date_s1_closed: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# PTW Request
# ---------------------------------------------------------------------------

class PTWRequestBase(BaseModel):
    permit_no: str
    site_name: str
    form_data: dict[str, Any] = {}


class PTWRequestCreate(PTWRequestBase):
    """Payload sent by S1 to create a new PTW."""
    work_order_ids: list[str]             # linked work orders


class PTWRequest(PTWRequestBase):
    ptw_id: str
    template_id: Optional[str] = None
    permit_type: str = "ELECTRICAL"
    status: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# S1 create response
# ---------------------------------------------------------------------------

class PTWCreateResponse(BaseModel):
    ptw_id: str
    status: str = PTWStatus.OPEN
    pdf_url: Optional[str] = None


# ---------------------------------------------------------------------------
# S2 forward payload
# ---------------------------------------------------------------------------

class PTWForwardRequest(BaseModel):
    holder_name: str
    holder_datetime: Optional[str] = None   # DD-MM-YYYY HH:MM (auto-set if blank)
    form_data_updates: dict[str, Any] = {}  # any extra S2-filled fields


class PTWForwardResponse(BaseModel):
    ptw_id: str
    status: str = PTWStatus.WIP
    stamped_pdf_url: Optional[str] = None


# ---------------------------------------------------------------------------
# S3 approve / reject payload
# ---------------------------------------------------------------------------

class PTWApproveRequest(BaseModel):
    issuer_name: Optional[str] = None
    issuer_datetime: Optional[str] = None   # auto-set to now if blank


class PTWRejectRequest(BaseModel):
    reason: str


class PTWApproveResponse(BaseModel):
    ptw_id: str
    status: str
    approved_pdf_url: Optional[str] = None


class PTWRejectResponse(BaseModel):
    ptw_id: str
    status: str = PTWStatus.REJECTED
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Close (S1 closure)
# ---------------------------------------------------------------------------

class PTWCloseRequest(BaseModel):
    closure_notes: Optional[str] = None


class PTWCloseResponse(BaseModel):
    ptw_id: str
    status: str = PTWStatus.CLOSED
