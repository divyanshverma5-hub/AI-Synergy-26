"""Seeded demonstration data.

// MOCK DATA: everything in this module is fictional. The Acts, sections and
// clause text below are invented for demonstration and are NOT real Indian law.
// No real source URLs are attached, and every row is flagged
// `is_demonstration=True` so the UI labels it and it can never be mistaken for
// verified legal material.
//
// // TODO(LEGAL-DATA): replace this corpus with verified, citable provisions
// // from the real legal database, including canonical source links.
"""

from __future__ import annotations

import logging

from sqlalchemy import func, select

from ..db import session_scope
from ..models import Analysis, Document, ModelMetric, Provision
from ..services import analysis_runner
from ..services.clauses import split_clauses
from ..services.pdf_extract import extract_pdf

logger = logging.getLogger(__name__)

DEMONSTRATION_PROVISIONS: list[dict] = [
    {
        "act_title": "Demonstration Protection of Livelihoods Act (fictional)",
        "section_id": "Section 9",
        "heading": "Right of appeal against an order",
        "text": (
            "Any person aggrieved by an order made under this Act may, within thirty days "
            "from the date of communication of the order, prefer an appeal to the Appellate "
            "Authority. The Appellate Authority shall give the appellant a reasonable "
            "opportunity of being heard before disposing of the appeal. No order shall be "
            "given effect to until the period for preferring an appeal has expired."
        ),
        "legal_status": "in force",
        "document_date": "1971-01-01",
        "source_reference": "Fictional demonstration corpus entry; no real citation.",
        "source_url": None,
    },
    {
        "act_title": "Demonstration Protection of Livelihoods Act (fictional)",
        "section_id": "Section 14",
        "heading": "Exemption for small enterprises",
        "text": (
            "Nothing in this Act shall apply to an enterprise employing fewer than twenty "
            "persons, and such an enterprise shall be exempt from the registration and "
            "reporting requirements of this Act. The exemption shall not be construed as "
            "an exemption from any other law for the time being in force."
        ),
        "legal_status": "in force",
        "document_date": "1971-01-01",
        "source_reference": "Fictional demonstration corpus entry; no real citation.",
        "source_url": None,
    },
    {
        "act_title": "Demonstration Personal Liberty Safeguards Act (fictional)",
        "section_id": "Section 41",
        "heading": "Safeguards on detention",
        "text": (
            "No person shall be detained for a period exceeding twenty-four hours without "
            "being informed of the grounds of detention and without being afforded an "
            "opportunity to consult a legal practitioner of choice. Every detention shall be "
            "recorded and a copy of the record supplied to the person detained and to the "
            "nearest Magistrate. The person detained shall have a right to compensation for "
            "any detention that is not in accordance with law."
        ),
        "legal_status": "in force",
        "document_date": "1978-01-01",
        "source_reference": "Fictional demonstration corpus entry; no real citation.",
        "source_url": None,
    },
    {
        "act_title": "Demonstration Equality in Public Employment Act (fictional)",
        "section_id": "Section 5",
        "heading": "Non-discrimination in public employment",
        "text": (
            "No appointing authority shall discriminate against any person on grounds of "
            "religion, race, caste, sex, descent, place of birth or residence in any matter "
            "relating to public employment. Any classification of candidates shall be based "
            "on a reasonable classification having a rational nexus with the object sought "
            "to be achieved, and shall not be arbitrary."
        ),
        "legal_status": "in force",
        "document_date": "1983-01-01",
        "source_reference": "Fictional demonstration corpus entry; no real citation.",
        "source_url": None,
    },
    {
        "act_title": "Demonstration Freedom of Expression Act (fictional)",
        "section_id": "Section 12",
        "heading": "Regulation of publication",
        "text": (
            "No restriction shall be imposed on the freedom of speech and expression of any "
            "person except by a law imposing reasonable restrictions in the interests of the "
            "sovereignty and integrity of India, the security of the State, friendly "
            "relations with foreign States, public order, decency or morality. Every order "
            "imposing a restriction shall record the reasons in writing and shall be subject "
            "to review."
        ),
        "legal_status": "in force",
        "document_date": "1986-01-01",
        "source_reference": "Fictional demonstration corpus entry; no real citation.",
        "source_url": None,
    },
    {
        "act_title": "Demonstration Public Procurement Act (fictional)",
        "section_id": "Section 22",
        "heading": "Grievance redressal",
        "text": (
            "A bidder aggrieved by a decision of the procuring entity may file a complaint "
            "before the Grievance Redressal Committee within fifteen days. The Committee "
            "shall dispose of the complaint within sixty days after giving the parties a "
            "hearing. The decision of the Committee shall be reasoned and shall be published."
        ),
        "legal_status": "in force",
        "document_date": "2012-01-01",
        "source_reference": "Fictional demonstration corpus entry; no real citation.",
        "source_url": None,
    },
]

