using procureflow from '../db/schema';

@requires: 'authenticated-user'
service ProcureFlowService {

    // ------------------------------------------------------------------
    // Master data
    // ------------------------------------------------------------------

    @(restrict: [
        { grant: 'READ',   to: 'authenticated-user' },
        { grant: 'UPDATE', to: 'Admin' }
    ])
    entity Users as projection on procureflow.Users;

    @(restrict: [
        { grant: 'READ',   to: 'authenticated-user' },
        { grant: 'UPDATE', to: ['Finance', 'Admin'] }
    ])
    entity Departments as projection on procureflow.Departments;

    @readonly
    entity Roles as projection on procureflow.Roles;

    @(restrict: [
        { grant: 'READ', to: 'authenticated-user' },
        { grant: ['CREATE', 'UPDATE'], to: ['Procurement', 'Admin'] }
    ])
    entity Vendors as projection on procureflow.Vendors;

    @(restrict: [
        { grant: 'READ',   to: 'authenticated-user' },
        { grant: 'UPDATE', to: 'Admin' }
    ])
    entity Settings as projection on procureflow.Settings;

    // ------------------------------------------------------------------
    // Purchase Requests & approval workflow
    // ------------------------------------------------------------------

    // Employees only ever see (and act on) their own requests; approvers/buyers/admins see all
    @(restrict: [
        { grant: '*', to: ['Manager', 'Finance', 'Procurement', 'Admin'] },
        { grant: '*', to: 'Employee', where: 'requestor_ID = $user' }
    ])
    entity PurchaseRequests as projection on procureflow.PurchaseRequests actions {
        action submit();
        @requires: ['Manager', 'Finance', 'Procurement', 'Admin']
        action approve(comment: String);
        @requires: ['Manager', 'Finance', 'Procurement', 'Admin']
        action rejectRequest(reason: String @mandatory);
        @requires: ['Manager', 'Finance', 'Procurement', 'Admin']
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
    @(restrict: [
        { grant: 'READ', to: ['Manager', 'Finance', 'Procurement', 'Admin'] },
        { grant: 'READ', to: 'Employee', where: 'user_ID = $user' }
    ])
    entity AuditLogs as projection on procureflow.AuditLogs;

    // ------------------------------------------------------------------
    // Purchase Orders & Goods Receipt
    // ------------------------------------------------------------------

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
        @requires: ['Finance', 'Admin']
        action postInvoice(
            vendorInvoiceNo : String @mandatory,
            invoiceDate     : Date,
            taxAmount       : Decimal(15,2),
            items           : many {
                orderItem : String @mandatory;
                qty       : Integer @mandatory;
                price     : Decimal(15,2) @mandatory;
            }
        ) returns String;
    };

    @readonly
    entity PurchaseOrderItems as projection on procureflow.PurchaseOrderItems;
    @readonly
    entity GoodsReceipts as projection on procureflow.GoodsReceipts;
    @readonly
    entity GoodsReceiptItems as projection on procureflow.GoodsReceiptItems;

    // ------------------------------------------------------------------
    // Accounts Payable: invoice verification (3-way match) & payments
    // ------------------------------------------------------------------

    @(restrict: [
        { grant: 'READ', to: ['Finance', 'Procurement', 'Admin'] },
        { grant: ['releaseBlock', 'rejectInvoice', 'pay'], to: ['Finance', 'Admin'] }
    ])
    entity Invoices as projection on procureflow.Invoices actions {
        action releaseBlock(comment: String @mandatory);
        action rejectInvoice(reason: String @mandatory);
        action pay(method: String @mandatory, reference: String);
    };

    @(restrict: [{ grant: 'READ', to: ['Finance', 'Procurement', 'Admin'] }])
    entity InvoiceItems as projection on procureflow.InvoiceItems;

    @(restrict: [{ grant: 'READ', to: ['Finance', 'Procurement', 'Admin'] }])
    entity Payments as projection on procureflow.Payments;

    // ------------------------------------------------------------------
    // Notifications (each user only ever sees their own)
    // ------------------------------------------------------------------

    @(restrict: [
        { grant: ['READ', 'UPDATE'], to: 'authenticated-user', where: 'recipient_ID = $user' }
    ])
    entity Notifications as projection on procureflow.Notifications;

    action markAllNotificationsRead();

    // ------------------------------------------------------------------
    // Analytics (Dashboard KPIs and Reports)
    // ------------------------------------------------------------------

    type LabelValue {
        label  : String;
        count  : Integer;
        amount : Decimal(15,2);
    }

    type DepartmentBudget {
        department  : String;
        budget      : Decimal(15,2);
        used        : Decimal(15,2);
        remaining   : Decimal(15,2);
        utilization : Integer;
    }

    type Analytics {
        totalRequests          : Integer;
        pendingApprovals       : Integer;
        activePOs              : Integer;
        committedSpend         : Decimal(15,2);
        paidSpend              : Decimal(15,2);
        openPayables           : Decimal(15,2);
        blockedInvoices        : Integer;
        budgetUtilization      : Integer;
        avgApprovalHours       : Decimal(10,1);
        avgPRtoPOHours         : Decimal(10,1);
        byStatus               : many LabelValue;
        byCategory             : many LabelValue;
        byVendor               : many LabelValue;
        byDepartment           : many DepartmentBudget;
    }

    @requires: ['Manager', 'Finance', 'Procurement', 'Admin']
    function analytics() returns Analytics;

    // the logged-in user as the backend sees them (identity in production comes from XSUAA)
    type UserInfo {
        id         : String;
        name       : String;
        role       : String;
        roles      : many String;
        department : String;
    }

    function me() returns UserInfo;
}
