namespace procureflow;

using { managed, cuid } from '@sap/cds/common';

entity Departments {
    key ID              : String;
    name                : String;
    budgetAvailable     : Decimal(15,2) default 0;
    budgetUsed          : Decimal(15,2) default 0;
    manager             : Association to Users;
}

entity Users {
    key ID         : String;
    name           : String;
    email          : String;
    role           : String;
    active         : Boolean default true;
    avatar         : String;
    department     : Association to Departments;
    manager        : Association to Users;
}

entity Roles {
    key name : String;
}

entity Vendors {
    key ID              : String;
    name                : String;
    category            : String;
    type                : String;
    contactPerson       : String;
    email               : String;
    phone               : String;
    address             : String;
    taxId               : String;
    paymentTerms        : String;
    rating              : Decimal(3,1) default 0;
    performanceScore    : Integer default 0;
    status              : String default 'Pending'; // Pending, Active, Inactive, Blocked
    spend               : Decimal(15,2) default 0;
}

entity PurchaseRequests : managed {
    key ID          : String;
    title           : String;
    requestor       : Association to Users;
    department      : Association to Departments;
    date            : Date;
    requiredDate    : Date;
    submittedAt     : Timestamp;
    amount          : Decimal(15,2) default 0;
    currency        : String(3) default 'USD';
    status          : String default 'Draft';
    priority        : String default 'Normal';
    vendor          : Association to Vendors;
    justification   : String;
    cancelReason    : String;
    // approval stages derived from the approval matrix at submit time, e.g. "Manager>Finance>Head"
    approvalRoute   : String;
    budgetCommitted : Boolean default false;
    items           : Composition of many PurchaseRequestItems on items.parent = $self;
    approvalHistory : Association to many ApprovalHistory on approvalHistory.request = $self;
    comments        : Association to many Comments on comments.request = $self;
    purchaseOrders  : Association to many PurchaseOrders on purchaseOrders.request = $self;
}

entity PurchaseRequestItems {
    key ID          : String;
    parent          : Association to PurchaseRequests;
    description     : String;
    category        : String;
    unit            : String;
    qty             : Integer default 1;
    price           : Decimal(15,2) default 0;
    total           : Decimal(15,2) default 0;
    requiredDate    : Date;
    notes           : String;
}

entity ApprovalHistory : cuid {
    request     : Association to PurchaseRequests;
    action      : String; // Submitted, Approved, Rejected, ChangesRequested, VendorSelected, POGenerated, GoodsReceived, Cancelled
    actor       : Association to Users;
    role        : String;
    comment     : String;
    fromStatus  : String;
    toStatus    : String;
    createdAt   : Timestamp @cds.on.insert : $now;
}

entity Comments : cuid {
    request     : Association to PurchaseRequests;
    author      : Association to Users;
    text        : String;
    createdAt   : Timestamp @cds.on.insert : $now;
}

entity AuditLogs : cuid {
    user            : Association to Users;
    action          : String;
    businessObject  : String;
    documentID      : String;
    previousValue   : String;
    newValue        : String;
    createdAt       : Timestamp @cds.on.insert : $now;
}

entity PurchaseOrders : managed {
    key ID              : String;
    request             : Association to PurchaseRequests;
    vendor              : Association to Vendors;
    date                : Date;
    currency            : String(3) default 'USD';
    amount              : Decimal(15,2) default 0;
    taxAmount           : Decimal(15,2) default 0;
    status              : String default 'Issued'; // Issued, Partially Received, Closed, Cancelled
    buyer               : Association to Users;
    deliveryAddress     : String;
    paymentTerms        : String;
    items               : Composition of many PurchaseOrderItems on items.parent = $self;
    goodsReceipts       : Association to many GoodsReceipts on goodsReceipts.purchaseOrder = $self;
    invoices            : Association to many Invoices on invoices.purchaseOrder = $self;
}

entity PurchaseOrderItems {
    key ID                  : String;
    parent                  : Association to PurchaseOrders;
    description             : String;
    qty                     : Integer default 0;
    price                   : Decimal(15,2) default 0;
    taxAmount               : Decimal(15,2) default 0;
    total                   : Decimal(15,2) default 0;
    expectedDeliveryDate    : Date;
    qtyReceived             : Integer default 0;
    qtyInvoiced             : Integer default 0;
}

