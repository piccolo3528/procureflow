using procureflow from '../db/schema';

service ProcureFlowService {
    entity Users as projection on procureflow.Users;
    entity PurchaseRequests as projection on procureflow.PurchaseRequests;
    entity PurchaseRequestItems as projection on procureflow.PurchaseRequestItems;
    entity Vendors as projection on procureflow.Vendors;
    entity Metrics as projection on procureflow.Metrics;
    entity AppState as projection on procureflow.AppState;
    entity Roles as projection on procureflow.Roles;
    entity PurchaseOrders as projection on procureflow.PurchaseOrders;
    entity PurchaseOrderItems as projection on procureflow.PurchaseOrderItems;
    entity GoodsReceipts as projection on procureflow.GoodsReceipts;
    entity GoodsReceiptItems as projection on procureflow.GoodsReceiptItems;
}
