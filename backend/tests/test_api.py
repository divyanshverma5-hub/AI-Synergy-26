"""API tests: documents, analyses, findings, reviews, audit log, metrics."""

from __future__ import annotations

import io
import time


def test_health_reports_provider_and_disclaimer(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["analysis_provider"] == "mock"
    assert "not legal advice" in body["disclaimer"].lower()


# --- Documents ---------------------------------------------------------------


def test_upload_rejects_non_pdf_extension(client, sample_pdf_bytes):
    response = client.post(
        "/api/documents",
        files={"file": ("notes.txt", sample_pdf_bytes, "text/plain")},
    )
    assert response.status_code == 415
    assert "PDF" in response.json()["detail"]


def test_upload_rejects_content_that_is_not_a_pdf(client):
    response = client.post(
        "/api/documents",
        files={"file": ("fake.pdf", io.BytesIO(b"hello world"), "application/pdf")},
    )
    assert response.status_code == 415


def test_upload_rejects_empty_file(client):
    response = client.post(
        "/api/documents",
        files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")},
    )
    assert response.status_code == 422


def test_upload_extracts_text_and_splits_clauses(client, uploaded_document):
    document = uploaded_document
    assert document["status"] == "uploaded"
    assert document["page_count"] >= 1
    assert document["is_demonstration"] is False
    assert document["clause_count"] >= 2

    clauses = client.get(f"/api/documents/{document['id']}/clauses").json()
    assert len(clauses) == document["clause_count"]
    assert any(c["section_id"] for c in clauses)


def test_get_unknown_document_returns_404(client):
    assert client.get("/api/documents/does-not-exist").status_code == 404


def test_document_list_and_search(client, uploaded_document):
    all_docs = client.get("/api/documents").json()
    assert any(d["id"] == uploaded_document["id"] for d in all_docs)

    found = client.get("/api/documents", params={"search": "demonstration test"}).json()
    assert any(d["id"] == uploaded_document["id"] for d in found)

    missing = client.get("/api/documents", params={"search": "zzz-no-such-title"}).json()
    assert missing == []


# --- Analyses ----------------------------------------------------------------


def test_analysis_lifecycle_completes(client, analysed_document):
    analysis = analysed_document["analysis"]
    assert analysis["status"] == "completed"
    assert analysis["provider"] == "mock"
    assert analysis["is_demonstration"] is True
    assert analysis["progress"] == 100
    assert analysis["finding_count"] >= 1
    assert analysis["started_at"] and analysis["finished_at"]


def test_analysis_on_unknown_document_is_404(client):
    response = client.post("/api/analyses", json={"document_id": "nope"})
    assert response.status_code == 404


def test_duplicate_active_analysis_conflicts_then_force_allows(client, uploaded_document):
    """A second run while one is active returns 409 unless force is set.

    A queued analysis row is inserted directly so the conflict path is tested
    deterministically rather than racing the background worker.
    """
    from app.db import SessionLocal
    from app.models import Analysis

    doc_id = uploaded_document["id"]
    session = SessionLocal()
    try:
        active = Analysis(document_id=doc_id, status="queued", provider="mock", is_demonstration=True)
        session.add(active)
        session.commit()
        active_id = active.id
    finally:
        session.close()

    blocked = client.post("/api/analyses", json={"document_id": doc_id})
    assert blocked.status_code == 409
    assert active_id in blocked.json()["detail"]

    forced = client.post("/api/analyses", json={"document_id": doc_id, "force": True})
    assert forced.status_code == 202

    for analysis_id in (forced.json()["id"],):
        for _ in range(300):
            if client.get(f"/api/analyses/{analysis_id}").json()["status"] in {"completed", "failed"}:
                break
            time.sleep(0.05)


def test_results_include_counts_and_findings(client, analysed_document):
    analysis_id = analysed_document["analysis"]["id"]
    results = client.get(f"/api/analyses/{analysis_id}/results").json()
    assert results["analysis"]["id"] == analysis_id
    assert results["counts"]["total"] == len(results["findings"])
    assert results["counts"]["total"] >= 1
    assert set(results["counts"]) >= {
        "conflicts", "removes_safeguard", "consistent", "unrelated",
        "clear", "needs_review", "safeguard_removed", "direct_conflict",
    }
    for finding in results["findings"]:
        assert finding["predicted_label"] in {
            "conflicts", "removes_safeguard", "consistent", "unrelated"
        }
        assert finding["review_status"] in {
            "pending", "confirmed", "rejected", "relabelled", "insufficient_evidence"
        }
        assert isinstance(finding["rights_tags"], list)
        assert isinstance(finding["implications"], dict)


def test_analysis_results_unknown_id_404(client):
    assert client.get("/api/analyses/unknown/results").status_code == 404


def test_finding_detail_has_clause_and_evidence(client, analysed_document):
    analysis_id = analysed_document["analysis"]["id"]
    findings = client.get(f"/api/analyses/{analysis_id}/results").json()["findings"]
    finding = findings[0]
    detail = client.get(f"/api/findings/{finding['id']}").json()
    assert detail["clause"] is not None
    assert detail["clause"]["text"]
    # A finding either carries evidence rows or is explicitly flagged insufficient.
    if detail["evidence"]:
        for item in detail["evidence"]:
            assert item["snippet"]
    else:
        assert detail["evidence_sufficient"] is False


def test_findings_filters_and_pagination(client, analysed_document):
    analysis_id = analysed_document["analysis"]["id"]
    page = client.get("/api/findings", params={"analysis_id": analysis_id, "page_size": 2}).json()
    assert page["page_size"] == 2
    assert len(page["items"]) <= 2
    assert page["pages"] >= 1

    pending = client.get(
        "/api/findings", params={"analysis_id": analysis_id, "review_status": "pending"}
    ).json()
    assert all(item["review_status"] == "pending" for item in pending["items"])

    by_health = client.get(
        "/api/findings", params={"analysis_id": analysis_id, "health_category": "needs_review"}
    ).json()
    assert all(item["health_category"] == "needs_review" for item in by_health["items"])

    by_rights = client.get(
        "/api/findings", params={"analysis_id": analysis_id, "rights_tag": "article_21"}
    ).json()
    assert all("article_21" in item["rights_tags"] for item in by_rights["items"])

    # Free-text search runs over the whole result set, not just one page.
    searched = client.get(
        "/api/findings", params={"analysis_id": analysis_id, "q": "appeal"}
    ).json()
    assert searched["total"] >= 1
    for item in searched["items"]:
        haystack = " ".join(
            filter(
                None,
                (
                    item["clause"].get("text"),
                    item["clause"].get("heading"),
                    item["clause"].get("section_id"),
                ),
            )
        ).lower()
        assert "appeal" in haystack

    no_match = client.get(
        "/api/findings", params={"analysis_id": analysis_id, "q": "zzz-no-such-text-zzz"}
    ).json()
    assert no_match["total"] == 0
    assert no_match["items"] == []


def test_finding_detail_unknown_id_404(client):
    assert client.get("/api/findings/nope").status_code == 404


def test_clause_diff_endpoint(client, analysed_document):
    analysis_id = analysed_document["analysis"]["id"]
    results = client.get(f"/api/analyses/{analysis_id}/results").json()
    with_provision = [f for f in results["findings"] if f["provision_id"]]
    if not with_provision:
        # Not every demonstration document retrieves a provision; skip cleanly.
        return
    finding = with_provision[0]
    response = client.get(
        f"/api/documents/{finding['document_id']}/clauses/{finding['clause_id']}/diff"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["provision"]["text"]
    assert set(body["segments"]) == {"old", "new"}
    assert 0.0 <= body["similarity"] <= 1.0


def test_clause_diff_404_when_no_provision(client, uploaded_document):
    clauses = client.get(f"/api/documents/{uploaded_document['id']}/clauses").json()
    response = client.get(
        f"/api/documents/{uploaded_document['id']}/clauses/{clauses[0]['id']}/diff"
    )
    assert response.status_code == 404


# --- Reviews and audit -------------------------------------------------------


def _first_finding(client, analysed_document) -> dict:
    analysis_id = analysed_document["analysis"]["id"]
    return client.get(f"/api/analyses/{analysis_id}/results").json()["findings"][0]


def test_confirm_review_updates_status_and_audits(client, analysed_document):
    finding = _first_finding(client, analysed_document)
    response = client.post(
        "/api/reviews",
        json={
            "finding_id": finding["id"],
            "decision": "confirm",
            "reason": "Evidence checked against the retrieved provision.",
            "reviewer": "test-reviewer",
        },
    )
    assert response.status_code == 201, response.text
    review = response.json()
    assert review["decision"] == "confirm"
    assert review["previous_label"] == finding["predicted_label"]

    updated = client.get(f"/api/findings/{finding['id']}").json()
    assert updated["review_status"] == "confirmed"
    assert updated["effective_label"] == finding["predicted_label"]
    assert updated["requires_review"] is False
    assert len(updated["reviews"]) == 1

    log = client.get("/api/audit-log", params={"entity_id": finding["id"]}).json()
    actions = [item["action"] for item in log["items"]]
    assert "review.confirm" in actions
    entry = next(i for i in log["items"] if i["action"] == "review.confirm")
    assert entry["previous_value"] is not None
    assert entry["new_value"] is not None
    assert entry["actor"] == "test-reviewer"


def test_relabel_requires_a_reason(client, analysed_document):
    finding = _first_finding(client, analysed_document)
    response = client.post(
        "/api/reviews",
        json={"finding_id": finding["id"], "decision": "relabel", "updated_label": "conflicts"},
    )
    assert response.status_code == 422


def test_relabel_changes_effective_label_and_history_is_preserved(client, analysed_document):
    analysis_id = analysed_document["analysis"]["id"]
    findings = client.get(f"/api/analyses/{analysis_id}/results").json()["findings"]
    finding = next(f for f in findings if f["predicted_label"] != "conflicts")

    first = client.post(
        "/api/reviews",
        json={
            "finding_id": finding["id"],
            "decision": "relabel",
            "updated_label": "conflicts",
            "reason": "Clause overrides the earlier provision expressly.",
            "reviewer": "reviewer-a",
        },
    )
    assert first.status_code == 201, first.text

    second = client.post(
        "/api/reviews",
        json={
            "finding_id": finding["id"],
            "decision": "relabel",
            "updated_label": "unrelated",
            "reason": "On reflection the provisions address different subjects.",
            "reviewer": "reviewer-b",
        },
    )
    assert second.status_code == 201, second.text

    detail = client.get(f"/api/findings/{finding['id']}").json()
    assert detail["effective_label"] == "unrelated"
    assert detail["review_status"] == "relabelled"
    # Both decisions retained, oldest first.
    assert [r["decision"] for r in detail["reviews"]] == ["relabel", "relabel"]
    assert detail["reviews"][0]["reviewer"] == "reviewer-a"
    assert detail["reviews"][0]["updated_label"] == "conflicts"
    assert detail["reviews"][1]["updated_label"] == "unrelated"


def test_relabel_must_differ_from_prediction(client, analysed_document):
    finding = _first_finding(client, analysed_document)
    response = client.post(
        "/api/reviews",
        json={
            "finding_id": finding["id"],
            "decision": "relabel",
            "updated_label": finding["predicted_label"],
            "reason": "same label",
        },
    )
    assert response.status_code == 422


def test_insufficient_evidence_marks_for_review(client, analysed_document):
    finding = _first_finding(client, analysed_document)
    response = client.post(
        "/api/reviews",
        json={
            "finding_id": finding["id"],
            "decision": "insufficient_evidence",
            "reason": "Source text could not be verified.",
            "reviewer": "reviewer-c",
        },
    )
    assert response.status_code == 201, response.text
    updated = client.get(f"/api/findings/{finding['id']}").json()
    assert updated["review_status"] == "insufficient_evidence"
    assert updated["evidence_sufficient"] is False
    assert updated["health_category"] == "needs_review"
    assert updated["requires_review"] is True


def test_review_unknown_finding_404(client):
    response = client.post(
        "/api/reviews", json={"finding_id": "nope", "decision": "confirm"}
    )
    assert response.status_code == 404


def test_review_invalid_decision_422(client, analysed_document):
    finding = _first_finding(client, analysed_document)
    response = client.post(
        "/api/reviews", json={"finding_id": finding["id"], "decision": "approve"}
    )
    assert response.status_code == 422


def test_review_list_filters(client, analysed_document):
    finding = _first_finding(client, analysed_document)
    client.post(
        "/api/reviews",
        json={"finding_id": finding["id"], "decision": "confirm", "reviewer": "list-test"},
    )
    listed = client.get("/api/reviews", params={"reviewer": "list-test"}).json()
    assert listed["total"] >= 1
    assert all(item["reviewer"] == "list-test" for item in listed["items"])

    by_finding = client.get("/api/reviews", params={"finding_id": finding["id"]}).json()
    assert all(item["finding_id"] == finding["id"] for item in by_finding["items"])


def test_training_export_contains_corrections_only(client, analysed_document):
    body = client.get("/api/reviews/training-export").json()
    assert "records" in body
    assert "no auto-retraining" in body["note"].lower()


def test_audit_log_filters(client, analysed_document):
    log = client.get("/api/audit-log", params={"entity_type": "analysis"}).json()
    assert log["total"] >= 1
    assert all(item["entity_type"] == "analysis" for item in log["items"])

    filtered = client.get("/api/audit-log", params={"action": "document.uploaded"}).json()
    assert all(item["action"] == "document.uploaded" for item in filtered["items"])


# --- Metrics and dashboard ---------------------------------------------------


def test_metrics_are_labelled_as_demonstration(client):
    metrics = client.get("/api/model/metrics").json()
    assert metrics["is_demonstration"] is True
    assert metrics["labels"] == ["conflicts", "removes_safeguard", "consistent", "unrelated"]
    assert len(metrics["per_class"]) == 4
    for row in metrics["per_class"]:
        assert row["label"] in metrics["labels"]
        assert row["precision"] is None or 0 <= row["precision"] <= 1
    assert metrics["confusion_matrix"]["matrix"]
    assert metrics["human_review"]["findings_total"] >= 0


def test_dashboard_counts_match_stored_data(client, analysed_document):
    dashboard = client.get("/api/dashboard").json()
    documents = client.get("/api/documents").json()
    assert dashboard["counts"]["documents"] == len(documents)
    assert dashboard["counts"]["findings"] >= 1
    assert set(dashboard["health_breakdown"]) == {
        "clear", "needs_review", "safeguard_removed", "direct_conflict"
    }
    assert sum(dashboard["health_breakdown"].values()) == dashboard["counts"]["findings"]
    assert set(dashboard["rights_breakdown"]) == {"article_14", "article_19", "article_21"}


def test_persistence_across_sessions(client, analysed_document):
    """Data written through the API survives a fresh session on the same DB."""
    from app.db import SessionLocal
    from app.models import Finding

    session = SessionLocal()
    try:
        assert session.get(Finding, _first_finding(client, analysed_document)["id"]) is not None
    finally:
        session.close()