entity GoodsReceipts : managed {
    key ID              : String;
    purchaseOrder       : Association to PurchaseOrders;
    date                : Date;
    receivedBy          : Association to Users;
    location            : String;
    status              : String default 'Posted';
    notes               : String;
    items               : Composition of many GoodsReceiptItems on items.parent = $self;
}

entity GoodsReceiptItems {
    key ID              : String;
    parent              : Association to GoodsReceipts;
    orderItem           : Association to PurchaseOrderItems;
    description         : String;
    qtyOrdered          : Integer default 0;
    qtyReceived         : Integer default 0;
    qtyRejected         : Integer default 0;
    inspectionResult    : String; // Good, Damaged, Incomplete
    damageInfo          : String;
    remarks             : String;
}

// ---------------------------------------------------------------------------
// Accounts Payable: Invoices (3-way match) and Payments
// ---------------------------------------------------------------------------

entity Invoices : managed {
    key ID              : String;
    purchaseOrder       : Association to PurchaseOrders;
    vendor              : Association to Vendors;
    vendorInvoiceNo     : String;
    invoiceDate         : Date;
    dueDate             : Date;
    currency            : String(3) default 'USD';
    netAmount           : Decimal(15,2) default 0;  // sum of invoice lines
    taxAmount           : Decimal(15,2) default 0;
    amount              : Decimal(15,2) default 0;  // gross = net + tax
    expectedAmount      : Decimal(15,2) default 0;  // invoiced qty x PO price
    variance            : Decimal(15,2) default 0;  // netAmount - expectedAmount
    status              : String default 'Payment Pending'; // Payment Pending, Blocked, Paid, Rejected
    blockReason         : String;
    resolutionNote      : String;
    postedBy            : Association to Users;
    items               : Composition of many InvoiceItems on items.parent = $self;
    payments            : Association to many Payments on payments.invoice = $self;
}

entity InvoiceItems {
    key ID              : String;
    parent              : Association to Invoices;
    orderItem           : Association to PurchaseOrderItems;
    description         : String;
    qty                 : Integer default 0;
    price               : Decimal(15,2) default 0;
    total               : Decimal(15,2) default 0;
    poPrice             : Decimal(15,2) default 0;
    qtyBillable         : Integer default 0;  // received - previously invoiced, at posting time
    matchStatus         : String;             // Matched, Quantity Variance, Price Variance
}

entity Payments : managed {
    key ID              : String;
    invoice             : Association to Invoices;
    vendor              : Association to Vendors;
    amount              : Decimal(15,2) default 0;
    currency            : String(3) default 'USD';
    method              : String;  // Wire, ACH, Check
    reference           : String;
    clearingDate        : Date;
    status              : String default 'Paid'; // Pending, Paid, Failed
    paidBy              : Association to Users;
}

// ---------------------------------------------------------------------------
// Configuration & notifications
// ---------------------------------------------------------------------------

// single-row configuration table (ID = 'default') - approval matrix and AP tolerances
entity Settings {
    key ID                  : String;
    managerOnlyLimit        : Decimal(15,2) default 1000;   // <= this: Manager approval only
    headApprovalLimit       : Decimal(15,2) default 10000;  // >  this: + Procurement Head approval
    invoiceTolerancePct     : Decimal(5,2)  default 5;      // invoice may exceed PO by this % ...
    invoiceToleranceAbs     : Decimal(15,2) default 100;    // ... or this amount, whichever is lower
    grOverDeliveryPct       : Decimal(5,2)  default 0;      // goods receipt over-delivery tolerance
    approvalSlaDays         : Integer       default 3;
    defaultCurrency         : String(3)     default 'USD';
}

entity Notifications : cuid {
    recipient   : Association to Users;
    title       : String;
    message     : String;
    documentID  : String;
    priority    : String default 'Medium';
    isRead      : Boolean default false;
    createdAt   : Timestamp @cds.on.insert : $now;
}
