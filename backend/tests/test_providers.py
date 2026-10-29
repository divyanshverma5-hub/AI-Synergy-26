"""Provider-swap tests: the mock/real seam and its validation rules."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from app.providers import get_provider
from app.providers.mock import MockAnalysisProvider
from app.providers.real import RealAnalysisProvider, RealProviderError


def test_factory_returns_mock_by_default():
    assert isinstance(get_provider("mock"), MockAnalysisProvider)
    assert get_provider("mock").is_demonstration is True


def test_factory_returns_real_provider_when_requested():
    provider = get_provider("real")
    assert isinstance(provider, RealAnalysisProvider)
    assert provider.is_demonstration is False


def test_factory_falls_back_to_mock_for_unknown_names():
    assert isinstance(get_provider("something-else"), MockAnalysisProvider)


def test_real_provider_without_endpoint_raises():
    provider = RealAnalysisProvider(endpoint="")
    with pytest.raises(RealProviderError):
        provider.analyze([], None)


class _StubHandler(BaseHTTPRequestHandler):
    """Serves a canned ML response so the real provider can be exercised."""

    response_body: dict = {}
    status_code = 200
    received: dict = {}

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        _StubHandler.received = json.loads(self.rfile.read(length) or b"{}")
        payload = json.dumps(_StubHandler.response_body).encode()
        self.send_response(_StubHandler.status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):  # silence test output
        return


@pytest.fixture()
def stub_server():
    server = HTTPServer(("127.0.0.1", 0), _StubHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}/analyze"
    server.shutdown()


class _FakeClause:
    def __init__(self, cid="c1", ordinal=1, section_id="2", heading="Appeal", text="No appeal shall lie."):
        self.id = cid
        self.ordinal = ordinal
        self.section_id = section_id
        self.heading = heading
        self.text = text
        self.document_id = "doc1"


def test_real_provider_parses_valid_response(stub_server):
    _StubHandler.status_code = 200
    _StubHandler.response_body = {
        "schema_version": "1.0",
        "findings": [
            {
                "clause_id": "c1",
                "predicted_label": "removes_safeguard",
                "confidence": 0.91,
                "explanation": "Removes the statutory appeal right.",
                "rights_tags": ["article_21"],
                "requires_review": True,
                "evidence_sufficient": True,
                "implications": {"sufficient_evidence": True, "benefits": [], "drawbacks": []},
                "evidence": [
                    {
                        "kind": "retrieved_provision",
                        "snippet": "Any person aggrieved may prefer an appeal.",
                        "source_title": "Real Act",
                        "source_section": "Section 9",
                        "source_url": "https://example.gov.in/act",
                        "retrieval_score": 0.77,
                    }
                ],
            }
        ],
    }
    provider = RealAnalysisProvider(endpoint=stub_server)
    result = provider.analyze([_FakeClause()], None)
    assert result.is_demonstration is False
    assert len(result.findings) == 1
    finding = result.findings[0]
    assert finding.predicted_label == "removes_safeguard"
    assert finding.confidence == 0.91
    assert finding.rights_tags == ["article_21"]
    assert finding.evidence[0].source_url == "https://example.gov.in/act"
    # The clause payload sent upstream matches the documented schema.
    assert _StubHandler.received["clauses"][0]["id"] == "c1"


def test_real_provider_rejects_invalid_label(stub_server):
    _StubHandler.status_code = 200
    _StubHandler.response_body = {
        "findings": [{"clause_id": "c1", "predicted_label": "unconstitutional"}]
    }
    with pytest.raises(RealProviderError, match="predicted_label"):
        RealAnalysisProvider(endpoint=stub_server).analyze([_FakeClause()], None)


def test_real_provider_rejects_missing_findings(stub_server):
    _StubHandler.status_code = 200
    _StubHandler.response_body = {"schema_version": "1.0"}
    with pytest.raises(RealProviderError, match="findings"):
        RealAnalysisProvider(endpoint=stub_server).analyze([_FakeClause()], None)


def test_real_provider_reports_http_error(stub_server):
    _StubHandler.status_code = 500
    _StubHandler.response_body = {"error": "model crashed"}
    with pytest.raises(RealProviderError, match="HTTP 500"):
        RealAnalysisProvider(endpoint=stub_server).analyze([_FakeClause()], None)


def test_real_provider_reports_unreachable_service():
    with pytest.raises(RealProviderError, match="unreachable"):
        RealAnalysisProvider(endpoint="http://127.0.0.1:9/analyze").analyze([_FakeClause()], None)


def test_failed_real_provider_marks_analysis_failed(client, uploaded_document, monkeypatch):
    """An unreachable ML service must surface as a failed job, not silent success."""
    response = client.post(
        "/api/analyses",
        json={"document_id": uploaded_document["id"], "provider": "real", "force": True},
    )
    assert response.status_code == 202
    analysis_id = response.json()["id"]
    import time

    for _ in range(300):
        current = client.get(f"/api/analyses/{analysis_id}").json()
        if current["status"] in {"completed", "failed"}:
            break
        time.sleep(0.05)
    assert current["status"] == "failed"
    assert "REAL_ANALYSIS_ENDPOINT" in (current["error"] or "") or "unreachable" in (
        current["error"] or ""
    )
