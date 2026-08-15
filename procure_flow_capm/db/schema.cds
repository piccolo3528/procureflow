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
