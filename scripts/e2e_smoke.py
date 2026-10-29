"""End-to-end check against the running server: the full user workflow."""
import io, json, sys, time, urllib.request, urllib.error

import os
BASE = os.environ.get("RRR_E2E_BASE", "http://127.0.0.1:8000/api")

def call(method, path, payload=None, raw=False, content_type=None, filename=None):
    data = None
    headers = {}
    if payload is not None:
        if raw:
            if filename:
                b = "----x"
                data = (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
                        f"Content-Type: application/pdf\r\n\r\n").encode() + payload + f"\r\n--{b}--\r\n".encode()
                content_type = f"multipart/form-data; boundary={b}"
            else:
                data = payload
            if content_type:
                headers["Content-Type"] = content_type
        else:
            data = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode()
            return r.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body

fails = []
def check(label, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"  {extra}" if extra and not cond else ""))
    if not cond: fails.append(label)

# Build a real PDF with reportlab (same library the seeder uses).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
from app.seed.demo_data import _text_to_pdf
bill = """THE DEMONSTRATION E2E TEST BILL (FICTIONAL)

1. Short title and commencement. This Act may be called the E2E Test Act (fictional).

2. Amendment of section 9. In section 9 of the Demonstration Protection of Livelihoods Act (fictional), the following shall be omitted, and no appeal shall lie against an order made under this Act.

3. Detention for verification. The authority may detain any person for verification and shall not be required to inform that person of the grounds of such detention, and such person shall not be entitled to consult any person.

4. Fees. The authority may prescribe the fees payable under this Act by notification.

5. Data sharing. The authority shall share personal data of applicants with any agency on request, without any requirement to inform the applicant.
"""
pdf = _text_to_pdf("Demonstration E2E Test Bill (fictional)", bill)

# --- Upload (multipart by hand) ---
boundary = "----e2e"
parts = []
parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"e2e.pdf\"\r\nContent-Type: application/pdf\r\n\r\n".encode() + pdf + b"\r\n")
for k, v in {"title": "E2E Uploaded Test Bill (fictional)", "legal_status": "proposed (fictional)", "version_label": "0.1"}.items():
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
parts.append(f"--{boundary}--\r\n".encode())
body = b"".join(parts)
status, doc = call("POST", "/documents", body, raw=True, content_type=f"multipart/form-data; boundary={boundary}")
check("upload returns 201", status == 201, f"got {status}: {doc}")
check("text extracted into clauses", doc.get("clause_count", 0) >= 3, doc.get("clause_count"))
check("document is NOT flagged demonstration", doc.get("is_demonstration") is False)
check("page count recorded", doc.get("page_count", 0) >= 1)

# --- Clause splitting preserves section ids ---
status, clauses = call("GET", f"/documents/{doc['id']}/clauses")
ids = [c.get("section_id") for c in clauses]
check("section identifiers preserved", {"2", "3", "4", "5"} & set(ids) == {"2", "3", "4", "5"}, ids)

# --- Analysis job lifecycle ---
status, ana = call("POST", "/analyses", {"document_id": doc["id"]})
check("analysis accepted (202)", status == 202, status)
analysis_id = ana["id"]
states = []
for _ in range(200):
    _, cur = call("GET", f"/analyses/{analysis_id}")
    if not states or states[-1] != cur["status"]:
        states.append(cur["status"])
    if cur["status"] in ("completed", "failed"):
        break
    time.sleep(0.1)
check("analysis completed", cur["status"] == "completed", cur.get("error"))
check("status progressed through queued/processing", set(states) & {"queued", "processing"} != set(), states)
check("findings persisted", cur["finding_count"] >= 3, cur["finding_count"])

# --- Results and labels ---
_, results = call("GET", f"/analyses/{analysis_id}/results")
labels = {f["predicted_label"] for f in results["findings"]}
check("labels drawn from the four-class set", labels <= {"conflicts", "removes_safeguard", "consistent", "unrelated"}, labels)
check("a removal prediction was produced", "removes_safeguard" in labels, labels)
check("counts consistent with findings", results["counts"]["total"] == len(results["findings"]))
check("health counts add up", sum(results["counts"][k] for k in ("clear","needs_review","safeguard_removed","direct_conflict")) == len(results["findings"]))
check("demonstration flagged on results", results["analysis"]["is_demonstration"] is True)

# --- Rights tagging ---
tagged = [f for f in results["findings"] if f["rights_tags"]]
check("rights tags applied where relevant", len(tagged) >= 1, [f["rights_tags"] for f in results["findings"]])
check("all tagged findings require review", all(f["requires_review"] for f in tagged))

