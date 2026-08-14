namespace procureflow;

using { managed } from '@sap/cds/common';

entity Users {
    key ID     : String;
    name       : String;
    role       : String;
    dept       : String;
    avatar     : String;
}

entity PurchaseRequests : managed {
    key ID         : String;
    title          : String;
    requestor      : String;
    date           : Date;
    amount         : Decimal(15,2);
    currency       : String(3);
    status         : String;
    priority       : String;
    department     : String;
    vendor         : String;
    justification  : String;
    items          : Composition of many PurchaseRequestItems on items.parent = $self;
}

entity PurchaseRequestItems {
    key ID      : String;
    parent      : Association to PurchaseRequests;
    description : String;
    qty         : Integer;
    price       : Decimal(15,2);
}

entity Vendors {
    key ID     : String;
    name       : String;
    category   : String;
    rating     : Decimal(3,1);
    status     : String;
    spend      : Decimal(15,2);
}

entity Metrics {
    key ID             : String;
    totalSpend         : Decimal(15,2);
    pendingApprovals   : Integer;
    activePOs          : Integer;
    budgetUtilization  : Integer;
}

entity AppState {
    key ID             : String;
    currentUserRole    : String;
    sidebarExpanded    : Boolean;
}

entity Roles {
    key name : String;
}

entity PurchaseOrders : managed {
    key ID         : String;
    title          : String;
    vendor         : String;
    date           : Date;
    amount         : Decimal(15,2);
    currency       : String(3);
    status         : String;
    buyer          : String;
    prID           : String;
    items          : Composition of many PurchaseOrderItems on items.parent = $self;
}

entity PurchaseOrderItems {
    key ID      : String;
    parent      : Association to PurchaseOrders;
    description : String;
    qty         : Integer;
    price       : Decimal(15,2);
}

entity GoodsReceipts : managed {
    key ID         : String;
    poID           : String;
    date           : Date;
    receiver       : String;
    status         : String;
    notes          : String;
    items          : Composition of many GoodsReceiptItems on items.parent = $self;
}

entity GoodsReceiptItems {
    key ID          : String;
    parent          : Association to GoodsReceipts;
    description     : String;
    qtyOrdered      : Integer;
    qtyReceived     : Integer;
    condition       : String;
}
