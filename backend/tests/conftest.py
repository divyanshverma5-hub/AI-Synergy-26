"""Shared pytest fixtures.

Environment is configured before any `app.*` import because config.py reads the
environment at import time.
"""

from __future__ import annotations

import os
import tempfile

import pytest

_TMP = tempfile.mkdtemp(prefix="rrr-tests-")
os.environ["RRR_DATA_DIR"] = _TMP
os.environ["RRR_DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["ANALYSIS_PROVIDER"] = "mock"
os.environ["RRR_SEED_DEMO"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.pdf_extract import extract_pdf  # noqa: E402
from app.seed.demo_data import _text_to_pdf  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def sample_pdf_bytes() -> bytes:
    """A small fictional bill used across tests."""
    text = (
        "THE DEMONSTRATION TEST BILL (FICTIONAL)\n"
        "A BILL to test clause extraction.\n"
        "1. Short title. This Act may be called the Demonstration Test Act (fictional).\n"
        "2. Appeal. No appeal shall lie against an order made under this Act and no "
        "appeal shall be available to any person aggrieved by such an order.\n"
        "3. Privacy. The authority may collect personal data of any person and shall not "
        "be required to inform that person of the collection of such data.\n"
        "4. Fees. The authority may prescribe the fees payable under this Act by notification.\n"
    )
    return _text_to_pdf("Demonstration Test Bill (fictional)", text)


@pytest.fixture()
def uploaded_document(client: TestClient, sample_pdf_bytes: bytes) -> dict:
    response = client.post(
        "/api/documents",
        files={"file": ("demo-bill.pdf", sample_pdf_bytes, "application/pdf")},
        data={"title": "Demonstration Test Bill (fictional)", "legal_status": "proposed (fictional)"},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture()
def analysed_document(client: TestClient, uploaded_document: dict) -> dict:
    response = client.post("/api/analyses", json={"document_id": uploaded_document["id"]})
    assert response.status_code == 202, response.text
    analysis = response.json()
    # SIMULATED JOB: poll until the background worker finishes.
    import time

    for _ in range(300):
        current = client.get(f"/api/analyses/{analysis['id']}").json()
        if current["status"] in {"completed", "failed"}:
            return {"analysis": current, "document": uploaded_document}
        time.sleep(0.05)
    raise AssertionError("analysis did not finish in time")