# --- Evidence linkage ---
finding = next(f for f in results["findings"] if f["provision_id"])
_, detail = call("GET", f"/findings/{finding['id']}")
check("finding detail has clause text", bool(detail["clause"]["text"]))
check("finding carries evidence rows", len(detail["evidence"]) >= 1)
check("evidence links to a source title", all(e["source_title"] for e in detail["evidence"]))
check("demonstration sources are labelled", any(e["is_demonstration"] for e in detail["evidence"]))

# --- Diff ---
status, diff = call("GET", f"/documents/{doc['id']}/clauses/{finding['clause_id']}/diff")
check("diff endpoint works", status == 200 and "segments" in diff, status)
check("diff has both sides", set(diff["segments"]) == {"old", "new"})

# --- Review: confirm ---
status, rev = call("POST", "/reviews", {"finding_id": finding["id"], "decision": "confirm", "reason": "Verified against the retrieved provision.", "reviewer": "e2e-reviewer"})
check("confirm review created", status == 201, rev)
_, after = call("GET", f"/findings/{finding['id']}")
check("review status updated to confirmed", after["review_status"] == "confirmed")
check("effective label set", after["effective_label"] == finding["predicted_label"])

# --- Review: relabel (history preserved) ---
other = next(f for f in results["findings"] if f["predicted_label"] != "conflicts")
status, _ = call("POST", "/reviews", {"finding_id": other["id"], "decision": "relabel", "updated_label": "conflicts", "reason": "Overrides the earlier provision expressly.", "reviewer": "e2e-reviewer"})
check("relabel accepted", status == 201)
status, _ = call("POST", "/reviews", {"finding_id": other["id"], "decision": "relabel", "updated_label": "unrelated", "reason": "Second reviewer disagreed.", "reviewer": "e2e-reviewer-2"})
check("second relabel accepted", status == 201)
_, hist = call("GET", f"/findings/{other['id']}")
check("both decisions retained in order", [r["decision"] for r in hist["reviews"]] == ["relabel", "relabel"])
check("history preserves earlier label", hist["reviews"][0]["updated_label"] == "conflicts")
check("current label is the latest", hist["effective_label"] == "unrelated")

# --- Validation errors ---
status, err = call("POST", "/reviews", {"finding_id": other["id"], "decision": "relabel", "updated_label": "conflicts"})
check("relabel without reason rejected", status == 422, status)
status, err = call("POST", "/reviews", {"finding_id": "missing", "decision": "confirm"})
check("unknown finding returns 404", status == 404, status)
status, err = call("POST", "/analyses", {"document_id": "missing"})
check("unknown document returns 404", status == 404, status)
status, err = call("POST", "/documents", b"plain text, not a pdf", raw=True,
                   content_type="multipart/form-data; boundary=----x", filename="bad.pdf")
check("non-PDF upload rejected", status in (415, 422), status)

# --- Audit log ---
_, log = call("GET", "/audit-log", None)
actions = {i["action"] for i in log["items"]}
check("audit records uploads", "document.uploaded" in actions, sorted(actions))
check("audit records analysis completion", "analysis.completed" in actions, sorted(actions))
check("audit records reviews", {"review.confirm", "review.relabel"} <= actions, sorted(actions))
entry = next(i for i in log["items"] if i["action"] == "review.relabel")
check("audit stores previous value", bool(entry["previous_value"]))
check("audit stores new value", bool(entry["new_value"]))
check("audit stores actor", entry["actor"] == "e2e-reviewer-2", entry["actor"])

# --- Metrics ---
_, metrics = call("GET", "/model/metrics")
check("metrics labelled demonstration", metrics["is_demonstration"] is True)
check("per-class metrics for all four labels", len(metrics["per_class"]) == 4)
check("review decisions counted from stored rows", metrics["human_review"]["decisions"].get("relabel", 0) >= 2 and metrics["human_review"]["decisions"].get("confirm", 0) >= 1, metrics["human_review"])
check("review rate is a fraction", 0 <= metrics["human_review"]["review_rate"] <= 1, metrics["human_review"])

# --- Filters and pagination ---
_, paged = call("GET", "/findings?page=1&page_size=2")
check("pagination works", len(paged["items"]) <= 2 and paged["page_size"] == 2)
_, bylabel = call("GET", "/findings?label=removes_safeguard")
check("label filter works", all((f["effective_label"] or f["predicted_label"]) == "removes_safeguard" for f in bylabel["items"]))
_, byrights = call("GET", "/findings?rights_tag=article_21")
check("rights filter works", all("article_21" in f["rights_tags"] for f in byrights["items"]))
_, search = call("GET", "/documents?search=e2e")
check("document search works", any("E2E" in d["title"] for d in search))

print()
print(f"RESULT: {'ALL CHECKS PASSED' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
print("document_id", doc["id"], "analysis_id", analysis_id)
sys.exit(1 if fails else 0)
