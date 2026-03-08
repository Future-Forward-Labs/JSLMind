# Phase 4 — Hybrid RAG on JSL Docs: Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-quality Hybrid RAG pipeline that indexes 20 synthetic JSL documents and answers natural-language queries with source citations, exposed through Kong at `POST /rag/query`.

**Architecture:** Camel `file://` watcher detects new docs in `./rag/docs/incoming/`, POSTs the path to `POST /ingest` on the `rag-service`, which parses with `unstructured`, embeds with BGE-M3 (via LiteLLM `jsl-embed`), stores in Qdrant (dense) and a BM25 pickle (sparse). `POST /query` fuses both via RRF, sends the top-8 chunks to `jsl-quality` (LiteLLM → Mistral/Claude), and returns an answer with per-source citations.

**Tech Stack:** Python 3.11, FastAPI, qdrant-client, rank-bm25, unstructured[pdf,docx], reportlab, python-docx, httpx, pytest; Java 21, Apache Camel 4.x SpringBoot, camel-file + camel-http components.

---

## Task 1: Synthetic Document Corpus Generator

**Goal:** Generate 20 realistic JSL-like PDF and Word documents so the demo has something to index.

**Files:**
- Create: `rag/docs/generate_corpus.py`
- Create: `rag/docs/incoming/.gitkeep`

**Step 1: Install generation deps locally (outside Docker)**

```bash
pip install reportlab python-docx
```

**Step 2: Create the corpus generator**

Create `rag/docs/generate_corpus.py`:

```python
"""
Generate 20 synthetic JSL stainless steel documents for the RAG demo corpus.
Produces PDF files (via reportlab) and Word files (via python-docx).

Usage:
    python rag/docs/generate_corpus.py
Output:
    rag/docs/corpus/ — 20 files ready for RAG indexing
"""

import os
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)
from reportlab.lib import colors
from docx import Document

OUTPUT_DIR = Path(__file__).parent / "corpus"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ── Chemical composition data (real-world values) ─────────────────────────
GRADE_SPECS = {
    "304": {
        "elements": [
            ("Carbon (C)", "max 0.08%"),
            ("Chromium (Cr)", "18.0–20.0%"),
            ("Nickel (Ni)", "8.0–10.5%"),
            ("Manganese (Mn)", "max 2.0%"),
            ("Silicon (Si)", "max 0.75%"),
            ("Phosphorus (P)", "max 0.045%"),
            ("Sulphur (S)", "max 0.030%"),
        ],
        "tensile_strength": "515 MPa min",
        "yield_strength": "205 MPa min",
        "hardness": "92 HRB max",
        "elongation": "40% min",
    },
    "316L": {
        "elements": [
            ("Carbon (C)", "max 0.03%"),
            ("Chromium (Cr)", "16.0–18.0%"),
            ("Nickel (Ni)", "10.0–14.0%"),
            ("Molybdenum (Mo)", "2.0–3.0%"),
            ("Manganese (Mn)", "max 2.0%"),
            ("Silicon (Si)", "max 0.75%"),
            ("Phosphorus (P)", "max 0.045%"),
            ("Sulphur (S)", "max 0.030%"),
        ],
        "tensile_strength": "485 MPa min",
        "yield_strength": "170 MPa min",
        "hardness": "95 HRB max",
        "elongation": "40% min",
    },
    "430": {
        "elements": [
            ("Carbon (C)", "max 0.12%"),
            ("Chromium (Cr)", "16.0–18.0%"),
            ("Manganese (Mn)", "max 1.0%"),
            ("Silicon (Si)", "max 1.0%"),
            ("Phosphorus (P)", "max 0.040%"),
            ("Sulphur (S)", "max 0.030%"),
        ],
        "tensile_strength": "450 MPa min",
        "yield_strength": "205 MPa min",
        "hardness": "88 HRB max",
        "elongation": "22% min",
    },
}

SURFACE_FINISH = {
    "304": "2B (cold rolled, annealed, pickled) — Ra ≤ 0.5 µm",
    "316L": "2B (cold rolled, annealed, pickled) — Ra ≤ 0.5 µm; BA option available",
    "430": "2B (cold rolled, annealed, pickled) — Ra ≤ 0.8 µm",
}


def _pdf_styles():
    styles = getSampleStyleSheet()
    heading1 = ParagraphStyle(
        "H1",
        parent=styles["Heading1"],
        fontSize=14,
        spaceAfter=10,
    )
    body = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=10,
        spaceAfter=6,
    )
    return heading1, body


def _make_table(data, col_widths=None):
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3a5c")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f4f8")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


# ── Grade Specification PDFs ──────────────────────────────────────────────
def generate_grade_spec(grade: str):
    spec = GRADE_SPECS[grade]
    path = OUTPUT_DIR / f"Grade_{grade}_Specification.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    h1, body = _pdf_styles()
    story = []

    story.append(Paragraph(f"Jindal Stainless Limited — Grade {grade} Specification", h1))
    story.append(Paragraph(f"Document No: JSL-SPEC-{grade}-2025 | Rev: 03 | Date: 2025-01-15", body))
    story.append(Spacer(1, 12))

    story.append(Paragraph("1. Scope", h1))
    story.append(Paragraph(
        f"This specification defines the chemical composition, mechanical properties, "
        f"and surface finish requirements for JSL Grade {grade} stainless steel "
        f"cold-rolled coil and sheet.", body))
    story.append(Spacer(1, 8))

    story.append(Paragraph("2. Applicable Standards", h1))
    story.append(Paragraph(
        "ASTM A240 / A240M | EN 10088-2 | IS 6911 | JIS G4304", body))
    story.append(Spacer(1, 8))

    story.append(Paragraph("3.1 Product Forms", h1))
    story.append(Paragraph(
        "Cold-rolled coil, sheet, and strip. Thickness range: 0.3 mm – 6.0 mm. "
        "Width range: 600 mm – 1600 mm.", body))

    story.append(Paragraph("3.2 Chemical Composition", h1))
    table_data = [["Element", "Requirement"]] + list(spec["elements"])
    story.append(_make_table(table_data, col_widths=[8*cm, 8*cm]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("4. Mechanical Properties", h1))
    mech_data = [
        ["Property", "Requirement"],
        ["Tensile Strength (Rm)", spec["tensile_strength"]],
        ["0.2% Proof Strength (Rp0.2)", spec["yield_strength"]],
        ["Elongation (A50mm)", spec["elongation"]],
        ["Hardness", spec["hardness"]],
    ]
    story.append(_make_table(mech_data, col_widths=[8*cm, 8*cm]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("5. Surface Finish", h1))
    story.append(Paragraph(SURFACE_FINISH[grade], body))
    story.append(Spacer(1, 8))

    story.append(Paragraph("6. Inspection & Testing", h1))
    story.append(Paragraph(
        "Each coil shall be subject to: (a) Chemical analysis per heat, "
        "(b) Mechanical testing per lot, (c) Visual surface inspection 100%, "
        "(d) Dimensional verification per coil.", body))

    doc.build(story)
    print(f"  ✓ {path.name}")


# ── SOP PDFs ─────────────────────────────────────────────────────────────
SOP_CONTENT = {
    "Pickling": {
        "purpose": "Remove oxide scale and restore corrosion resistance after annealing.",
        "steps": [
            ("1. Pre-rinse", "Rinse strip surface with demineralised water at 40–50°C for 30 seconds."),
            ("2. Acid bath entry", "Enter pickling section at line speed 15–25 m/min. Bath composition: HNO3 10–15%, HF 1–3%, temp 50–60°C."),
            ("3. Dwell time", "Minimum dwell: 45 seconds. Increase to 90s for heavy scale or Grade 430."),
            ("4. Rinse cascade", "3-stage counter-current rinse with pH ≤ 7.0 at final stage."),
            ("5. Passivation check", "Verify Ferroxyl test negative on 3 sample points per coil."),
            ("6. Dry-off", "Hot air knife at 80°C, ±5°C. Strip must be moisture-free before coiling."),
        ],
        "safety": "PPE mandatory: acid-resistant gloves, face shield, apron. Emergency shower within 10m.",
    },
    "Cold_Rolling": {
        "purpose": "Reduce strip thickness to target gauge with controlled surface finish.",
        "steps": [
            ("1. Roll gap setup", "Set initial roll gap via AGC system. Reference: setup sheet JSL-CR-SETUP-001."),
            ("2. Tension control", "Entry tension: 30–50 N/mm². Exit tension: 50–80 N/mm²."),
            ("3. Reduction ratio", "Max single-pass reduction: 35% for 304/316L, 30% for 430."),
            ("4. Roll force monitoring", "Alert if roll force exceeds 2500 T. Stop mill if >2800 T."),
            ("5. Surface roughness", "Measure Ra every 500m. Target: 0.3–0.5 µm for 2B finish."),
            ("6. Flatness control", "I-unit target ≤ 5 for coil grades. Increase tension if >8 I-unit."),
        ],
        "safety": "Lockout-tagout procedure mandatory for all roll changes. Minimum 2 operators required.",
    },
}

def generate_sop(sop_type: str, grade: str):
    sop = SOP_CONTENT[sop_type]
    safe_type = sop_type.replace("_", " ")
    path = OUTPUT_DIR / f"SOP_{sop_type}_{grade}.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    h1, body = _pdf_styles()
    story = []

    story.append(Paragraph(
        f"Standard Operating Procedure — {safe_type} Line (Grade {grade})", h1))
    story.append(Paragraph(
        f"Doc No: JSL-SOP-{sop_type[:3].upper()}-{grade}-2025 | Rev: 02", body))
    story.append(Spacer(1, 12))

    story.append(Paragraph("1. Purpose", h1))
    story.append(Paragraph(sop["purpose"], body))

    story.append(Paragraph("2. Scope", h1))
    story.append(Paragraph(
        f"Applies to all operators on the {safe_type} line processing Grade {grade} "
        f"stainless steel coil at JSL Hisar Works (Plant: JSL1, WERKS: JSL1).", body))

    story.append(Paragraph("3. Procedure Steps", h1))
    for step_name, step_desc in sop["steps"]:
        story.append(Paragraph(f"<b>{step_name}:</b> {step_desc}", body))

    story.append(Paragraph("4. Safety Requirements", h1))
    story.append(Paragraph(sop["safety"], body))

    story.append(Paragraph("5. Quality Records", h1))
    story.append(Paragraph(
        "Record all process parameters in SAP PM Work Order (AUFNR) linked to "
        "production order. Attach Ferroxyl / roughness test results as DMS attachments.", body))

    doc.build(story)
    print(f"  ✓ {path.name}")


# ── Maintenance Manuals (Word) ─────────────────────────────────────────────
MAINTENANCE_MANUALS = {
    "Annealing_Furnace": {
        "equipment_id": "EQ-ANN-001",
        "pm_schedule": [
            ("Daily", "Check burner flame pattern, thermocouple readings ±5°C accuracy"),
            ("Weekly", "Inspect refractory lining for cracks; clean recuperator fins"),
            ("Monthly", "Replace worn burner nozzles; calibrate O2 trim control"),
            ("Quarterly", "Full refractory inspection; replace damaged sections"),
            ("Annual", "Complete furnace reline; replace all thermocouples"),
        ],
        "bearing_replacement": "SKF 6316 bearings on hearth roll drives — replace every 8,000 hrs or if vibration > 4.5 mm/s RMS.",
        "lubrication": "Shell Omala S4 GX 220 for hearth roll gearboxes — change interval: 4,000 hrs.",
    },
    "Pickling_Line": {
        "equipment_id": "EQ-PCK-002",
        "pm_schedule": [
            ("Daily", "Check acid concentration: HNO3 10–15%, HF 1–3%. Titration every shift."),
            ("Weekly", "Inspect tank linings and joints for acid seepage"),
            ("Monthly", "Clean all rinse nozzles; check pH probe calibration"),
            ("Quarterly", "Replace all pump mechanical seals; inspect ventilation ducting"),
            ("Annual", "Full tank inspection and reline with acid-resistant coating"),
        ],
        "bearing_replacement": "FAG 22222-E1 spherical roller bearings on rinse mangle rolls — replace every 10,000 hrs.",
        "lubrication": "Castrol Tribol GR 100-2 PD for mangle roll bearings — relubricate every 500 hrs.",
    },
    "Rolling_Mill": {
        "equipment_id": "EQ-CRM-003",
        "pm_schedule": [
            ("Daily", "Check roll coolant flow rate ≥ 800 L/min; inspect strip tracking"),
            ("Weekly", "Measure work roll surface roughness; schedule regrind if Ra > 0.8 µm"),
            ("Monthly", "Inspect AGC hydraulics; check backup roll chock bearings"),
            ("Quarterly", "Full drive spindle inspection; check gear tooth wear"),
            ("Annual", "Mill stand alignment check; replace all chock seals"),
        ],
        "bearing_replacement": "NSK 239/800CAE4 for backup roll chocks — replace every 15,000 hrs or if clearance > 0.3 mm.",
        "lubrication": "Mobil Gear 600 XP 320 for main drive gearbox — change interval: 6,000 hrs.",
    },
}

def generate_maintenance_manual(equipment: str):
    manual = MAINTENANCE_MANUALS[equipment]
    safe_name = equipment.replace("_", " ")
    path = OUTPUT_DIR / f"Maintenance_Manual_{equipment}.docx"
    doc = Document()

    doc.add_heading(f"JSL Maintenance Manual — {safe_name}", 0)
    doc.add_paragraph(
        f"Equipment ID: {manual['equipment_id']} | Plant: JSL1 | "
        f"Doc: JSL-MM-{equipment[:3].upper()}-2025 | Rev: 01"
    )

    doc.add_heading("1. Preventive Maintenance Schedule", level=1)
    table = doc.add_table(rows=1, cols=2)
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    hdr[0].text = "Frequency"
    hdr[1].text = "Task"
    for freq, task in manual["pm_schedule"]:
        row = table.add_row().cells
        row[0].text = freq
        row[1].text = task

    doc.add_heading("2. Bearing Replacement", level=1)
    doc.add_paragraph(manual["bearing_replacement"])

    doc.add_heading("3. Lubrication", level=1)
    doc.add_paragraph(manual["lubrication"])

    doc.add_heading("4. SAP PM Integration", level=1)
    doc.add_paragraph(
        f"All maintenance activities must be logged against SAP PM Work Order "
        f"(AUFNR) for equipment {manual['equipment_id']}. Use transaction IW31 "
        f"to create corrective orders. Preventive orders auto-generated by "
        f"maintenance plan (WERKS: JSL1)."
    )

    doc.save(str(path))
    print(f"  ✓ {path.name}")


# ── QC Inspection Checklists ──────────────────────────────────────────────
QC_CRITERIA = {
    "304": {
        "thickness_tol": "±0.05 mm for t ≤ 2mm; ±0.08 mm for t > 2mm",
        "width_tol": "+0 / -3 mm",
        "defect_limit": "No pits > 0.3 mm depth; no scratches > 0.2 mm depth; ≤ 2 edge marks per coil",
        "coil_weight_max": "20,000 kg",
    },
    "316L": {
        "thickness_tol": "±0.05 mm for t ≤ 2mm; ±0.08 mm for t > 2mm",
        "width_tol": "+0 / -3 mm",
        "defect_limit": "No pits > 0.2 mm depth; no scratches > 0.15 mm depth; zero edge marks for medical grade",
        "coil_weight_max": "18,000 kg",
    },
    "430": {
        "thickness_tol": "±0.06 mm for t ≤ 2mm; ±0.10 mm for t > 2mm",
        "width_tol": "+0 / -4 mm",
        "defect_limit": "No pits > 0.4 mm depth; no scratches > 0.25 mm depth; ≤ 3 edge marks per coil",
        "coil_weight_max": "22,000 kg",
    },
}

def generate_qc_checklist(grade: str):
    criteria = QC_CRITERIA[grade]
    path = OUTPUT_DIR / f"QC_Inspection_Checklist_{grade}.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    h1, body = _pdf_styles()
    story = []

    story.append(Paragraph(f"QC Inspection Checklist — Grade {grade} Cold-Rolled Coil", h1))
    story.append(Paragraph(f"Form No: JSL-QC-{grade}-CHECK | Rev: 04 | Dept: Quality Assurance", body))
    story.append(Spacer(1, 12))

    story.append(Paragraph("1. Dimensional Checks", h1))
    dim_data = [
        ["Parameter", "Acceptance Criteria"],
        ["Thickness tolerance", criteria["thickness_tol"]],
        ["Width tolerance", criteria["width_tol"]],
        ["Max coil weight", criteria["coil_weight_max"]],
    ]
    story.append(_make_table(dim_data, col_widths=[8*cm, 8*cm]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("2. Surface Defect Acceptance Criteria", h1))
    story.append(Paragraph(criteria["defect_limit"], body))
    story.append(Spacer(1, 8))

    story.append(Paragraph("3. Visual Inspection Method", h1))
    story.append(Paragraph(
        "100% visual inspection under 1000 lux fluorescent lighting. "
        "Inspector traverses coil at 5 m/min. Mark defect locations with chalk. "
        "Photograph all reject defects. Log in SAP QM notification (QMEL).", body))

    story.append(Paragraph("4. Sampling for Mechanical Testing", h1))
    story.append(Paragraph(
        "One sample per lot (max 10 coils same heat). "
        "Tensile test per ASTM E8/E8M. Hardness per ASTM E18.", body))

    doc.build(story)
    print(f"  ✓ {path.name}")


# ── SAP Process SOPs ─────────────────────────────────────────────────────
def generate_sap_sop(process: str, content: dict):
    path = OUTPUT_DIR / f"SAP_{process}_SOP.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    h1, body = _pdf_styles()
    story = []
    story.append(Paragraph(content["title"], h1))
    story.append(Paragraph(content["docno"], body))
    story.append(Spacer(1, 12))
    for section_title, section_body in content["sections"]:
        story.append(Paragraph(section_title, h1))
        story.append(Paragraph(section_body, body))
        story.append(Spacer(1, 6))
    doc.build(story)
    print(f"  ✓ {path.name}")


SAP_SOPS = {
    "MM_Procurement": {
        "title": "SAP MM — Procurement SOP for Stainless Steel Raw Materials",
        "docno": "Doc: JSL-SAP-MM-001 | Module: MM | T-codes: ME21N, ME23N, MIGO",
        "sections": [
            ("1. Purchase Order Creation (ME21N)",
             "Raise PO against approved vendor. Key fields: EBELN (PO number), EBELP (line item), "
             "MATNR (material: e.g. STL-304-CR-2MM), MENGE (qty in MT), MEINS (UoM: MT), "
             "NETPR (net price INR/MT), WERKS (plant: JSL1)."),
            ("2. Goods Receipt (MIGO — 101)",
             "Post GR against PO. Movement type 101. "
             "System creates material document (MBLNR) and accounting document. "
             "Stock updates in unrestricted use (MARA-LABST)."),
            ("3. Invoice Verification (MIRO)",
             "Match vendor invoice to PO and GR. "
             "3-way match: PO price vs GR quantity vs invoice value. "
             "Post to AP if within tolerance ±2%."),
            ("4. Key SAP Tables",
             "MARA: Material master. EKKO: PO header. EKPO: PO item. "
             "MSEG: Material document segments. BSEG: Accounting document segments."),
        ],
    },
    "CO_Costing": {
        "title": "SAP CO — Production Order Costing Guide",
        "docno": "Doc: JSL-SAP-CO-001 | Module: CO-PC | T-codes: KKF6N, CO03, KKBC_ORD",
        "sections": [
            ("1. Production Order Cost Estimate",
             "Cost estimate calculated at order creation (AUFK). "
             "Planned cost = BOM components (RESB) + routing operations (AFVC). "
             "Key field: AUFNR (order number), MATNR (finished material), GAMNG (order qty)."),
            ("2. Actual Cost Posting",
             "Goods issue (MIGO-261) posts material cost to order. "
             "Confirmation (CO11N) posts activity costs (machine time, labour). "
             "Overhead applied by costing sheet."),
            ("3. Variance Analysis",
             "Run KKS2 to settle variances to cost centres. "
             "Price variance = actual vs standard price. "
             "Quantity variance = actual vs planned consumption."),
            ("4. Cost Variance Thresholds",
             "Alert threshold: variance > 5% of standard cost OR > INR 50,000 per order. "
             "Escalate to Plant Controller if variance > 10% for 3 consecutive months."),
        ],
    },
    "PM_Work_Order": {
        "title": "SAP PM — Maintenance Work Order SOP",
        "docno": "Doc: JSL-SAP-PM-001 | Module: PM | T-codes: IW31, IW32, IW41",
        "sections": [
            ("1. Create Corrective Work Order (IW31)",
             "Order type: PM01 (corrective). WERKS: JSL1. "
             "Enter equipment number (EQUNR) and functional location (TPLNR). "
             "Describe breakdown in short text. Assign to maintenance planner group."),
            ("2. Plan and Release",
             "Add operations (AFVC): work centre, duration, activity type. "
             "Assign materials from spare parts store (reservation). "
             "Release order (AUFNR status: REL) to enable time confirmation."),
            ("3. Time Confirmation (IW41)",
             "Actual hours entered per operation. "
             "Causes of failure: breakage (B1), wear (W2), corrosion (C3). "
             "System posts actual costs to order."),
            ("4. Technical Completion",
             "Set order to TECO when work complete. "
             "Settlement run (KO88) transfers costs to cost centre or asset. "
             "MTTR and MTBF updated automatically in equipment master."),
        ],
    },
}


# ── Policy PDFs ───────────────────────────────────────────────────────────
def generate_policy_doc(filename: str, title: str, docno: str, sections: list):
    path = OUTPUT_DIR / filename
    doc_obj = SimpleDocTemplate(str(path), pagesize=A4,
                                leftMargin=2*cm, rightMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
    h1, body = _pdf_styles()
    story = []
    story.append(Paragraph(title, h1))
    story.append(Paragraph(docno, body))
    story.append(Spacer(1, 12))
    for sec_title, sec_body in sections:
        story.append(Paragraph(sec_title, h1))
        story.append(Paragraph(sec_body, body))
        story.append(Spacer(1, 6))
    doc_obj.build(story)
    print(f"  ✓ {path.name}")


POLICY_DOCS = [
    (
        "JSL_Safety_Standards_2025.pdf",
        "JSL Safety Standards — Industrial Operations 2025",
        "Doc: JSL-HSE-001 | Rev: 05 | Effective: 2025-01-01",
        [
            ("1. Chemical Handling Thresholds",
             "Hydrofluoric acid (HF): TLV-TWA 0.5 ppm. Nitric acid (HNO3): TLV-TWA 2 ppm. "
             "Mandatory continuous gas monitoring in pickling bay. Alarm at 50% TLV."),
            ("2. Machine Guarding",
             "All rotating equipment ≥ 50 rpm must have fixed guards. "
             "Pinch point distance: min 120 mm from nearest fixed structure. "
             "Guards removed only under LOTO procedure JSL-LOTO-STD-001."),
            ("3. Emergency Response",
             "Chemical spill: activate ERP, evacuate 20m radius, call ext. 999. "
             "Acid burn: flush with water 15 min minimum. Do not neutralise. "
             "AED locations: every production bay, max 3-minute walk."),
            ("4. Incident Reporting",
             "All incidents (near-miss and above) reported in SAP PM notification (QMEL) "
             "within 1 hour. LTI investigation completed within 24 hours. "
             "Monthly safety KPIs reported to plant head."),
        ],
    ),
    (
        "Environmental_Compliance_Report_2025.pdf",
        "JSL Environmental Compliance Report — FY 2025",
        "Doc: JSL-ENV-RPT-2025 | Prepared: Quality & Environment Dept",
        [
            ("1. Effluent Discharge Standards",
             "Pickling effluent: pH 6.0–9.0, Fluoride ≤ 10 mg/L, Total Chromium ≤ 2 mg/L. "
             "Monitored continuously by online analysers. Non-compliance triggers line stop."),
            ("2. Air Emission Limits",
             "Stack emissions from annealing furnace: NOx ≤ 400 mg/Nm³, SO2 ≤ 200 mg/Nm³. "
             "Continuous emission monitoring system (CEMS) installed per CPCB norms."),
            ("3. Waste Management",
             "Pickling sludge classified as hazardous waste (Schedule I). "
             "Disposal via CPCB-authorised vendor only. Manifest in Form 9 (HWM Rules 2016). "
             "Annual disposal: ~850 MT at JSL Hisar Works."),
            ("4. ISO 14001:2015 Compliance",
             "JSL Hisar Works certified ISO 14001:2015. "
             "Last surveillance audit: Oct 2025 — zero major non-conformances. "
             "Next recertification: Oct 2027."),
        ],
    ),
]


# ── Main ──────────────────────────────────────────────────────────────────
def main():
    print(f"Generating 20 JSL synthetic documents → {OUTPUT_DIR}/\n")

    print("Grade Specifications (PDF):")
    for grade in ["304", "316L", "430"]:
        generate_grade_spec(grade)

    print("\nPickling SOPs (PDF):")
    for grade in ["304", "316L", "430"]:
        generate_sop("Pickling", grade)

    print("\nCold Rolling SOPs (PDF):")
    for grade in ["304", "316L", "430"]:
        generate_sop("Cold_Rolling", grade)

    print("\nMaintenance Manuals (Word):")
    for equipment in ["Annealing_Furnace", "Pickling_Line", "Rolling_Mill"]:
        generate_maintenance_manual(equipment)

    print("\nQC Inspection Checklists (PDF):")
    for grade in ["304", "316L", "430"]:
        generate_qc_checklist(grade)

    print("\nSAP Process SOPs (PDF):")
    for process, content in SAP_SOPS.items():
        generate_sap_sop(process, content)

    print("\nPolicy Documents (PDF):")
    for filename, title, docno, sections in POLICY_DOCS:
        generate_policy_doc(filename, title, docno, sections)

    files = list(OUTPUT_DIR.iterdir())
    print(f"\n✅ Generated {len(files)} documents in {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
```

**Step 3: Create the incoming watch directory placeholder**

Create `rag/docs/incoming/.gitkeep` (empty file).

**Step 4: Run the generator**

```bash
cd /Users/navinnair/dev/platform_engg/JSLMind
python rag/docs/generate_corpus.py
```

Expected output:
```
✅ Generated 20 documents in rag/docs/corpus/
```

Verify:
```bash
ls rag/docs/corpus/ | wc -l
# Expected: 20
```

**Step 5: Add corpus to .gitignore (don't commit generated binaries)**

Add to `.gitignore`:
```
rag/docs/corpus/
```

**Step 6: Commit**

```bash
git add rag/docs/generate_corpus.py rag/docs/incoming/.gitkeep .gitignore
git commit -m "feat: add synthetic JSL document corpus generator (20 docs)"
```

---

## Task 2: BM25 Store

**Goal:** A simple module to maintain a BM25 index on disk — add documents, search with scores.

**Files:**
- Create: `rag/ingestion/__init__.py`
- Create: `rag/ingestion/bm25_store.py`
- Create: `rag/tests/__init__.py`
- Create: `rag/tests/test_bm25_store.py`

**Step 1: Write the failing tests**

Create `rag/tests/test_bm25_store.py`:

```python
import pytest
from unittest.mock import patch
import tempfile
import os

from ingestion.bm25_store import BM25Store


@pytest.fixture
def tmp_index(tmp_path):
    return str(tmp_path / "bm25.pkl")


def test_empty_store_returns_no_results(tmp_index):
    store = BM25Store(index_path=tmp_index)
    results = store.search("carbon content", top_k=5)
    assert results == []


def test_add_and_search_returns_matching_chunk(tmp_index):
    store = BM25Store(index_path=tmp_index)
    store.add_chunks([
        {"id": "chunk-1", "text": "Carbon (C): max 0.03% for Grade 316L stainless steel"},
        {"id": "chunk-2", "text": "Chromium (Cr): 16.0–18.0% for Grade 316L"},
        {"id": "chunk-3", "text": "Annual furnace maintenance schedule for annealing"},
    ])
    results = store.search("carbon content 316L", top_k=2)
    assert len(results) == 2
    assert results[0]["id"] == "chunk-1"
    assert results[0]["score"] > 0


def test_persist_and_reload(tmp_index):
    store = BM25Store(index_path=tmp_index)
    store.add_chunks([
        {"id": "chunk-a", "text": "Tensile strength 485 MPa minimum"},
    ])
    store.save()

    store2 = BM25Store(index_path=tmp_index)
    store2.load()
    results = store2.search("tensile strength", top_k=1)
    assert len(results) == 1
    assert results[0]["id"] == "chunk-a"


def test_search_returns_scores_between_0_and_1(tmp_index):
    store = BM25Store(index_path=tmp_index)
    store.add_chunks([
        {"id": "c1", "text": "maximum carbon content grade 304"},
        {"id": "c2", "text": "bearing replacement schedule"},
    ])
    results = store.search("carbon", top_k=2)
    for r in results:
        assert 0.0 <= r["score"] <= 1.0
```

**Step 2: Run tests to verify they fail**

```bash
cd rag && pip install rank-bm25 pytest && python -m pytest tests/test_bm25_store.py -v
# Expected: ImportError or ModuleNotFoundError
```

**Step 3: Implement BM25Store**

Create `rag/ingestion/__init__.py` (empty).

Create `rag/ingestion/bm25_store.py`:

```python
"""
BM25 sparse index — persisted to disk as a pickle.
Complements Qdrant dense search in the hybrid RRF retriever.
"""

import os
import pickle
from typing import List, Dict

from rank_bm25 import BM25Okapi


class BM25Store:
    def __init__(self, index_path: str = "/docs/bm25_index.pkl"):
        self._index_path = index_path
        self._chunks: List[Dict] = []   # [{id, text}, ...]
        self._bm25: BM25Okapi | None = None
        if os.path.exists(index_path):
            self.load()

    # ── write ──────────────────────────────────────────────────────────────
    def add_chunks(self, chunks: List[Dict]) -> None:
        """Add chunks and rebuild the BM25 index."""
        self._chunks.extend(chunks)
        self._rebuild()

    def _rebuild(self) -> None:
        if not self._chunks:
            self._bm25 = None
            return
        tokenised = [c["text"].lower().split() for c in self._chunks]
        self._bm25 = BM25Okapi(tokenised)

    def save(self) -> None:
        os.makedirs(os.path.dirname(self._index_path) or ".", exist_ok=True)
        with open(self._index_path, "wb") as f:
            pickle.dump({"chunks": self._chunks}, f)

    def load(self) -> None:
        with open(self._index_path, "rb") as f:
            data = pickle.load(f)
        self._chunks = data["chunks"]
        self._rebuild()

    # ── read ───────────────────────────────────────────────────────────────
    def search(self, query: str, top_k: int = 20) -> List[Dict]:
        """Return [{id, text, score}] sorted by BM25 score descending, normalised 0–1."""
        if self._bm25 is None or not self._chunks:
            return []
        tokens = query.lower().split()
        raw_scores = self._bm25.get_scores(tokens)
        max_score = max(raw_scores) if max(raw_scores) > 0 else 1.0
        ranked = sorted(
            [
                {"id": self._chunks[i]["id"],
                 "text": self._chunks[i]["text"],
                 "score": float(raw_scores[i] / max_score)}
                for i in range(len(self._chunks))
            ],
            key=lambda x: x["score"],
            reverse=True,
        )
        return ranked[:top_k]
```

**Step 4: Run tests to verify they pass**

```bash
cd rag && python -m pytest tests/test_bm25_store.py -v
# Expected: 4 passed
```

**Step 5: Commit**

```bash
git add rag/ingestion/__init__.py rag/ingestion/bm25_store.py rag/tests/__init__.py rag/tests/test_bm25_store.py
git commit -m "feat: add BM25 sparse index store with persist/reload"
```

---

## Task 3: Embedding Pipeline

**Goal:** Parse a document file (PDF or Word), chunk it with metadata, embed via LiteLLM `jsl-embed`, upsert to Qdrant, update BM25 index.

**Files:**
- Create: `rag/ingestion/embedding_pipeline.py`
- Create: `rag/tests/test_embedding_pipeline.py`

**Step 1: Write the failing tests**

Create `rag/tests/test_embedding_pipeline.py`:

```python
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from pathlib import Path

from ingestion.embedding_pipeline import (
    extract_chunks,
    upsert_to_qdrant,
    EmbeddingPipeline,
)


# ── extract_chunks ────────────────────────────────────────────────────────

def test_extract_chunks_returns_list_of_dicts(tmp_path):
    """extract_chunks should return non-empty list with required keys."""
    # We use a real minimal text file to avoid needing reportlab in tests
    txt_file = tmp_path / "test.txt"
    txt_file.write_text("Carbon (C): max 0.03%\n\nChromium (Cr): 16.0-18.0%")

    chunks = extract_chunks(str(txt_file))
    assert isinstance(chunks, list)
    assert len(chunks) > 0
    for c in chunks:
        assert "text" in c
        assert "metadata" in c
        assert "doc_name" in c["metadata"]


def test_extract_chunks_infers_grade_from_filename(tmp_path):
    txt_file = tmp_path / "Grade_316L_Specification.txt"
    txt_file.write_text("Carbon (C): max 0.03%")
    chunks = extract_chunks(str(txt_file))
    assert chunks[0]["metadata"]["grade"] == "316L"


def test_extract_chunks_infers_doc_type_spec(tmp_path):
    txt_file = tmp_path / "Grade_304_Specification.txt"
    txt_file.write_text("Tensile strength 515 MPa")
    chunks = extract_chunks(str(txt_file))
    assert chunks[0]["metadata"]["doc_type"] == "spec"


def test_extract_chunks_infers_doc_type_sop(tmp_path):
    txt_file = tmp_path / "SOP_Pickling_304.txt"
    txt_file.write_text("Step 1: rinse with water")
    chunks = extract_chunks(str(txt_file))
    assert chunks[0]["metadata"]["doc_type"] == "sop"


# ── upsert_to_qdrant (mocked) ─────────────────────────────────────────────

def test_upsert_to_qdrant_calls_client_upsert():
    mock_client = MagicMock()
    mock_client.collection_exists.return_value = True

    chunks = [
        {"id": "c1", "text": "some text", "embedding": [0.1] * 1024,
         "metadata": {"doc_name": "test.pdf", "doc_type": "spec", "grade": "304",
                      "section": "1. Scope", "page": 1}},
    ]
    upsert_to_qdrant(mock_client, "jsl_docs", chunks)
    mock_client.upsert.assert_called_once()


# ── EmbeddingPipeline (mocked LiteLLM + Qdrant) ───────────────────────────

@patch("ingestion.embedding_pipeline.httpx.post")
def test_pipeline_process_calls_embed_and_upsert(mock_post, tmp_path):
    # Mock LiteLLM embedding response
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "data": [{"embedding": [0.1] * 1024}]
    }
    mock_response.raise_for_status = MagicMock()
    mock_post.return_value = mock_response

    mock_qdrant = MagicMock()
    mock_qdrant.collection_exists.return_value = True
    mock_bm25 = MagicMock()

    txt_file = tmp_path / "Grade_304_Specification.txt"
    txt_file.write_text("Carbon max 0.08%\nTensile strength 515 MPa")

    pipeline = EmbeddingPipeline(
        qdrant_client=mock_qdrant,
        bm25_store=mock_bm25,
        litellm_base_url="http://fake-litellm:4000",
        litellm_api_key="fake-key",
        embed_model="jsl-embed",
        collection="jsl_docs",
    )
    result = pipeline.process(str(txt_file))

    assert result["status"] == "indexed"
    assert result["chunks"] > 0
    mock_qdrant.upsert.assert_called()
    mock_bm25.add_chunks.assert_called()
    mock_bm25.save.assert_called()
```

**Step 2: Run tests to verify they fail**

```bash
cd rag && python -m pytest tests/test_embedding_pipeline.py -v
# Expected: ImportError
```

**Step 3: Implement EmbeddingPipeline**

Create `rag/ingestion/embedding_pipeline.py`:

```python
"""
Embedding pipeline: file → chunks (unstructured) → embeddings (LiteLLM jsl-embed) → Qdrant + BM25.
"""

import re
import uuid
import httpx
from pathlib import Path
from typing import List, Dict, Any

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

from ingestion.bm25_store import BM25Store

EMBED_DIM = 1024          # BGE-M3 output dimension
COLLECTION = "jsl_docs"
CHUNK_SIZE = 500           # characters
CHUNK_OVERLAP = 100        # characters


# ── Metadata inference ─────────────────────────────────────────────────────

def _infer_grade(filename: str) -> str:
    for grade in ["316L", "304", "430"]:
        if grade in filename:
            return grade
    return "unknown"


def _infer_doc_type(filename: str) -> str:
    fname = filename.lower()
    if "sop" in fname:
        return "sop"
    if "spec" in fname or "specification" in fname:
        return "spec"
    if "mainten" in fname or "manual" in fname:
        return "maintenance"
    if "checklist" in fname or "qc" in fname or "inspection" in fname:
        return "qc"
    if "sap" in fname:
        return "sap_process"
    if "safety" in fname or "environment" in fname or "compliance" in fname:
        return "policy"
    return "general"


# ── Text extraction ────────────────────────────────────────────────────────

def _extract_text_plain(file_path: str) -> List[Dict]:
    """Fallback: read as plain text, split on double newlines."""
    text = Path(file_path).read_text(errors="replace")
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    doc_name = Path(file_path).name
    return [
        {
            "text": p,
            "metadata": {
                "doc_name": doc_name,
                "grade": _infer_grade(doc_name),
                "doc_type": _infer_doc_type(doc_name),
                "section": f"paragraph-{i+1}",
                "page": 1,
            },
        }
        for i, p in enumerate(paragraphs)
    ]


def _extract_with_unstructured(file_path: str) -> List[Dict]:
    """Parse PDF/Word/Excel via unstructured library."""
    from unstructured.partition.auto import partition
    elements = partition(filename=file_path)
    doc_name = Path(file_path).name
    chunks = []
    current_section = "Introduction"
    current_page = 1

    for el in elements:
        el_type = type(el).__name__
        text = str(el).strip()
        if not text:
            continue

        # Track section headings
        if el_type in ("Title", "Header"):
            current_section = text[:80]

        # Track page numbers from metadata when available
        if hasattr(el, "metadata") and hasattr(el.metadata, "page_number"):
            pg = el.metadata.page_number
            if pg:
                current_page = pg

        if len(text) < 20:
            continue  # skip trivially short fragments

        chunks.append({
            "text": text,
            "metadata": {
                "doc_name": doc_name,
                "grade": _infer_grade(doc_name),
                "doc_type": _infer_doc_type(doc_name),
                "section": current_section,
                "page": current_page,
            },
        })

    return chunks if chunks else _extract_text_plain(file_path)


def extract_chunks(file_path: str) -> List[Dict]:
    """
    Extract text chunks from a document file.
    Tries unstructured first; falls back to plain text split.
    """
    suffix = Path(file_path).suffix.lower()
    if suffix in (".pdf", ".docx", ".xlsx", ".doc"):
        try:
            return _extract_with_unstructured(file_path)
        except Exception:
            pass
    return _extract_text_plain(file_path)


# ── Qdrant helpers ─────────────────────────────────────────────────────────

def _ensure_collection(client: QdrantClient, collection: str) -> None:
    if not client.collection_exists(collection):
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )


def upsert_to_qdrant(
    client: QdrantClient,
    collection: str,
    chunks: List[Dict],
) -> None:
    _ensure_collection(client, collection)
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=c["embedding"],
            payload={
                "text": c["text"],
                **c["metadata"],
            },
        )
        for c in chunks
    ]
    client.upsert(collection_name=collection, points=points)


# ── EmbeddingPipeline ──────────────────────────────────────────────────────

class EmbeddingPipeline:
    def __init__(
        self,
        qdrant_client: QdrantClient,
        bm25_store: BM25Store,
        litellm_base_url: str,
        litellm_api_key: str,
        embed_model: str,
        collection: str = COLLECTION,
    ):
        self._qdrant = qdrant_client
        self._bm25 = bm25_store
        self._litellm_base_url = litellm_base_url.rstrip("/")
        self._litellm_api_key = litellm_api_key
        self._embed_model = embed_model
        self._collection = collection

    def _embed(self, texts: List[str]) -> List[List[float]]:
        """Call LiteLLM /v1/embeddings in batches of 32."""
        all_embeddings = []
        batch_size = 32
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            resp = httpx.post(
                f"{self._litellm_base_url}/v1/embeddings",
                json={"model": self._embed_model, "input": batch},
                headers={"Authorization": f"Bearer {self._litellm_api_key}"},
                timeout=60.0,
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            all_embeddings.extend([d["embedding"] for d in data])
        return all_embeddings

    def process(self, file_path: str) -> Dict[str, Any]:
        """
        Full pipeline: extract → embed → upsert Qdrant → update BM25.
        Returns {"doc_id": str, "chunks": int, "status": "indexed"}.
        """
        doc_id = str(uuid.uuid4())
        raw_chunks = extract_chunks(file_path)
        if not raw_chunks:
            return {"doc_id": doc_id, "chunks": 0, "status": "empty"}

        texts = [c["text"] for c in raw_chunks]
        embeddings = self._embed(texts)

        qdrant_chunks = [
            {**raw_chunks[i], "embedding": embeddings[i], "id": f"{doc_id}-{i}"}
            for i in range(len(raw_chunks))
        ]
        upsert_to_qdrant(self._qdrant, self._collection, qdrant_chunks)

        bm25_chunks = [
            {"id": f"{doc_id}-{i}", "text": raw_chunks[i]["text"]}
            for i in range(len(raw_chunks))
        ]
        self._bm25.add_chunks(bm25_chunks)
        self._bm25.save()

        return {"doc_id": doc_id, "chunks": len(raw_chunks), "status": "indexed"}
```

**Step 4: Run tests**

```bash
cd rag && python -m pytest tests/test_embedding_pipeline.py -v
# Expected: 7 passed
```

**Step 5: Commit**

```bash
git add rag/ingestion/embedding_pipeline.py rag/tests/test_embedding_pipeline.py
git commit -m "feat: add embedding pipeline (unstructured → BGE-M3 → Qdrant + BM25)"
```

---

## Task 4: Hybrid Retriever (RRF Fusion)

**Goal:** Fuse Qdrant dense results and BM25 sparse results using Reciprocal Rank Fusion.

**Files:**
- Create: `rag/retrieval/__init__.py`
- Create: `rag/retrieval/hybrid_retriever.py`
- Create: `rag/tests/test_hybrid_retriever.py`

**Step 1: Write the failing tests**

Create `rag/tests/test_hybrid_retriever.py`:

```python
import pytest
from unittest.mock import MagicMock, patch

from retrieval.hybrid_retriever import rrf_fuse, HybridRetriever


# ── rrf_fuse unit tests ───────────────────────────────────────────────────

def test_rrf_fuse_combines_two_lists():
    dense = [{"id": "a", "score": 0.9}, {"id": "b", "score": 0.7}]
    sparse = [{"id": "b", "score": 1.0}, {"id": "c", "score": 0.5}]
    result = rrf_fuse(dense, sparse, top_k=3)
    ids = [r["id"] for r in result]
    assert "b" in ids    # appears in both lists — should rank high
    assert len(result) == 3


def test_rrf_fuse_respects_top_k():
    dense = [{"id": str(i), "score": 1.0 - i*0.1} for i in range(10)]
    sparse = [{"id": str(i), "score": 1.0 - i*0.1} for i in range(10)]
    result = rrf_fuse(dense, sparse, top_k=5)
    assert len(result) == 5


def test_rrf_fuse_scores_sorted_descending():
    dense = [{"id": "x", "score": 0.5}, {"id": "y", "score": 0.8}]
    sparse = [{"id": "y", "score": 0.9}, {"id": "z", "score": 0.3}]
    result = rrf_fuse(dense, sparse, top_k=3)
    scores = [r["rrf_score"] for r in result]
    assert scores == sorted(scores, reverse=True)


def test_rrf_fuse_empty_inputs():
    result = rrf_fuse([], [], top_k=5)
    assert result == []


# ── HybridRetriever (mocked Qdrant + BM25) ────────────────────────────────

def _make_qdrant_hit(chunk_id: str, text: str, score: float, grade: str = "304"):
    hit = MagicMock()
    hit.id = chunk_id
    hit.score = score
    hit.payload = {
        "text": text,
        "doc_name": "Grade_304_Specification.pdf",
        "doc_type": "spec",
        "grade": grade,
        "section": "3.2 Chemical Composition",
        "page": 4,
    }
    return hit


@patch("retrieval.hybrid_retriever.httpx.post")
def test_retriever_returns_answer_with_sources(mock_post, tmp_path):
    # Mock embed call
    embed_resp = MagicMock()
    embed_resp.json.return_value = {"data": [{"embedding": [0.1] * 1024}]}
    embed_resp.raise_for_status = MagicMock()

    # Mock LLM completion call
    llm_resp = MagicMock()
    llm_resp.json.return_value = {
        "choices": [{"message": {"content": "Max carbon for 316L is 0.03%."}}]
    }
    llm_resp.raise_for_status = MagicMock()

    mock_post.side_effect = [embed_resp, llm_resp]

    mock_qdrant = MagicMock()
    mock_qdrant.search.return_value = [
        _make_qdrant_hit("c1", "Carbon (C): max 0.03%", 0.95, "316L"),
        _make_qdrant_hit("c2", "Chromium (Cr): 16.0-18.0%", 0.80, "316L"),
    ]

    mock_bm25 = MagicMock()
    mock_bm25.search.return_value = [
        {"id": "c1", "text": "Carbon (C): max 0.03%", "score": 1.0},
    ]

    retriever = HybridRetriever(
        qdrant_client=mock_qdrant,
        bm25_store=mock_bm25,
        litellm_base_url="http://fake:4000",
        litellm_api_key="fake",
        embed_model="jsl-embed",
        generate_model="jsl-quality",
        collection="jsl_docs",
    )
    result = retriever.query("Max carbon content for Grade 316L?", top_k=3)

    assert "answer" in result
    assert "sources" in result
    assert len(result["sources"]) > 0
    assert "retrieval_debug" in result
    assert result["retrieval_debug"]["dense_hits"] == 2


@patch("retrieval.hybrid_retriever.httpx.post")
def test_retriever_applies_grade_filter(mock_post, tmp_path):
    embed_resp = MagicMock()
    embed_resp.json.return_value = {"data": [{"embedding": [0.1] * 1024}]}
    embed_resp.raise_for_status = MagicMock()
    llm_resp = MagicMock()
    llm_resp.json.return_value = {"choices": [{"message": {"content": "answer"}}]}
    llm_resp.raise_for_status = MagicMock()
    mock_post.side_effect = [embed_resp, llm_resp]

    mock_qdrant = MagicMock()
    mock_qdrant.search.return_value = []
    mock_bm25 = MagicMock()
    mock_bm25.search.return_value = []

    retriever = HybridRetriever(
        qdrant_client=mock_qdrant,
        bm25_store=mock_bm25,
        litellm_base_url="http://fake:4000",
        litellm_api_key="fake",
        embed_model="jsl-embed",
        generate_model="jsl-quality",
        collection="jsl_docs",
    )
    retriever.query("carbon content", filters={"grade": "316L"}, top_k=5)

    # Qdrant search must have been called with a filter
    call_kwargs = mock_qdrant.search.call_args[1]
    assert call_kwargs.get("query_filter") is not None
```

**Step 2: Run to verify tests fail**

```bash
cd rag && python -m pytest tests/test_hybrid_retriever.py -v
# Expected: ImportError
```

**Step 3: Implement HybridRetriever**

Create `rag/retrieval/__init__.py` (empty).

Create `rag/retrieval/hybrid_retriever.py`:

```python
"""
Hybrid RAG retriever — RRF fusion of Qdrant dense search and BM25 sparse search.
"""

import httpx
from typing import List, Dict, Optional, Any

from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

from ingestion.bm25_store import BM25Store

RRF_K = 60   # standard RRF constant; higher = smoother rank fusion


# ── RRF fusion ─────────────────────────────────────────────────────────────

def rrf_fuse(
    dense: List[Dict],
    sparse: List[Dict],
    top_k: int = 8,
) -> List[Dict]:
    """
    Reciprocal Rank Fusion: score(d) = Σ 1 / (k + rank_i(d))
    Merges two ranked lists and returns top_k results sorted by RRF score.
    """
    scores: Dict[str, float] = {}
    payload: Dict[str, Dict] = {}

    for rank, item in enumerate(dense):
        doc_id = item["id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank + 1)
        payload[doc_id] = item

    for rank, item in enumerate(sparse):
        doc_id = item["id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank + 1)
        if doc_id not in payload:
            payload[doc_id] = item

    merged = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    result = []
    for doc_id, rrf_score in merged[:top_k]:
        entry = {**payload[doc_id], "rrf_score": rrf_score}
        result.append(entry)
    return result


# ── HybridRetriever ────────────────────────────────────────────────────────

class HybridRetriever:
    def __init__(
        self,
        qdrant_client: QdrantClient,
        bm25_store: BM25Store,
        litellm_base_url: str,
        litellm_api_key: str,
        embed_model: str,
        generate_model: str,
        collection: str = "jsl_docs",
    ):
        self._qdrant = qdrant_client
        self._bm25 = bm25_store
        self._litellm = litellm_base_url.rstrip("/")
        self._api_key = litellm_api_key
        self._embed_model = embed_model
        self._generate_model = generate_model
        self._collection = collection

    def _embed_query(self, query: str) -> List[float]:
        resp = httpx.post(
            f"{self._litellm}/v1/embeddings",
            json={"model": self._embed_model, "input": [query]},
            headers={"Authorization": f"Bearer {self._api_key}"},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]

    def _build_qdrant_filter(self, filters: Optional[Dict]) -> Optional[Filter]:
        if not filters:
            return None
        conditions = [
            FieldCondition(key=k, match=MatchValue(value=v))
            for k, v in filters.items()
        ]
        return Filter(must=conditions)

    def _generate_answer(self, query: str, chunks: List[Dict]) -> str:
        context = "\n\n".join(
            f"[Source: {c.get('doc_name', c.get('payload', {}).get('doc_name', 'unknown'))}, "
            f"Section: {c.get('section', c.get('payload', {}).get('section', ''))}, "
            f"Page: {c.get('page', c.get('payload', {}).get('page', '?'))}]\n"
            f"{c.get('text', c.get('payload', {}).get('text', ''))}"
            for c in chunks
        )
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a technical assistant for Jindal Stainless Limited. "
                    "Answer questions using ONLY the provided context. "
                    "Always cite the source document name, section, and page number. "
                    "If the answer is not in the context, say 'Not found in indexed documents.'"
                ),
            },
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {query}",
            },
        ]
        resp = httpx.post(
            f"{self._litellm}/v1/chat/completions",
            json={"model": self._generate_model, "messages": messages, "temperature": 0.1},
            headers={"Authorization": f"Bearer {self._api_key}"},
            timeout=60.0,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def query(
        self,
        query: str,
        filters: Optional[Dict] = None,
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """
        Hybrid query: dense + sparse → RRF → LLM answer with citations.
        """
        query_vector = self._embed_query(query)
        qdrant_filter = self._build_qdrant_filter(filters)

        dense_hits = self._qdrant.search(
            collection_name=self._collection,
            query_vector=query_vector,
            limit=20,
            query_filter=qdrant_filter,
        )
        dense_results = [
            {
                "id": str(hit.id),
                "score": hit.score,
                "text": hit.payload.get("text", ""),
                "doc_name": hit.payload.get("doc_name", ""),
                "doc_type": hit.payload.get("doc_type", ""),
                "grade": hit.payload.get("grade", ""),
                "section": hit.payload.get("section", ""),
                "page": hit.payload.get("page", 1),
            }
            for hit in dense_hits
        ]

        sparse_results = self._bm25.search(query, top_k=20)

        merged = rrf_fuse(dense_results, sparse_results, top_k=8)

        answer = self._generate_answer(query, merged)

        sources = [
            {
                "doc": r.get("doc_name", ""),
                "section": r.get("section", ""),
                "page": r.get("page", 1),
                "score": round(r["rrf_score"], 4),
                "chunk": r.get("text", "")[:200],
            }
            for r in merged[:top_k]
        ]

        return {
            "answer": answer,
            "sources": sources,
            "retrieval_debug": {
                "dense_hits": len(dense_results),
                "sparse_hits": len(sparse_results),
                "rrf_merged": len(merged),
            },
        }
```

**Step 4: Run tests**

```bash
cd rag && python -m pytest tests/test_hybrid_retriever.py -v
# Expected: 6 passed
```

**Step 5: Commit**

```bash
git add rag/retrieval/__init__.py rag/retrieval/hybrid_retriever.py rag/tests/test_hybrid_retriever.py
git commit -m "feat: add RRF hybrid retriever (Qdrant dense + BM25 sparse)"
```

---

## Task 5: Combined FastAPI App

**Goal:** Single FastAPI app on port 8001 with `POST /ingest`, `POST /query`, and `GET /health`. Bootstraps Qdrant collection and BM25 store on startup. Wires together Tasks 2–4.

**Files:**
- Create: `rag/app.py`
- Create: `rag/tests/test_app.py`

**Step 1: Write the failing tests**

Create `rag/tests/test_app.py`:

```python
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


# Patch heavy dependencies before importing app
@pytest.fixture
def client():
    with patch("app.QdrantClient") as mock_qdrant_cls, \
         patch("app.BM25Store") as mock_bm25_cls, \
         patch("app.EmbeddingPipeline") as mock_pipeline_cls, \
         patch("app.HybridRetriever") as mock_retriever_cls:

        mock_pipeline_cls.return_value.process.return_value = {
            "doc_id": "test-id", "chunks": 12, "status": "indexed"
        }
        mock_retriever_cls.return_value.query.return_value = {
            "answer": "Max carbon for 316L is 0.03%.",
            "sources": [
                {"doc": "Grade_316L_Specification.pdf",
                 "section": "3.2 Chemical Composition",
                 "page": 4, "score": 0.91,
                 "chunk": "Carbon (C): max 0.03%"}
            ],
            "retrieval_debug": {"dense_hits": 20, "sparse_hits": 20, "rrf_merged": 8},
        }

        from app import app
        yield TestClient(app)


def test_health_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_ingest_returns_indexed(client, tmp_path):
    txt = tmp_path / "test.txt"
    txt.write_text("Carbon max 0.03%")
    resp = client.post("/ingest", json={"file_path": str(txt)})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "indexed"
    assert body["chunks"] == 12


def test_ingest_missing_file_returns_404(client):
    resp = client.post("/ingest", json={"file_path": "/nonexistent/file.pdf"})
    assert resp.status_code == 404


def test_query_returns_answer_and_sources(client):
    resp = client.post("/query", json={"query": "Max carbon for 316L?"})
    assert resp.status_code == 200
    body = resp.json()
    assert "answer" in body
    assert "sources" in body
    assert len(body["sources"]) > 0


def test_query_with_filters(client):
    resp = client.post("/query", json={
        "query": "surface finish",
        "filters": {"grade": "316L"},
        "top_k": 3,
    })
    assert resp.status_code == 200
```

**Step 2: Run to verify tests fail**

```bash
cd rag && python -m pytest tests/test_app.py -v
# Expected: ImportError
```

**Step 3: Implement the combined app**

Create `rag/app.py`:

```python
"""
JSLMind RAG Service — FastAPI app (port 8001)
Endpoints:
  GET  /health        — liveness probe
  POST /ingest        — called by Camel on new file drop
  POST /query         — hybrid RAG query (exposed via Kong at /rag/query)
"""

import os
import logging
from pathlib import Path
from typing import Optional, Dict

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from qdrant_client import QdrantClient

from ingestion.bm25_store import BM25Store
from ingestion.embedding_pipeline import EmbeddingPipeline
from retrieval.hybrid_retriever import HybridRetriever

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Config from environment ────────────────────────────────────────────────
QDRANT_URL = os.environ.get("QDRANT_URL", "http://qdrant:6333")
LITELLM_BASE_URL = os.environ.get("LITELLM_BASE_URL", "http://litellm-proxy:4000")
LITELLM_API_KEY = os.environ.get("LITELLM_API_KEY", "sk-jsl-master")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "jsl-embed")
GENERATE_MODEL = os.environ.get("GENERATE_MODEL", "jsl-quality")
BM25_INDEX_PATH = os.environ.get("BM25_INDEX_PATH", "/docs/bm25_index.pkl")
COLLECTION = "jsl_docs"

# ── Shared singletons ──────────────────────────────────────────────────────
qdrant_client = QdrantClient(url=QDRANT_URL)
bm25_store = BM25Store(index_path=BM25_INDEX_PATH)
pipeline = EmbeddingPipeline(
    qdrant_client=qdrant_client,
    bm25_store=bm25_store,
    litellm_base_url=LITELLM_BASE_URL,
    litellm_api_key=LITELLM_API_KEY,
    embed_model=EMBED_MODEL,
    collection=COLLECTION,
)
retriever = HybridRetriever(
    qdrant_client=qdrant_client,
    bm25_store=bm25_store,
    litellm_base_url=LITELLM_BASE_URL,
    litellm_api_key=LITELLM_API_KEY,
    embed_model=EMBED_MODEL,
    generate_model=GENERATE_MODEL,
    collection=COLLECTION,
)

app = FastAPI(title="JSLMind RAG Service", version="1.0.0")


# ── Request / response models ──────────────────────────────────────────────

class IngestRequest(BaseModel):
    file_path: str


class QueryRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, str]] = None
    top_k: int = 5


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "rag-service"}


@app.post("/ingest")
def ingest(req: IngestRequest):
    if not Path(req.file_path).exists():
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")
    logger.info(f"Ingesting: {req.file_path}")
    result = pipeline.process(req.file_path)
    logger.info(f"Indexed {result['chunks']} chunks from {req.file_path}")
    return result


@app.post("/query")
def query(req: QueryRequest):
    logger.info(f"Query: {req.query!r} filters={req.filters}")
    return retriever.query(req.query, filters=req.filters, top_k=req.top_k)
```

**Step 4: Run tests**

```bash
cd rag && python -m pytest tests/test_app.py -v
# Expected: 5 passed
```

**Step 5: Run full test suite**

```bash
cd rag && python -m pytest tests/ -v
# Expected: all 22 tests pass
```

**Step 6: Commit**

```bash
git add rag/app.py rag/tests/test_app.py
git commit -m "feat: add combined RAG FastAPI app (ingest + query on port 8001)"
```

---

## Task 6: RAG Service Docker Build

**Goal:** Containerise the RAG service so `docker compose up rag-service` works.

**Files:**
- Create: `rag/requirements.txt`
- Create: `rag/Dockerfile`
- Create: `rag/seed_corpus.py`

**Step 1: Create requirements.txt**

Create `rag/requirements.txt`:

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
pydantic==2.7.1
httpx==0.27.0
qdrant-client==1.9.1
rank-bm25==0.2.2
unstructured[pdf,docx]==0.13.7
python-docx==1.1.0
reportlab==4.2.0
pytest==8.2.0
```

**Step 2: Create Dockerfile**

Create `rag/Dockerfile`:

```dockerfile
FROM python:3.11-slim

# System deps for unstructured PDF parsing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    poppler-utils \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Ensure /docs is writable for BM25 index and incoming docs
VOLUME ["/docs"]

EXPOSE 8001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
```

**Step 3: Create corpus seeder (runs at container startup to pre-index)**

Create `rag/seed_corpus.py`:

```python
"""
Seed the RAG index with the pre-generated corpus.
Run once at startup if the Qdrant collection is empty.

Usage (inside container):
    python seed_corpus.py
"""

import os
import sys
from pathlib import Path

CORPUS_DIR = Path("/docs/corpus")


def main():
    if not CORPUS_DIR.exists() or not any(CORPUS_DIR.iterdir()):
        print(f"No corpus found at {CORPUS_DIR} — skipping seed.")
        return

    from app import pipeline
    from qdrant_client import QdrantClient

    qdrant_url = os.environ.get("QDRANT_URL", "http://qdrant:6333")
    client = QdrantClient(url=qdrant_url)

    if client.collection_exists("jsl_docs"):
        count = client.count("jsl_docs").count
        if count > 0:
            print(f"Collection jsl_docs already has {count} vectors — skipping seed.")
            return

    files = list(CORPUS_DIR.glob("*"))
    print(f"Seeding {len(files)} documents from {CORPUS_DIR} …")
    for f in files:
        if f.suffix.lower() in (".pdf", ".docx", ".doc", ".xlsx", ".txt"):
            result = pipeline.process(str(f))
            print(f"  ✓ {f.name}: {result['chunks']} chunks")

    print("Seed complete.")


if __name__ == "__main__":
    main()
```

**Step 4: Update CMD to seed then serve**

Edit `rag/Dockerfile` — replace the last CMD line:

```dockerfile
CMD ["sh", "-c", "python seed_corpus.py && uvicorn app:app --host 0.0.0.0 --port 8001"]
```

**Step 5: Verify Docker build**

```bash
cd /Users/navinnair/dev/platform_engg/JSLMind
docker build -t jslmind-rag:local ./rag
# Expected: Successfully built ...
```

**Step 6: Commit**

```bash
git add rag/requirements.txt rag/Dockerfile rag/seed_corpus.py
git commit -m "feat: add RAG service Dockerfile with corpus auto-seed on startup"
```

---

## Task 7: Camel FileToQdrantRoute (SpringBoot Integration)

**Goal:** Create the Apache Camel SpringBoot project with `FileToQdrantRoute` that watches the incoming directory and POSTs new file paths to the RAG ingest endpoint.

**Files:**
- Create: `integration/pom.xml`
- Create: `integration/Dockerfile`
- Create: `integration/src/main/resources/application.properties`
- Create: `integration/src/main/java/com/jslmind/integration/JSLMindIntegrationApp.java`
- Create: `integration/src/main/java/com/jslmind/integration/routes/FileToQdrantRoute.java`
- Create: `integration/src/main/java/com/jslmind/integration/routes/SapToBronzeRoute.java`

**Step 1: Create pom.xml**

Create `integration/pom.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
                             https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.5</version>
    <relativePath/>
  </parent>

  <groupId>com.jslmind</groupId>
  <artifactId>jslmind-integration</artifactId>
  <version>1.0.0</version>
  <name>JSLMind Integration</name>

  <properties>
    <java.version>21</java.version>
    <camel.version>4.6.0</camel.version>
  </properties>

  <dependencies>
    <!-- Camel Spring Boot BOM -->
    <dependency>
      <groupId>org.apache.camel.springboot</groupId>
      <artifactId>camel-spring-boot-starter</artifactId>
      <version>${camel.version}</version>
    </dependency>

    <!-- File component (built-in, no extra dep needed) -->

    <!-- HTTP component for POST to rag-service -->
    <dependency>
      <groupId>org.apache.camel.springboot</groupId>
      <artifactId>camel-http-starter</artifactId>
      <version>${camel.version}</version>
    </dependency>

    <!-- Jackson for JSON serialisation -->
    <dependency>
      <groupId>org.apache.camel.springboot</groupId>
      <artifactId>camel-jackson-starter</artifactId>
      <version>${camel.version}</version>
    </dependency>

    <!-- Spring Boot web for actuator/health -->
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>

    <!-- Test -->
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.apache.camel</groupId>
      <artifactId>camel-test-spring-junit5</artifactId>
      <version>${camel.version}</version>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
```

**Step 2: Create application.properties**

Create `integration/src/main/resources/application.properties`:

```properties
# Camel
camel.springboot.name=JSLMindIntegration
camel.springboot.main-run-controller=true
server.port=8080
management.endpoints.web.exposure.include=health,info,camel

# RAG service endpoint
rag.ingest.url=${RAG_INGEST_URL:http://rag-service:8001/ingest}

# File watcher
rag.watch.dir=${RAG_WATCH_DIR:/docs/incoming}

# MinIO
minio.endpoint=${MINIO_ENDPOINT:http://minio:9000}
minio.accessKey=${MINIO_ACCESS_KEY:jslmind}
minio.secretKey=${MINIO_SECRET_KEY:changeme}
```

**Step 3: Create the main application class**

Create `integration/src/main/java/com/jslmind/integration/JSLMindIntegrationApp.java`:

```java
package com.jslmind.integration;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class JSLMindIntegrationApp {
    public static void main(String[] args) {
        SpringApplication.run(JSLMindIntegrationApp.class, args);
    }
}
```

**Step 4: Create FileToQdrantRoute**

Create `integration/src/main/java/com/jslmind/integration/routes/FileToQdrantRoute.java`:

```java
package com.jslmind.integration.routes;

import org.apache.camel.builder.RouteBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * FileToQdrantRoute — Phase 4: Hybrid RAG document ingestion
 *
 * Watches a local directory for new PDF / Word / Excel files.
 * On new file: builds an ingest request body and POSTs to the RAG service.
 *
 * Demo: drag any file into rag/docs/incoming/ and it auto-indexes within 5 seconds.
 *
 * Production story: replace file:// with SharePoint Graph API poller —
 * same downstream behaviour, zero code change in downstream routes.
 */
@Component
public class FileToQdrantRoute extends RouteBuilder {

    @Value("${rag.watch.dir:/docs/incoming}")
    private String watchDir;

    @Value("${rag.ingest.url:http://rag-service:8001/ingest}")
    private String ragIngestUrl;

    @Override
    public void configure() {
        // Error handling: log and continue — don't kill the route on one bad file
        onException(Exception.class)
            .log("FileToQdrantRoute ERROR: ${exception.message}")
            .handled(true);

        from("file://" + watchDir
                + "?include=.*\\.(pdf|docx|doc|xlsx|txt)"
                + "&noop=true"           // leave file in place (noop=true means don't move/delete)
                + "&initialDelay=5000"   // 5s startup delay
                + "&delay=5000"          // poll every 5s
                + "&idempotent=true"     // skip already-seen files
                + "&readLock=changed"    // wait until file is fully written
            )
            .routeId("file-to-qdrant")
            .log("FileToQdrantRoute: detected new file → ${header.CamelFileName}")

            // Build JSON body: {"file_path": "/docs/incoming/<filename>"}
            .process(exchange -> {
                String fileName = exchange.getIn().getHeader(
                    "CamelFileName", String.class);
                String filePath = watchDir + "/" + fileName;
                exchange.getIn().setBody(
                    "{\"file_path\": \"" + filePath + "\"}"
                );
                exchange.getIn().setHeader("Content-Type", "application/json");
            })

            .to("http://" + ragIngestUrl.replace("http://", "")
                    + "?httpMethod=POST"
                    + "&throwExceptionOnFailure=true")

            .log("FileToQdrantRoute: ✓ indexed ${header.CamelFileName} → ${body}");
    }
}
```

**Step 5: Create SapToBronzeRoute stub (skeleton for Phase 2 Medallion)**

Create `integration/src/main/java/com/jslmind/integration/routes/SapToBronzeRoute.java`:

```java
package com.jslmind.integration.routes;

import org.apache.camel.builder.RouteBuilder;
import org.springframework.stereotype.Component;

/**
 * SapToBronzeRoute — Phase 2: Medallion Pipeline
 * Polls simulated SAP MM data and lands it in MinIO Bronze bucket.
 * Implemented in Phase 2 (Medallion) sprint — stub only here.
 */
@Component
public class SapToBronzeRoute extends RouteBuilder {
    @Override
    public void configure() {
        from("timer:sap-poll?period=60000&delay=30000")
            .routeId("sap-to-bronze")
            .log("SapToBronzeRoute: SAP poll tick (stub — implement in Phase 2)");
    }
}
```

**Step 6: Create Dockerfile**

Create `integration/Dockerfile`:

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY --from=build /build/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**Step 7: Verify the build**

```bash
cd /Users/navinnair/dev/platform_engg/JSLMind/integration
mvn package -DskipTests
# Expected: BUILD SUCCESS
```

**Step 8: Commit**

```bash
git add integration/
git commit -m "feat: add Camel SpringBoot integration with FileToQdrantRoute"
```

---

## Task 8: Docker Compose — Add Volume Mount for Camel

**Goal:** The `camel-integration` container needs to read from the same `rag/docs/incoming/` directory as the rag-service, so it can pass real container paths to the ingest endpoint.

**Files:**
- Modify: `docker-compose.yml:268-283` (camel-integration service)

**Step 1: Read current camel-integration block**

Check lines 268–283 in docker-compose.yml (camel-integration service).

**Step 2: Add the shared volume mount and RAG env vars**

In `docker-compose.yml`, find the `camel-integration` service block and update it:

```yaml
  camel-integration:
    build:
      context: ./integration
      dockerfile: Dockerfile
    environment:
      MINIO_ENDPOINT: http://minio:9000
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      RAG_INGEST_URL: http://rag-service:8001/ingest
      RAG_WATCH_DIR: /docs/incoming
      SPRING_PROFILES_ACTIVE: demo
    volumes:
      - ./rag/docs:/docs          # shared with rag-service; Camel watches /docs/incoming
    ports:
      - "8090:8080"
    networks: [jslmind]
    depends_on:
      minio:
        condition: service_healthy
      rag-service:
        condition: service_started
    restart: unless-stopped
```

**Step 3: Also update rag-service volume path for clarity**

The existing rag-service has `./rag/docs:/docs`. This is correct — no change needed.

**Step 4: Verify compose config is valid**

```bash
cd /Users/navinnair/dev/platform_engg/JSLMind
docker compose config --quiet
# Expected: no errors
```

**Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "fix: add shared /docs volume and RAG env vars to camel-integration"
```

---

## Task 9: Backstage Catalog Entity

**Goal:** Register the RAG pipeline as a Backstage Component so it appears in the catalog alongside the agents.

**Files:**
- Create: `catalog/data-products/rag-pipeline.yaml`
- Modify: `catalog/catalog-info.yaml`

**Step 1: Create the catalog entity**

Create `catalog/data-products/rag-pipeline.yaml`:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: rag-pipeline
  description: >
    Hybrid RAG pipeline on JSL documents — SOPs, grade specifications, and
    maintenance manuals. Supports dense (BGE-M3/Qdrant) + sparse (BM25) retrieval
    fused via Reciprocal Rank Fusion. Exposes POST /rag/query through Kong.
  annotations:
    backstage.io/techdocs-ref: dir:.
    demo/ui: "RAG Pipeline — query JSL docs with hybrid retrieval and source citations"
    demo/wow: "Drop a new PDF into rag/docs/incoming/ — Camel auto-indexes it in <20s"
spec:
  type: service
  lifecycle: production
  owner: platform-team
  system: jslmind-platform
  providesApis:
    - rag-query-api
```

**Step 2: Add entry to catalog root location**

In `catalog/catalog-info.yaml`, add the new target:

```yaml
spec:
  targets:
    - ./domain/manufacturing.yaml
    - ./system/jslmind-platform.yaml
    - ./agents/inventory-agent.yaml
    - ./agents/cbm-agent.yaml
    - ./agents/quality-agent.yaml
    - ./integrations/sap-mm-connector.yaml
    - ./integrations/kepware-opc-connector.yaml
    - ./data-products/rag-pipeline.yaml     # ← add this line
```

**Step 3: Commit**

```bash
git add catalog/data-products/rag-pipeline.yaml catalog/catalog-info.yaml
git commit -m "feat: register RAG pipeline in Backstage catalog"
```

---

## Task 10: Verification Script + End-to-End Smoke Test

**Goal:** Script that verifies Phase 4 is working end-to-end. Mirrors `verify-phase3.sh` style.

**Files:**
- Create: `scripts/verify-phase4.sh`

**Step 1: Create the script**

Create `scripts/verify-phase4.sh`:

```bash
#!/usr/bin/env bash
# verify-phase4.sh — Phase 4: Hybrid RAG smoke tests
# Usage: ./scripts/verify-phase4.sh
# Prerequisite: docker compose up rag-service qdrant camel-integration litellm-proxy

set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
PASS=0; FAIL=0

check() {
  local name="$1"; local cmd="$2"
  if eval "$cmd" &>/dev/null; then
    echo -e "${GREEN}✓${NC} $name"; ((PASS++))
  else
    echo -e "${RED}✗${NC} $name"; ((FAIL++))
  fi
}

echo "=== Phase 4: Hybrid RAG Verification ==="
echo ""

# 1. RAG service health
check "rag-service /health returns ok" \
  "curl -sf http://localhost:8001/health | grep -q 'ok'"

# 2. Qdrant collection exists
check "Qdrant collection jsl_docs exists" \
  "curl -sf http://localhost:6333/collections/jsl_docs | grep -q 'jsl_docs'"

# 3. Qdrant has vectors (corpus was seeded)
check "Qdrant jsl_docs has >100 vectors" \
  "[ \$(curl -s http://localhost:6333/collections/jsl_docs | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d['result']['vectors_count'])\") -gt 100 ]"

# 4. BM25 index exists
check "BM25 index file exists in rag-service container" \
  "docker compose exec rag-service test -f /docs/bm25_index.pkl"

# 5. /query returns answer and sources
QUERY_RESP=$(curl -sf -X POST http://localhost:8001/query \
  -H 'Content-Type: application/json' \
  -d '{"query": "What is the max carbon content for Grade 316L?", "top_k": 3}' || echo '{}')
check "/query returns answer field" \
  "echo '$QUERY_RESP' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert 'answer' in d\""
check "/query returns at least 1 source citation" \
  "echo '$QUERY_RESP' | python3 -c \"import sys,json; d=json.load(sys.stdin); assert len(d.get('sources',[])) > 0\""

# 6. /query with grade filter
check "/query with grade filter succeeds" \
  "curl -sf -X POST http://localhost:8001/query \
    -H 'Content-Type: application/json' \
    -d '{\"query\": \"surface finish\", \"filters\": {\"grade\": \"304\"}, \"top_k\": 2}' | grep -q 'answer'"

# 7. Kong routes /rag/query
check "Kong /rag/query returns 200" \
  "curl -sf -X POST http://localhost:8000/rag/query \
    -H 'Content-Type: application/json' \
    -d '{\"query\": \"carbon content Grade 304\"}' | grep -q 'answer'"

# 8. Camel route health
check "Camel FileToQdrantRoute is UP" \
  "curl -sf http://localhost:8090/actuator/health | grep -q 'UP'"

# 9. Backstage catalog entity
check "Backstage catalog shows rag-pipeline entity" \
  "curl -sf 'http://localhost:7007/api/catalog/entities?filter=metadata.name=rag-pipeline' | grep -q 'rag-pipeline'"

# 10. Live ingest test
echo ""
echo "--- Live ingest test: dropping test file ---"
TEST_FILE="rag/docs/incoming/live_test_$(date +%s).txt"
echo "JSL Live Test: Maximum carbon content for Grade 316L is 0.03 percent." > "$TEST_FILE"
sleep 8  # wait for Camel poll + ingest
check "Live-dropped file was ingested (vector count increased)" \
  "[ \$(curl -s http://localhost:6333/collections/jsl_docs | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d['result']['vectors_count'])\") -gt 100 ]"
rm -f "$TEST_FILE"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && echo -e "${GREEN}Phase 4 verification PASSED${NC}" || echo -e "${RED}Phase 4 verification FAILED${NC}"
exit "$FAIL"
```

**Step 2: Make executable**

```bash
chmod +x scripts/verify-phase4.sh
```

**Step 3: Commit**

```bash
git add scripts/verify-phase4.sh
git commit -m "test: add verify-phase4 script for Hybrid RAG end-to-end checks"
```

---

## Final: Generate Corpus and Smoke Test Locally

**Step 1: Generate the corpus**

```bash
cd /Users/navinnair/dev/platform_engg/JSLMind
pip install reportlab python-docx
python rag/docs/generate_corpus.py
ls rag/docs/corpus/ | wc -l
# Expected: 20
```

**Step 2: Start Phase 4 services**

```bash
docker compose up -d qdrant litellm-proxy ollama rag-service camel-integration
docker compose ps
# Expected: all 5 services Up
```

**Step 3: Run verification**

```bash
./scripts/verify-phase4.sh
# Expected: 10 passed, 0 failed
```

**Step 4: Demo query**

```bash
curl -s -X POST http://localhost:8001/query \
  -H 'Content-Type: application/json' \
  -d '{"query": "Max carbon content for Grade 316L?"}' | python3 -m json.tool
```

---

## Summary of Files Created

| File | Purpose |
|---|---|
| `rag/docs/generate_corpus.py` | Generates 20 synthetic JSL PDFs and Word docs |
| `rag/docs/incoming/.gitkeep` | Watch directory for live Camel file drops |
| `rag/ingestion/__init__.py` | Package init |
| `rag/ingestion/bm25_store.py` | BM25 sparse index (rank-bm25, pickled) |
| `rag/ingestion/embedding_pipeline.py` | Parse → embed → Qdrant + BM25 |
| `rag/retrieval/__init__.py` | Package init |
| `rag/retrieval/hybrid_retriever.py` | RRF fusion + LLM answer generation |
| `rag/app.py` | FastAPI app: /health, /ingest, /query |
| `rag/seed_corpus.py` | Seeds Qdrant with corpus on container startup |
| `rag/requirements.txt` | Python dependencies |
| `rag/Dockerfile` | Container build |
| `rag/tests/test_bm25_store.py` | 4 BM25 unit tests |
| `rag/tests/test_embedding_pipeline.py` | 7 pipeline unit tests |
| `rag/tests/test_hybrid_retriever.py` | 6 retriever unit tests |
| `rag/tests/test_app.py` | 5 API endpoint tests |
| `integration/pom.xml` | Maven build |
| `integration/Dockerfile` | Camel SpringBoot container |
| `integration/src/.../JSLMindIntegrationApp.java` | Spring Boot main |
| `integration/src/.../FileToQdrantRoute.java` | Camel file watcher |
| `integration/src/.../SapToBronzeRoute.java` | Medallion stub |
| `docker-compose.yml` | Add volume + env to camel-integration |
| `catalog/data-products/rag-pipeline.yaml` | Backstage entity |
| `catalog/catalog-info.yaml` | Add rag-pipeline target |
| `scripts/verify-phase4.sh` | 10-check end-to-end verification |