# Fictional draft bills, written so the demonstration heuristics produce a mix of
# the four labels. Clause 3 removes an appeal right, clause 4 conflicts with an
# earlier provision, clause 6 touches personal liberty, clause 7 is unrelated.
DEMONSTRATION_BILL = """THE DEMONSTRATION STREAMLINING OF LICENSING BILL (FICTIONAL)
A BILL to streamline licensing procedures and to amend certain provisions relating to appeals.

CHAPTER I
PRELIMINARY

1. Short title and commencement. This Act may be called the Demonstration Streamlining of Licensing Act (fictional), and it shall come into force on such date as the appropriate authority may appoint by notification.

2. Definitions. In this Act, unless the context otherwise requires, "licensing authority" means an authority empowered to grant a licence under this Act, and "applicant" means a person who has applied for a licence.

CHAPTER II
AMENDMENTS TO EXISTING PROVISIONS

3. Amendment of section 9. In section 9 of the Demonstration Protection of Livelihoods Act (fictional), the following shall be omitted, namely, the words "and the appellant shall have a right to be heard", and no appeal shall lie against an order made under this Act except with the leave of the licensing authority.

4. Licensing authority to prevail. Notwithstanding anything contained in section 22 of the Demonstration Public Procurement Act (fictional), a decision of the licensing authority shall prevail over and shall override any decision of the Grievance Redressal Committee, and any proceeding before that Committee shall be deemed to be inconsistent with this Act.

5. Time limit for disposal. The licensing authority shall dispose of every application within ninety days from the date of receipt of the application, and where it fails to do so, the application shall be deemed to have been allowed.

CHAPTER III
SPECIAL PROVISIONS

6. Verification of applicants. The licensing authority may require any applicant to appear in person for verification, and may detain such applicant at the office of the licensing authority for such period as may be necessary for verification, and the applicant shall not be entitled to consult any person during such verification.

7. Fees. The licensing authority may by notification prescribe the fees payable for the grant and renewal of a licence, and the fees so prescribed shall be published on the official website of the authority.

8. Repeal and savings. Any rule made under the enactment hereby replaced shall continue in force until superseded by rules made under this Act.
"""

DEMONSTRATION_BILL_TWO = """THE DEMONSTRATION DIGITAL SERVICES REGULATION BILL (FICTIONAL)
A BILL to regulate the provision of digital services.

1. Short title and commencement. This Act may be called the Demonstration Digital Services Regulation Act (fictional), and it shall come into force on the appointed date.

2. Registration of service providers. Every service provider shall register with the regulator within sixty days of the commencement of this Act.

3. Blocking of content. The regulator may, by order, block access to any content where it is satisfied that such content is necessary to be blocked in the interests of public order, and no appeal shall lie against an order of blocking, and the reasons for the order shall not be disclosed.

4. Exemption for small providers. Nothing in this Act shall apply to a service provider with fewer than five hundred users, and such a provider shall be exempt from the registration requirement under section 2.

5. Data retention. Every service provider shall retain user data for a period of ninety days and shall disclose such data to the regulator on request, without any requirement to inform the user of the disclosure.

6. Grievance officer. Every service provider shall appoint a grievance officer and shall dispose of every grievance within thirty days of its receipt, and the grievance officer shall publish a quarterly report of grievances received and disposed of.

7. Power to make rules. The regulator may make rules to carry out the purposes of this Act.
"""


def seed() -> None:
    """Idempotently seed demonstration provisions, bills, analyses and metrics."""
    with session_scope() as session:
        already = session.scalar(select(func.count(Provision.id))) or 0
        if already:
            logger.info("Seed data already present; skipping.")
            return
        for entry in DEMONSTRATION_PROVISIONS:
            session.add(Provision(is_demonstration=True, **entry))
        _seed_metrics(session)
    logger.info("Seeded %s demonstration provisions.", len(DEMONSTRATION_PROVISIONS))
    _seed_bill("Demonstration Streamlining of Licensing Bill (fictional)", DEMONSTRATION_BILL)
    _seed_bill("Demonstration Digital Services Regulation Bill (fictional)", DEMONSTRATION_BILL_TWO)


