const cds = require('@sap/cds');

const KNOWN_ROLES = ['Employee', 'Manager', 'Finance', 'Procurement', 'Admin'];
const EDITABLE_STATUSES = ['Draft', 'Changes Requested'];
const CANCELLABLE_STATUSES = ['Draft', 'Pending Manager Approval', 'Pending Finance Approval', 'Changes Requested'];

// status -> who approves it next, and where it goes on approval
const STAGE_MAP = {
    'Pending Manager Approval': { approverRole: 'Manager', nextStatus: 'Pending Finance Approval' },
    'Pending Finance Approval': { approverRole: 'Finance', nextStatus: 'Pending Procurement' }
};

function keyOf(req) {
    const p = req.params[req.params.length - 1];
    return (p && typeof p === 'object') ? p.ID : p;
}

function currentRole(req) {
    return KNOWN_ROLES.find(r => req.user.is(r)) || 'Employee';
}

module.exports = cds.service.impl(async function () {
    const {
        Users, Departments, Vendors,
        PurchaseRequests, PurchaseRequestItems, ApprovalHistory, Comments, AuditLogs,
        PurchaseOrders, PurchaseOrderItems, GoodsReceipts, GoodsReceiptItems
    } = this.entities;

    async function audit(user, action, businessObject, documentID, previousValue, newValue) {
        await INSERT.into(AuditLogs).entries({
            user_ID: user, action, businessObject, documentID,
            previousValue: previousValue ?? null, newValue: newValue ?? null
        });
    }

    async function history(requestID, action, actor, role, comment, fromStatus, toStatus) {
        await INSERT.into(ApprovalHistory).entries({
            request_ID: requestID, action, actor_ID: actor, role,
            comment: comment ?? null, fromStatus, toStatus
        });
    }

    // ---------------------------------------------------------------------
    // Purchase Requests: defaults, editability, item validation
    // ---------------------------------------------------------------------

    this.before('CREATE', PurchaseRequests, async (req) => {
        req.data.requestor_ID = req.user.id;
        if (!req.data.status) req.data.status = 'Draft';
        if (!req.data.date) req.data.date = new Date().toISOString().slice(0, 10);
        if (!req.data.department_ID) {
            const me = await SELECT.one.from(Users, req.user.id);
            if (me) req.data.department_ID = me.department_ID;
        }
        if (Array.isArray(req.data.items)) {
            let amount = 0;
            for (const it of req.data.items) {
                const total = Number(it.qty || 0) * Number(it.price || 0);
                it.total = total;
                amount += total;
            }
            req.data.amount = amount;
        }
    });

    this.before('UPDATE', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        if (!id) return;
        const pr = await SELECT.one.from(PurchaseRequests, id).columns('status');
        if (pr && !EDITABLE_STATUSES.includes(pr.status)) {
            return req.reject(400, `Request ${id} cannot be edited in status '${pr.status}'.`);
        }
    });

    this.before('DELETE', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const pr = await SELECT.one.from(PurchaseRequests, id).columns('status');
        if (pr && pr.status !== 'Draft') {
            return req.reject(400, `Only draft requests can be deleted (current status '${pr.status}').`);
        }
    });

    async function recalcAmount(parentID) {
        if (!parentID) return;
        const items = await SELECT.from(PurchaseRequestItems).where({ parent_ID: parentID });
        const amount = items.reduce((s, it) => s + Number(it.total || 0), 0);
        await UPDATE(PurchaseRequests, parentID).with({ amount });
    }

    this.before(['CREATE', 'UPDATE', 'DELETE'], PurchaseRequestItems, async (req) => {
        const itemID = keyOf(req);
        let parentID = req.data && req.data.parent_ID;
        if (!parentID && itemID) {
            const existing = await SELECT.one.from(PurchaseRequestItems, itemID);
            if (existing) parentID = existing.parent_ID;
        }

        if (parentID) {
            const pr = await SELECT.one.from(PurchaseRequests, parentID).columns('status', 'requestor_ID');
            if (pr && !EDITABLE_STATUSES.includes(pr.status)) {
                return req.reject(400, `Items cannot be modified while the request is in status '${pr.status}'.`);
            }
            if (pr && pr.requestor_ID !== req.user.id && !req.user.is('Admin')) {
                return req.reject(403, `Only the requestor can modify this request's items.`);
            }
        }

        if (req.data.qty != null && Number(req.data.qty) <= 0) {
            return req.reject(400, 'Quantity must be greater than zero.');
        }
        if (req.data.price != null && Number(req.data.price) < 0) {
            return req.reject(400, 'Price cannot be negative.');
        }
        if (req.event !== 'DELETE' && (req.data.qty != null || req.data.price != null)) {
            let qty = req.data.qty, price = req.data.price;
            if (qty == null || price == null) {
                const existing = itemID ? await SELECT.one.from(PurchaseRequestItems, itemID) : null;
                qty = qty ?? (existing ? existing.qty : 0);
                price = price ?? (existing ? existing.price : 0);
            }
            req.data.total = Number(qty) * Number(price);
        }

        req._parentID = parentID;
    });

    this.after(['CREATE', 'UPDATE', 'DELETE'], PurchaseRequestItems, async (data, req) => {
        await recalcAmount(req._parentID);
    });

    // ---------------------------------------------------------------------
    // Purchase Request workflow actions
    // ---------------------------------------------------------------------

    this.on('submit', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const pr = await SELECT.one.from(PurchaseRequests, id);
        if (!pr) return req.reject(404, 'Purchase Request not found.');
        if (!EDITABLE_STATUSES.includes(pr.status)) {
            return req.reject(400, `Request cannot be submitted from status '${pr.status}'.`);
        }
        if (!pr.justification) return req.reject(400, 'Business justification is required.');

        const items = await SELECT.from(PurchaseRequestItems).where({ parent_ID: id });
        if (!items.length) return req.reject(400, 'At least one line item is required.');
        for (const it of items) {
            if (!(Number(it.qty) > 0)) return req.reject(400, `Item '${it.description}' must have a quantity greater than zero.`);
            if (Number(it.price) < 0) return req.reject(400, `Item '${it.description}' cannot have a negative price.`);
        }

        const amount = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
        const fromStatus = pr.status;
        const toStatus = 'Pending Manager Approval';

        await UPDATE(PurchaseRequests, id).with({ status: toStatus, amount, submittedAt: new Date().toISOString() });
        await history(id, 'Submitted', req.user.id, currentRole(req), null, fromStatus, toStatus);
        await audit(req.user.id, 'Submit', 'PurchaseRequest', id, fromStatus, toStatus);
    });

    this.on('approve', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const { comment } = req.data;
        const pr = await SELECT.one.from(PurchaseRequests, id);
        if (!pr) return req.reject(404, 'Purchase Request not found.');

        const stage = STAGE_MAP[pr.status];
        if (!stage) return req.reject(400, `Request cannot be approved from status '${pr.status}'.`);
        if (pr.requestor_ID === req.user.id) return req.reject(403, 'You cannot approve your own request.');
        if (!req.user.is(stage.approverRole) && !req.user.is('Admin')) {
            return req.reject(403, `Only a ${stage.approverRole} can approve this request at this stage.`);
        }

        if (stage.approverRole === 'Finance' && pr.department_ID) {
            const dept = await SELECT.one.from(Departments, pr.department_ID);
            if (dept) {
                const projectedUsage = Number(dept.budgetUsed) + Number(pr.amount);
                if (projectedUsage > Number(dept.budgetAvailable)) {
                    return req.reject(400,
                        `Insufficient budget in department '${dept.name}': available ${dept.budgetAvailable}, ` +
                        `already used ${dept.budgetUsed}, this request needs ${pr.amount}.`);
                }
                await UPDATE(Departments, dept.ID).with({ budgetUsed: projectedUsage });
            }
        }

        const fromStatus = pr.status;
        const toStatus = stage.nextStatus;
        await UPDATE(PurchaseRequests, id).with({ status: toStatus });
        await history(id, 'Approved', req.user.id, currentRole(req), comment, fromStatus, toStatus);
        await audit(req.user.id, 'Approve', 'PurchaseRequest', id, fromStatus, toStatus);
    });

    this.on('rejectRequest', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const { reason } = req.data;
        const pr = await SELECT.one.from(PurchaseRequests, id);
        if (!pr) return req.reject(404, 'Purchase Request not found.');

        const stage = STAGE_MAP[pr.status];
        if (!stage) return req.reject(400, `Request cannot be rejected from status '${pr.status}'.`);
        if (pr.requestor_ID === req.user.id) return req.reject(403, 'You cannot reject your own request.');
        if (!req.user.is(stage.approverRole) && !req.user.is('Admin')) {
            return req.reject(403, `Only a ${stage.approverRole} can reject this request at this stage.`);
        }

        const fromStatus = pr.status;
        await UPDATE(PurchaseRequests, id).with({ status: 'Rejected' });
        await history(id, 'Rejected', req.user.id, currentRole(req), reason, fromStatus, 'Rejected');
        await audit(req.user.id, 'Reject', 'PurchaseRequest', id, fromStatus, 'Rejected');
    });

    this.on('requestChanges', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const { comment } = req.data;
        const pr = await SELECT.one.from(PurchaseRequests, id);
        if (!pr) return req.reject(404, 'Purchase Request not found.');

        const stage = STAGE_MAP[pr.status];
        if (!stage) return req.reject(400, `Cannot request changes from status '${pr.status}'.`);
        if (!req.user.is(stage.approverRole) && !req.user.is('Admin')) {
            return req.reject(403, `Only a ${stage.approverRole} can request changes at this stage.`);
        }

        const fromStatus = pr.status;
        await UPDATE(PurchaseRequests, id).with({ status: 'Changes Requested' });
        await history(id, 'ChangesRequested', req.user.id, currentRole(req), comment, fromStatus, 'Changes Requested');
        await audit(req.user.id, 'RequestChanges', 'PurchaseRequest', id, fromStatus, 'Changes Requested');
    });

    this.on('cancel', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const { reason } = req.data;
        const pr = await SELECT.one.from(PurchaseRequests, id);
        if (!pr) return req.reject(404, 'Purchase Request not found.');
        if (pr.requestor_ID !== req.user.id && !req.user.is('Admin')) {
            return req.reject(403, 'Only the requestor can cancel this request.');
        }
        if (!CANCELLABLE_STATUSES.includes(pr.status)) {
            return req.reject(400, `Request cannot be cancelled from status '${pr.status}'.`);
        }

        const fromStatus = pr.status;
        await UPDATE(PurchaseRequests, id).with({ status: 'Cancelled', cancelReason: reason ?? null });
        await history(id, 'Cancelled', req.user.id, currentRole(req), reason, fromStatus, 'Cancelled');
        await audit(req.user.id, 'Cancel', 'PurchaseRequest', id, fromStatus, 'Cancelled');
    });

    this.on('selectVendor', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const { vendor, reason } = req.data;
        const pr = await SELECT.one.from(PurchaseRequests, id);
        if (!pr) return req.reject(404, 'Purchase Request not found.');
        if (pr.status !== 'Pending Procurement') {
            return req.reject(400,
                `Vendor can only be selected once the request has reached Procurement (current status '${pr.status}').`);
        }

        const v = await SELECT.one.from(Vendors, vendor);
        if (!v) return req.reject(404, 'Vendor not found.');
        if (v.status !== 'Active') return req.reject(400, `Vendor '${v.name}' is ${v.status} and cannot be selected.`);

        const fromStatus = pr.status;
        await UPDATE(PurchaseRequests, id).with({ status: 'Vendor Selected', vendor_ID: vendor });
        await history(id, 'VendorSelected', req.user.id, currentRole(req), reason, fromStatus, 'Vendor Selected');
        await audit(req.user.id, 'SelectVendor', 'PurchaseRequest', id, fromStatus, 'Vendor Selected');
    });

    this.on('generatePO', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const pr = await SELECT.one.from(PurchaseRequests, id);
        if (!pr) return req.reject(404, 'Purchase Request not found.');
        if (pr.status !== 'Vendor Selected') {
            return req.reject(400,
                `A Purchase Order can only be generated once a vendor has been selected (current status '${pr.status}').`);
        }
        if (!pr.vendor_ID) return req.reject(400, 'No vendor selected for this request.');

        const items = await SELECT.from(PurchaseRequestItems).where({ parent_ID: id });
        if (!items.length) return req.reject(400, 'Purchase Request has no line items.');

        const year = new Date().getFullYear();
        const existing = await SELECT.from(PurchaseOrders).columns('ID');
        const poID = `PO-${year}-${String(existing.length + 1).padStart(3, '0')}`;
        const amount = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);

        await INSERT.into(PurchaseOrders).entries({
            ID: poID,
            request_ID: id,
            vendor_ID: pr.vendor_ID,
            date: new Date().toISOString().slice(0, 10),
            currency: pr.currency,
            amount,
            taxAmount: 0,
            status: 'Issued',
            buyer_ID: req.user.id
        });

        await INSERT.into(PurchaseOrderItems).entries(items.map((it, idx) => ({
            ID: `${poID}-I${idx + 1}`,
            parent_ID: poID,
            description: it.description,
            qty: it.qty,
            price: it.price,
            taxAmount: 0,
            total: Number(it.qty) * Number(it.price),
            expectedDeliveryDate: it.requiredDate || null,
            qtyReceived: 0
        })));

        const fromStatus = pr.status;
        await UPDATE(PurchaseRequests, id).with({ status: 'PO Created' });
        await history(id, 'POGenerated', req.user.id, currentRole(req), poID, fromStatus, 'PO Created');
        await audit(req.user.id, 'GeneratePO', 'PurchaseRequest', id, fromStatus, 'PO Created');
        await audit(req.user.id, 'Create', 'PurchaseOrder', poID, null, 'Issued');
    });

    this.on('addComment', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const { text } = req.data;
        const pr = await SELECT.one.from(PurchaseRequests, id).columns('ID');
        if (!pr) return req.reject(404, 'Purchase Request not found.');
        await INSERT.into(Comments).entries({ request_ID: id, author_ID: req.user.id, text });
    });

    // ---------------------------------------------------------------------
    // Purchase Order / Goods Receipt actions
    // ---------------------------------------------------------------------

    this.on('recordGoodsReceipt', PurchaseOrders, async (req) => {
        const poID = keyOf(req);
        const { location, notes, items } = req.data;
        const po = await SELECT.one.from(PurchaseOrders, poID);
        if (!po) return req.reject(404, 'Purchase Order not found.');
        if (!['Issued', 'Partially Received'].includes(po.status)) {
            return req.reject(400, `Goods cannot be received against a Purchase Order in status '${po.status}'.`);
        }
        if (!items || !items.length) return req.reject(400, 'At least one line item is required.');

        const poItems = await SELECT.from(PurchaseOrderItems).where({ parent_ID: poID });
        const poItemMap = new Map(poItems.map(it => [it.ID, it]));

        for (const line of items) {
            const poItem = poItemMap.get(line.orderItem);
            if (!poItem) return req.reject(400, `Purchase Order item '${line.orderItem}' not found.`);
            const qtyReceived = Number(line.qtyReceived) || 0;
            const qtyRejected = Number(line.qtyRejected) || 0;
            if (qtyReceived < 0 || qtyRejected < 0) return req.reject(400, 'Received/rejected quantities cannot be negative.');
            const alreadyReceived = Number(poItem.qtyReceived) || 0;
            if (alreadyReceived + qtyReceived + qtyRejected > Number(poItem.qty)) {
                return req.reject(400,
                    `Received quantity for '${poItem.description}' cannot exceed the ordered quantity (${poItem.qty}).`);
            }
        }

        const year = new Date().getFullYear();
        const existingGR = await SELECT.from(GoodsReceipts).columns('ID');
        const grID = `GR-${year}-${String(existingGR.length + 1).padStart(3, '0')}`;

        await INSERT.into(GoodsReceipts).entries({
            ID: grID,
            purchaseOrder_ID: poID,
            date: new Date().toISOString().slice(0, 10),
            receivedBy_ID: req.user.id,
            location: location ?? null,
            status: 'Posted',
            notes: notes ?? null
        });

        await INSERT.into(GoodsReceiptItems).entries(items.map((line, idx) => {
            const poItem = poItemMap.get(line.orderItem);
            return {
                ID: `${grID}-I${idx + 1}`,
                parent_ID: grID,
                orderItem_ID: line.orderItem,
                description: poItem.description,
                qtyOrdered: poItem.qty,
                qtyReceived: Number(line.qtyReceived) || 0,
                qtyRejected: Number(line.qtyRejected) || 0,
                inspectionResult: line.inspectionResult || 'Good',
                damageInfo: line.damageInfo ?? null,
                remarks: line.remarks ?? null
            };
        }));

        for (const line of items) {
            const poItem = poItemMap.get(line.orderItem);
            const newQtyReceived = (Number(poItem.qtyReceived) || 0) + (Number(line.qtyReceived) || 0);
            await UPDATE(PurchaseOrderItems, line.orderItem).with({ qtyReceived: newQtyReceived });
        }

        const updatedItems = await SELECT.from(PurchaseOrderItems).where({ parent_ID: poID });
        const fullyReceived = updatedItems.every(it => Number(it.qtyReceived) >= Number(it.qty));
        const newPOStatus = fullyReceived ? 'Closed' : 'Partially Received';
        await UPDATE(PurchaseOrders, poID).with({ status: newPOStatus });
        await audit(req.user.id, 'GoodsReceipt', 'PurchaseOrder', poID, po.status, newPOStatus);

        if (fullyReceived && po.request_ID) {
            const pr = await SELECT.one.from(PurchaseRequests, po.request_ID);
            if (pr && pr.status !== 'Goods Received') {
                await UPDATE(PurchaseRequests, po.request_ID).with({ status: 'Goods Received' });
                await history(po.request_ID, 'GoodsReceived', req.user.id, currentRole(req), null, pr.status, 'Goods Received');
                await audit(req.user.id, 'GoodsReceipt', 'PurchaseRequest', po.request_ID, pr.status, 'Goods Received');
            }
        }
    });

    this.on('cancel', PurchaseOrders, async (req) => {
        const poID = keyOf(req);
        const { reason } = req.data;
        const po = await SELECT.one.from(PurchaseOrders, poID);
        if (!po) return req.reject(404, 'Purchase Order not found.');
        if (!['Issued', 'Partially Received'].includes(po.status)) {
            return req.reject(400, `Purchase Order cannot be cancelled from status '${po.status}'.`);
        }

        const fromStatus = po.status;
        await UPDATE(PurchaseOrders, poID).with({ status: 'Cancelled' });
        await audit(req.user.id, 'Cancel', 'PurchaseOrder', poID, fromStatus, reason ? `Cancelled: ${reason}` : 'Cancelled');
    });
});
