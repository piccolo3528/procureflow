using procureflow from '../db/schema';

@requires: 'authenticated-user'
service ProcureFlowService {

    entity Users as projection on procureflow.Users;
    entity Departments as projection on procureflow.Departments;
    entity Roles as projection on procureflow.Roles;

    @(restrict: [
        { grant: 'READ', to: 'authenticated-user' },
        { grant: ['CREATE', 'UPDATE'], to: ['Procurement', 'Admin'] }
    ])
    entity Vendors as projection on procureflow.Vendors;

    entity PurchaseRequests as projection on procureflow.PurchaseRequests actions {
        action submit();
        @requires: ['Manager', 'Finance', 'Admin']
        action approve(comment: String);
        @requires: ['Manager', 'Finance', 'Admin']
        action rejectRequest(reason: String @mandatory);
        @requires: ['Manager', 'Finance', 'Admin']
        action requestChanges(comment: String @mandatory);
        action cancel(reason: String);
        @requires: ['Procurement', 'Admin']
        action selectVendor(vendor: String @mandatory, reason: String);
        @requires: ['Procurement', 'Admin']
        action generatePO();
        action addComment(text: String @mandatory);
    };

    entity PurchaseRequestItems as projection on procureflow.PurchaseRequestItems;

    @readonly
    entity ApprovalHistory as projection on procureflow.ApprovalHistory;

    @readonly
    entity Comments as projection on procureflow.Comments;

    @readonly
    entity AuditLogs as projection on procureflow.AuditLogs;

    @readonly
    entity PurchaseOrders as projection on procureflow.PurchaseOrders actions {
        @requires: ['Procurement', 'Admin']
        action recordGoodsReceipt(
            location    : String,
            notes       : String,
            items       : many {
                orderItem        : String @mandatory;
                qtyReceived      : Integer @mandatory;
                qtyRejected      : Integer;
                inspectionResult : String;
                damageInfo       : String;
                remarks          : String;
            }
        );
        @requires: ['Procurement', 'Admin']
        action cancel(reason: String);
    };

    @readonly
    entity PurchaseOrderItems as projection on procureflow.PurchaseOrderItems;
    @readonly
    entity GoodsReceipts as projection on procureflow.GoodsReceipts;
    @readonly
    entity GoodsReceiptItems as projection on procureflow.GoodsReceiptItems;
}