def _seed_metrics(session) -> None:
    """// MOCK METRICS: Replace with the actual model evaluation report.

    These numbers are placeholders so the metrics dashboard renders. They are
    flagged `is_demonstration=True` and the UI shows a demonstration banner.
    """
    from ..services import audit

    demo = {
        "model_version": "demo-0.1",
        "per_class": {
            "conflicts": (0.72, 0.68, 0.70, 64),
            "removes_safeguard": (0.69, 0.74, 0.71, 58),
            "consistent": (0.81, 0.79, 0.80, 132),
            "unrelated": (0.88, 0.90, 0.89, 246),
        },
        "aggregates": {
            "macro_f1": 0.775,
            "accuracy": 0.842,
            "micro_f1": 0.842,
            "test_set_size": 500,
            "confusion_matrix": {
                "labels": ["conflicts", "removes_safeguard", "consistent", "unrelated"],
                "matrix": [
                    [43, 11, 4, 6],
                    [9, 43, 2, 4],
                    [6, 5, 104, 17],
                    [2, 3, 20, 221],
                ],
            },
            "retrieval_recall_at_k": {"k": 5, "recall": 0.83, "note": "Demonstration value."},
        },
    }
    for label, (precision, recall, f1, support) in demo["per_class"].items():
        session.add(
            ModelMetric(
                model_name="relationship-classifier",
                model_version=demo["model_version"],
                label=label,
                precision=precision,
                recall=recall,
                f1=f1,
                support=support,
                is_demonstration=True,
            )
        )
    audit.record(
        session,
        action="metrics.imported",
        entity_type="model_metrics",
        entity_id=demo["model_version"],
        new_value={"model_version": demo["model_version"]},
        reason="Demonstration metrics seeded at startup",
        context=demo["aggregates"],
    )


def _seed_bill(title: str, text: str) -> None:
    """Create a demonstration document and run an analysis over it.

    Reuses the real upload pipeline (PDF -> extract -> split -> analyse) so the
    seeded state is produced by exactly the same code path as a user upload.
    """
    with session_scope() as session:
        existing = session.scalars(select(Document).where(Document.title == title)).first()
        if existing is not None:
            return

    pdf_bytes = _text_to_pdf(title, text)
    extraction = extract_pdf(pdf_bytes)

    page_offsets: list[tuple[int, int, int]] = []
    cursor = 0
    for page in extraction.pages:
        page_offsets.append((page.page_number, cursor, cursor + len(page.text)))
        cursor += len(page.text) + 1

    with session_scope() as session:
        document = Document(
            title=title,
            filename=f"{title[:40]}.pdf",
            content_type="application/pdf",
            file_size=len(pdf_bytes),
            status="uploaded",
            text=extraction.text,
            page_count=extraction.page_count,
            is_demonstration=True,
            version_label="1.0 (demonstration)",
            document_date=None,
            legal_status="proposed (fictional)",
            source_reference="Generated demonstration document; not a real bill.",
        )
        session.add(document)
        session.flush()
        for split in split_clauses(extraction.text, page_offsets):
            from ..models import Clause

            document.clauses.append(
                Clause(
                    ordinal=split.ordinal,
                    section_id=split.section_id,
                    heading=split.heading,
                    text=split.text,
                    char_start=split.char_start,
                    char_end=split.char_end,
                    page_number=split.page_number,
                )
            )
        document_id = document.id

    analysis = analysis_runner.create_analysis(document_id, "mock")
    analysis_runner.submit(analysis.id)
    analysis_runner.wait_for(analysis.id, timeout=60)
    logger.info("Seeded demonstration bill: %s", title)


def _text_to_pdf(title: str, text: str) -> bytes:
    """Render demonstration text to a PDF with reportlab."""
    from io import BytesIO

    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left, top = 54, height - 60
    line_height = 14
    y = top

    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(left, y, title[:90])
    y -= line_height * 2
    pdf.setFont("Helvetica", 9.5)

    for raw_line in text.split("\n"):
        for line in _wrap(raw_line, 92):
            if y < 60:
                pdf.showPage()
                pdf.setFont("Helvetica", 9.5)
                y = top
            pdf.drawString(left, y, line)
            y -= line_height
    pdf.save()
    return buffer.getvalue()


def _wrap(line: str, width: int) -> list[str]:
    if not line.strip():
        return [""]
    words = line.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines
