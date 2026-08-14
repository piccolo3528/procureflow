# ProcureFlow: Enterprise Procurement Management System
**Document Type**: Master Blueprint (BRD, SRS, FS, Architecture)
**Author**: Senior SAP Functional Consultant / Enterprise Business Analyst
**Status**: Final Draft for Sign-off

---

## 1. PROJECT PURPOSE

**Why companies need procurement systems**
In modern enterprise environments, purchasing without a unified system leads to massive inefficiencies. Companies need procurement systems to enforce compliance, gain visibility into spending, prevent fraud, ensure budget adherence, and streamline communication between employees, management, finance, and external vendors.

**Problems without procurement**
- **Maverick Spend**: Employees buying outside negotiated contracts.
- **Lack of Visibility**: No real-time tracking of budgets vs. actuals.
- **Manual Errors**: Paper-based or email-based approvals lead to lost requests, delayed purchasing, and invoice mismatches.
- **Vendor Risk**: Unvetted vendors causing compliance or quality issues.
- **Delayed Payments**: Lack of 3-way matching causes late payments and missed early-payment discounts.

**Benefits**
- **Cost Reduction**: Enforced contracts and preferred vendor usage.
- **Process Efficiency**: Automated approval workflows based on predefined matrices.
- **Compliance & Auditability**: Every action is timestamped and auditable.
- **Financial Control**: Real-time budget checks before PO generation.

**Target users**
Fortune 500 companies across industries (Manufacturing, IT Services, Retail, Pharmaceuticals) requiring strict internal controls and high-volume purchasing capabilities.

**Business value**
Transforms procurement from a tactical back-office function into a strategic asset. ProcureFlow provides end-to-end transparency, reducing Procure-to-Pay (P2P) cycle times by up to 60% and ensuring 100% budget compliance.

---

## 2. BUSINESS PROCESS (Procure-to-Pay End-to-End)

**1. Employee needs laptop**: An employee identifies a business need.
**2. Employee creates Purchase Request (PR)**:
   - *Who*: Employee
   - *Inputs*: Item details, justification, required date, cost center.
   - *Outputs*: PR Document (Status: Submitted).
   - *Rules*: Must include justification. Cost center defaults to employee's department.
**3. Manager Review**:
   - *Who*: Department Manager
   - *Logic*: System routes based on hierarchy. Manager reviews business need.
   - *Outputs*: PR Approved or Rejected.
**4. Finance Review & 5. Budget Validation**:
   - *Who*: Finance Controller
   - *Logic*: System checks if PR amount < Available Budget. Finance manually verifies GL account and budget.
   - *Outputs*: Financial Approval.
**6. Procurement Team Review**:
   - *Who*: Buyer / Procurement Agent
   - *Logic*: Reviews PR for completeness. Consolidates requests if needed.
**7. Vendor Comparison & 8. Vendor Selection**:
   - *Who*: Buyer
   - *Logic*: Checks preferred vendors. If above threshold, triggers RFQ (out of scope for this basic flow, defaults to preferred vendor).
**9. Purchase Order (PO) Generation**:
   - *Who*: Buyer (or automated)
   - *Outputs*: PO Document sent to Vendor. (Status: PO Generated).
**10. Vendor Shipment**:
   - *Who*: Vendor
   - *Logic*: Vendor fulfills the order and ships physically or digitally.
**11. Goods Receipt (GR) & 12. Quality Inspection**:
   - *Who*: Receiver / Warehouse / Employee
   - *Inputs*: Delivery note, physical goods.
   - *Outputs*: Material Document / GR Slip. (Status: Goods Received).
   - *Exceptions*: Damages lead to Return Delivery or partial receipt.
**13. Invoice Upload**:
   - *Who*: Vendor or AP Clerk
   - *Inputs*: PDF Invoice, PO Reference.
**14. Invoice Verification (3-Way Match)**:
   - *Who*: System / AP Clerk
   - *Logic*: PO Qty/Price == GR Qty == Invoice Qty/Price.
   - *Outputs*: Verified Invoice (Status: Payment Pending).
   - *Exceptions*: Quantity or price blocks require manual clearing.
**15. Finance Payment**:
   - *Who*: Accounts Payable / Finance System (ERP integration)
   - *Outputs*: Payment Run. (Status: Paid).
**16. Request Closed**: System marks PR and PO as completed.

---

## 3. ROLES

| Role | Responsibilities | Permissions & Allowed Actions | Restricted Actions | Visibility |
|---|---|---|---|---|
| **Employee** | Create PRs, track status, perform GR for personal items. | Create PR, Edit Draft, Cancel PR, Upload Attachment. | Cannot approve PRs, cannot create POs, cannot view other departments' PRs. | Own PRs, own assets. |
| **Manager** | Review business justification, approve/reject PRs. | Approve/Reject PRs, Send back for rework, View team spend. | Cannot create POs, cannot approve Finance steps. | Team's PRs, Team Budget. |
| **Finance** | Validate budgets, approve high-value PRs, verify invoices, process payments. | Approve/Reject financial step, View budgets, Process Invoices. | Cannot create PRs (unless for self), cannot select vendors. | Enterprise budgets, All PRs, Invoices, Payments. |
| **Procurement** | Manage vendors, source items, create POs. | Generate PO, Edit PR (buyer changes), Manage Vendors, Blacklist Vendors. | Cannot approve Manager/Finance steps, cannot pay invoices. | All PRs, All POs, Vendor Master Data. |
| **Vendor** | Receive POs, fulfill orders, submit invoices. | View assigned POs, Upload Invoices, Update contact details. | Cannot view internal approval flows, cannot view other vendors. | Own POs, Own Invoices, Own Profile. |
| **Admin** | System configuration, user management, matrix setup. | Add/Remove users, Configure Approval Matrix, Manage Master Data. | Should not process business documents (PR/PO). | Entire system. |

---

## 4. MODULES

### MODULE 1: Dashboard
- **Purpose**: Landing page providing role-specific insights and quick navigation.
- **Widgets/Cards**: Quick Create PR, Pending Tasks count, Active POs count.
- **KPIs**: Total Spend YTD, Budget Utilization %, Average Approval Time.
- **Charts**: Bar chart (Spend by Department), Doughnut chart (Spend by Category).
- **Recent Activities**: Table showing last 5 PRs/POs created or modified.
- **Role-specific**: 
  - *Employee*: Focuses on "My Requests".
  - *Manager*: Focuses on "Pending Approvals" and "Team Budget".
  - *Finance*: Focuses on "Pending Invoices" and "Global Spend".

### MODULE 2: Purchase Request
- **Purpose**: Capture business requirements for goods/services.
- **Fields**: PR ID (Auto-generated), Title, Requestor, Cost Center, Required Date, Justification, Total Amount.
- **Line Items**: Material/Service Description, Quantity, UoM, Estimated Price, Currency.
- **Workflow Actions**: Save as Draft, Submit, Cancel, Edit (if draft/reworked), Delete (if draft).
- **Validations**: Required Date must be > Today. Justification mandatory for > $500.

### MODULE 3: Approval Center
- **Purpose**: Centralized inbox for Managers and Finance to process workflow items.
- **Layout**: Master-Detail (sap.f.FlexibleColumnLayout). Left side lists tasks; right side shows PR details, justification, and budget impact.
- **Actions**: Approve, Reject, Send Back (requires comment). Bulk approval (optional, configurable).
- **SLA/Escalation**: If unapproved for 3 days, reminder sent. If 5 days, escalated to Manager's Manager.

### MODULE 4: Vendor Management
- **Purpose**: Maintain Vendor Master Data (Business Partners).
- **Sections**: General Info (Name, Tax ID), Contacts, Bank Details, Contracts.
- **Features**: Vendor Rating (1-5 stars based on delivery/quality), Spend tracking.
- **Status**: Active, Inactive, Blacklisted. (POs cannot be raised for Inactive/Blacklisted).

### MODULE 5: Purchase Orders
- **Purpose**: Legally binding document sent to vendors.
- **Features**: Generated automatically from approved PRs or manually by Procurement.
- **Sections**: Header (Vendor, Terms, Tax), Items (Materials, Net Price, Tax Code).
- **Actions**: Output output (PDF generation, Email to Vendor), Cancel PO, Versioning (PO Amendments).

### MODULE 6: Goods Receipt
- **Purpose**: Acknowledge physical or digital receipt of items.
- **Features**: Reference PO, enter Received Quantity.
- **Validations**: Cannot receive more than Ordered Quantity + Tolerance %.
- **Actions**: Accept, Reject (damage/quality fail). Updates inventory/asset ledger.

### MODULE 7: Invoices
- **Purpose**: Vendor billing management.
- **Features**: Upload PDF (OCR extraction future scope), manual entry of Invoice #, Date, Amount, Tax.
- **Matching**: System highlights mismatches between PO, GR, and Invoice (3-Way Match).
- **Validations**: Amount cannot exceed PO Amount + Tolerance.

### MODULE 8: Payments
- **Purpose**: Track clearing of AP items.
- **Status**: Pending, Paid, Failed.
- **Fields**: Payment Method (Wire, ACH, Check), Reference Number, Clearing Date.

### MODULE 9: Reports
- **Purpose**: Analytical insights.
- **Reports**: Spend Analysis, Vendor Performance, PR-to-PO Cycle Time, Budget Variance.
- **Features**: Filters (Date range, Department, Vendor), Export to Excel/CSV, Drill Down to document level.

### MODULE 10: User Management
- **Purpose**: Security and Access.
- **Features**: Assign Roles, Map to Departments, Deactivate users (never hard delete to preserve audit trails).

### MODULE 11: Settings
- **Purpose**: System configuration.
- **Features**: Maintain Currencies/Exchange Rates, Tax Codes, Approval Matrix Thresholds, Master Data (Cost Centers).

---

## 5. DATABASE DESIGN (ER Diagram Concept)

**Core Entities & Relationships**:
- **User** (1) --- (M) **PurchaseRequest** (Requestor)
- **Department** (1) --- (M) **User**
- **Vendor** (1) --- (M) **PurchaseOrder**
- **PurchaseRequest** (1) --- (M) **PR_Item**
- **PurchaseRequest** (1) --- (1..M) **PurchaseOrder** (1 PR can split into multiple POs for different vendors, or 1 PO maps to 1 PR).
- **PurchaseOrder** (1) --- (M) **PO_Item**
- **PO_Item** (1) --- (M) **GoodsReceipt_Item**
- **PurchaseOrder** (1) --- (M) **Invoice**
- **Invoice** (1) --- (M) **Payment**

**Normalization**: 3NF applied. Master data (Vendors, Users) separated from transactional data (PR, PO, GR).

---

## 6. BUSINESS RULES
1. **Segregation of Duties**: An employee cannot approve their own PR, even if they hold a Manager role.
2. **Financial Control**: Purchase Orders cannot be generated without an Approved PR.
3. **Tolerance Limits**: Invoice amount cannot exceed PO amount by more than 5% or $100 (whichever is lower).
4. **Budget Check**: PR submission is blocked (hard error) or warns (soft error) if the department budget goes negative.
5. **Vendor Validation**: POs can only be issued to Vendors with status = 'Active'.
6. **Workflow Integrity**: A rejected PR reverts to 'Draft' or is 'Cancelled'; it cannot move forward without rework and resubmission.

---

## 7. APPROVAL MATRIX
- **<= $1,000**: Direct Manager Approval.
- **> $1,000 and <= $10,000**: Manager -> Finance Controller.
- **> $10,000**: Manager -> Finance Controller -> Procurement Head.
- **Emergency Purchase flag**: Routes immediately to CEO/CFO queue bypassing standard hierarchy, requires mandatory "Emergency Justification" attachment.

---

## 8. STATUS FLOW
1. **Draft**: Initial creation.
2. **Submitted**: Awaiting first approver.
3. **Pending Manager Approval** / **Pending Finance Approval**: In workflow.
4. **Approved / Pending Procurement**: Ready for PO creation.
5. **PO Generated**: Document sent to vendor.
6. **Shipped**: Vendor confirms dispatch.
7. **Goods Received**: Partial or Full delivery complete.
8. **Invoice Uploaded**: Pending AP verification.
9. **Payment Pending**: Verified, awaiting payment run.
10. **Paid / Completed**: Lifecycle finished.
11. **Rejected**: Stopped by approver.
12. **Cancelled**: Stopped by creator.

---

## 9. NOTIFICATIONS (Event-Driven)
- **Email/In-App**: 
  - To Manager: "Action Required: PR-2026-001 Pending Approval"
  - To Employee: "Approved: Your PR has been approved" OR "Rejected: PR needs rework"
  - To Vendor: "New Purchase Order PO-9901 attached"
  - To Finance: "Alert: Department IT budget exceeded 90% utilization"
- **Escalation**: Sent to N+1 manager if SLA (e.g., 48 hours) is breached.

---

## 10. AUDIT LOGS
- **Tracking**: `sys_created_by`, `sys_created_on`, `sys_updated_by`, `sys_updated_on`.
- **Change History**: A dedicated `AuditLog` table stores `DocumentID`, `TableName`, `FieldName`, `OldValue`, `NewValue`, `UserID`, `Timestamp`. (e.g., "Quantity changed from 5 to 10 by Alex on 2026-07-27").

---

## 11. SECURITY
- **Authentication**: Single Sign-On (SSO) via Corporate Identity Provider (SAML 2.0 / OAuth 2.0).
- **Authorization**: Role-Based Access Control (RBAC).
- **Session**: 30-minute idle timeout.
- **Data Security**: TLS 1.2+ for data in transit. AES-256 for data at rest (Bank details, Tax IDs).

---

## 12. NON-FUNCTIONAL REQUIREMENTS (NFR)
- **Performance**: Dashboard must load in < 2 seconds. Search queries < 1 second.
- **Availability**: 99.9% Uptime (Cloud deployment).
- **Scalability**: Must handle 10,000+ PRs per month and 5,000 concurrent users.
- **Responsiveness**: UI5 framework ensures mobile, tablet, and desktop compatibility.
- **Accessibility**: WCAG 2.1 AA compliance (Screen reader support, high contrast Fiori themes).

---

## 13. SAP BTP IMPLEMENTATION MAPPING
- **SAP CAP (Cloud Application Programming)**: Node.js/Java backend for business logic, validations, and workflow routing.
- **SAP HANA Cloud**: In-memory relational database for storing PR/PO/Vendor tables and Audit Logs.
- **SAP UI5 / Fiori Elements**: Frontend technology for responsive, enterprise-grade UX.
- **OData V4**: Protocol for frontend-backend communication, ensuring standardized querying and deep inserts.
- **XSUAA (Authorization & Trust Management)**: Handles OAuth2 security, role collections (Manager, Employee), and token validation.
- **Destination Service**: To connect ProcureFlow securely to an on-premise SAP S/4HANA backend (for pushing FI-AP postings).
- **HTML5 Repository**: Hosting the UI5 application in BTP.
- **Job Scheduler**: For running daily batch jobs (e.g., SLA escalation checks, Exchange rate updates).
- **SAP Build Process Automation**: Replaces hardcoded workflows; visually model the PR Approval Matrix.
- **Event Mesh**: Pub/Sub architecture (e.g., when PO is created, emit event so AP system prepares for invoice).

---
---

## APPENDICES

### 1. BRD (Business Requirements Document) Snippet
**Objective**: Automate the manual, email-driven procurement process to achieve 100% visibility and reduce cycle time by 60%.
**Scope**: Indirect Procurement (IT, Facilities, Office Supplies). Direct material procurement (BOMs) is out of scope for Phase 1.
**Key Stakeholders**: CFO, CPO, IT Director.

### 2. Functional Specification (FS) Snippet
**FR-01 (PR Creation)**: The system shall allow users to create a PR with multiple line items.
**FR-02 (Budget Validation)**: The system shall calculate `Sum(Line Items)` against the `CostCenter.AvailableBudget`. If `> Budget`, system shall display error `E001: Budget Exceeded`.
**FR-03 (Workflow)**: The system shall determine the next approver dynamically by reading the `ApprovalMatrix` table using the `TotalAmount` and `CostCenter`.

### 3. User Stories
- **US-01**: As an Employee, I want to create a PR so that I can request a new laptop.
- **US-02**: As a Manager, I want to approve/reject PRs from my mobile device so that purchasing is not delayed when I am travelling.
- **US-03**: As a Finance Controller, I want to view a budget utilization chart so that I can prevent overspending before approving a PR.

### 4. Acceptance Criteria (for US-01)
- **AC1**: User can add/remove items to the PR.
- **AC2**: Total amount calculates automatically based on Qty * Price.
- **AC3**: Clicking "Submit" changes status to "Submitted" and triggers email to the assigned Manager.

### 5. Screen List
1. Launchpad / Dashboard
2. PR Master List
3. PR Object Page (Detail)
4. Approval Center (Split Screen)
5. Vendor Master List
6. Vendor Object Page
7. PO Master List
8. PO Object Page
9. Goods Receipt App
10. Invoice Verification App

### 6. Navigation Flow
`Fiori Launchpad` -> `Tile (Purchase Requests)` -> `List Report` -> Click Item -> `Object Page` -> Click 'Edit' -> `Edit Mode` -> Click 'Save' -> Return to `Object Page`.

### 7. API List (OData Entities)
- `/PurchaseRequests` (GET, POST, PATCH, DELETE)
- `/PurchaseRequestItems`
- `/PurchaseOrders`
- `/Vendors`
- `/Invoices`
- `/Budgets`
- `/Users`
- `/ApprovePR` (Function Import / Bound Action)
- `/RejectPR` (Function Import / Bound Action)

### 8. Database Tables (HANA CDS View entities)
- `db.master.Users`
- `db.master.Departments`
- `db.master.Vendors`
- `db.master.CostCenters`
- `db.transactional.PurchaseRequests`
- `db.transactional.PR_Items`
- `db.transactional.PurchaseOrders`
- `db.transactional.PO_Items`
- `db.transactional.Invoices`
- `db.log.AuditLog`

### 9. Future Enhancements (Phase 2)
- **AI/GenAI Integration**: "Ask ProcureFlow" chatbot to check PR status.
- **OCR Invoice Scanning**: Integration with SAP Document Information Extraction.
- **Supplier Portal**: External facing BTP app for vendors to bid on RFQs.
- **PunchOut Catalogs**: Integration with Amazon Business or Dell portals directly inside the PR creation screen.

---
*End of Blueprint Document*
