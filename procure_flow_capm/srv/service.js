const cds = require('@sap/cds');

const KNOWN_ROLES = ['Employee', 'Manager', 'Finance', 'Procurement', 'Admin'];
const EDITABLE_STATUSES = ['Draft', 'Changes Requested'];
const CANCELLABLE_STATUSES = ['Draft', 'Changes Requested',
    'Pending Manager Approval', 'Pending Finance Approval', 'Pending Head Approval'];
const PAYMENT_METHODS = ['Wire', 'ACH', 'Check'];

// Approval stages. Which stages a request passes through is decided by the approval matrix
// (Settings) from the request amount at submit time and frozen in PurchaseRequests.approvalRoute.
const STAGES = {
    Manager: { status: 'Pending Manager Approval', role: 'Manager', label: 'Manager' },
    Finance: { status: 'Pending Finance Approval', role: 'Finance', label: 'Finance Controller' },
    Head:    { status: 'Pending Head Approval',    role: 'Procurement', label: 'Procurement Head' }
};
const STAGE_BY_STATUS = Object.fromEntries(Object.entries(STAGES).map(([k, v]) => [v.status, k]));
const PENDING_STATUSES = Object.keys(STAGE_BY_STATUS);

// fields on a PR header that only the workflow may change - never the client
const PROTECTED_PR_FIELDS = ['status', 'amount', 'requestor_ID', 'approvalRoute', 'budgetCommitted',
    'vendor_ID', 'submittedAt', 'cancelReason', 'createdBy', 'modifiedBy'];

const DEFAULT_SETTINGS = {
    managerOnlyLimit: 1000, headApprovalLimit: 10000,
    invoiceTolerancePct: 5, invoiceToleranceAbs: 100,
    grOverDeliveryPct: 0, approvalSlaDays: 3, defaultCurrency: 'USD'
};

const round2 = n => Math.round(Number(n || 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

function keyOf(req) {
    const p = req.params[req.params.length - 1];
    return (p && typeof p === 'object') ? p.ID : p;
}

function currentRole(req) {
    return KNOWN_ROLES.slice().reverse().find(r => r !== 'Employee' && req.user.is(r)) || 'Employee';
}

/** Approval route for an amount, per the approval matrix (blueprint section 7). */
function routeFor(amount, settings) {
    const route = ['Manager'];
    if (amount > Number(settings.managerOnlyLimit)) route.push('Finance');
    if (amount > Number(settings.headApprovalLimit)) route.push('Head');
    return route;
}

/** "Net 30" -> 30 */
function paymentTermDays(terms) {
    const m = /(\d+)/.exec(terms || '');
    return m ? Number(m[1]) : 30;
}

module.exports = cds.service.impl(async function () {
    const {
        Users, Departments, Vendors, Settings,
        PurchaseRequests, PurchaseRequestItems, ApprovalHistory, Comments, AuditLogs,
        PurchaseOrders, PurchaseOrderItems, GoodsReceipts, GoodsReceiptItems,
        Invoices, InvoiceItems, Payments, Notifications
    } = this.entities;

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

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

    async function notify(recipients, title, message, documentID, priority = 'Medium') {
        const ids = [...new Set((recipients || []).filter(Boolean))];
        if (!ids.length) return;
        await INSERT.into(Notifications).entries(ids.map(recipient_ID => ({
            recipient_ID, title, message, documentID, priority
        })));
    }

    async function usersWithRole(role) {
        const rows = await SELECT.from(Users).columns('ID').where({ role, active: true });
        return rows.map(r => r.ID);
    }

    /** Who should be told that a request is waiting in the given stage. */
    async function approversFor(stageKey, pr) {
        if (stageKey === 'Manager') {
            const requestor = await SELECT.one.from(Users, pr.requestor_ID).columns('manager_ID');
            if (requestor && requestor.manager_ID) return [requestor.manager_ID];
        }
        const ids = await usersWithRole(STAGES[stageKey].role);
        return ids.filter(id => id !== pr.requestor_ID);
    }

    async function getSettings() {
        const s = await SELECT.one.from(Settings, 'default');
        return Object.assign({}, DEFAULT_SETTINGS, s || {});
    }

    function routeOf(pr, settings) {
        return pr.approvalRoute ? pr.approvalRoute.split('>') : routeFor(Number(pr.amount), settings);
    }

    /** Next sequential document number, e.g. PO-2026-004 (max existing + 1, never count-based). */
    async function nextId(entity, prefix) {
        const stem = `${prefix}-${new Date().getFullYear()}-`;
        const rows = await SELECT.from(entity).columns('ID').where({ ID: { like: stem + '%' } });
        const max = rows.reduce((m, r) => {
            const n = parseInt(String(r.ID).slice(stem.length), 10);
            return Number.isFinite(n) && n > m ? n : m;
        }, 0);
        return stem + String(max + 1).padStart(3, '0');
    }

    async function remainingBudget(departmentID) {
        const dept = await SELECT.one.from(Departments, departmentID);
        if (!dept) return null;
        return { dept, remaining: Number(dept.budgetAvailable) - Number(dept.budgetUsed) };
    }

    // ---------------------------------------------------------------------
    // Cross-cutting: deactivated users are locked out
    // ---------------------------------------------------------------------

    this.before('*', async (req) => {
        if (!req.user || !req.user.id || req.user.is('system-user') || req.user._is_anonymous) return;
        const me = await SELECT.one.from(Users, req.user.id).columns('active');
        if (me && me.active === false) return req.reject(403, 'Your user account is deactivated.');
    });

    // ---------------------------------------------------------------------
    // Master data & configuration
    // ---------------------------------------------------------------------

    this.before('UPDATE', Users, (req) => {
        const id = keyOf(req);
        if (id === req.user.id && req.data.active === false) {
            return req.reject(400, 'You cannot deactivate your own account.');
        }
        if (req.data.role != null && !KNOWN_ROLES.includes(req.data.role)) {
            return req.reject(400, `Unknown role '${req.data.role}'. Allowed: ${KNOWN_ROLES.join(', ')}.`);
        }
    });
    this.after('UPDATE', Users, async (data, req) => {
        await audit(req.user.id, 'Update', 'User', keyOf(req), null, JSON.stringify(req.data));
    });

    this.before('UPDATE', Departments, async (req) => {
        const id = keyOf(req);
        const dept = await SELECT.one.from(Departments, id);
        if (!dept) return;
        if (req.data.budgetUsed != null) delete req.data.budgetUsed; // only the workflow consumes budget
        if (req.data.budgetAvailable != null && Number(req.data.budgetAvailable) < Number(dept.budgetUsed)) {
            return req.reject(400, `Budget cannot be lower than what is already committed (${dept.budgetUsed}).`);
        }
        req._previousBudget = dept.budgetAvailable;
    });
    this.after('UPDATE', Departments, async (data, req) => {
        if (req.data.budgetAvailable != null) {
            await audit(req.user.id, 'UpdateBudget', 'Department', keyOf(req), String(req._previousBudget), String(req.data.budgetAvailable));
        }
    });

    this.before('UPDATE', Settings, async (req) => {
        const merged = Object.assign(await getSettings(), req.data);
        for (const f of ['managerOnlyLimit', 'headApprovalLimit', 'invoiceTolerancePct', 'invoiceToleranceAbs', 'grOverDeliveryPct', 'approvalSlaDays']) {
            if (merged[f] != null && Number(merged[f]) < 0) return req.reject(400, `${f} cannot be negative.`);
        }
        if (Number(merged.managerOnlyLimit) >= Number(merged.headApprovalLimit)) {
            return req.reject(400, 'The manager-only limit must be lower than the procurement head limit.');
        }
    });
    this.after('UPDATE', Settings, async (data, req) => {
        await audit(req.user.id, 'UpdateSettings', 'Settings', 'default', null, JSON.stringify(req.data));
    });

    this.before(['CREATE', 'UPDATE'], Vendors, (req) => {
        if (req.data.status && !['Pending', 'Active', 'Inactive', 'Blocked'].includes(req.data.status)) {
            return req.reject(400, `Invalid vendor status '${req.data.status}'.`);
        }
        if (req.data.rating != null && (Number(req.data.rating) < 0 || Number(req.data.rating) > 5)) {
            return req.reject(400, 'Vendor rating must be between 0 and 5.');
        }
        if (req.event === 'CREATE') req.data.spend = 0;
        else delete req.data.spend; // spend is driven by payments
    });

    // ---------------------------------------------------------------------
    // Notifications
    // ---------------------------------------------------------------------

    this.before('UPDATE', Notifications, (req) => {
        // only the read flag may be changed by the recipient
        Object.keys(req.data).forEach(k => { if (k !== 'isRead' && k !== 'ID') delete req.data[k]; });
    });

    this.on('markAllNotificationsRead', async (req) => {
        await UPDATE(Notifications).with({ isRead: true }).where({ recipient_ID: req.user.id, isRead: false });
    });

    // ---------------------------------------------------------------------
    // Purchase Requests: defaults, editability, item validation
    // ---------------------------------------------------------------------

    this.before('CREATE', PurchaseRequests, async (req) => {
        PROTECTED_PR_FIELDS.forEach(f => delete req.data[f]);
        if (!req.data.ID) req.data.ID = await nextId(PurchaseRequests, 'PR');
        req.data.requestor_ID = req.user.id;
        req.data.status = 'Draft';
        if (!req.data.date) req.data.date = today();
        if (!req.data.department_ID) {
            const me = await SELECT.one.from(Users, req.user.id);
            if (me) req.data.department_ID = me.department_ID;
        }
        let amount = 0;
        for (const it of req.data.items || []) {
            if (it.qty != null && Number(it.qty) <= 0) return req.reject(400, 'Quantity must be greater than zero.');
            if (it.price != null && Number(it.price) < 0) return req.reject(400, 'Price cannot be negative.');
            it.total = round2(Number(it.qty || 0) * Number(it.price || 0));
            amount += it.total;
        }
        req.data.amount = round2(amount);
    });

    this.after('CREATE', PurchaseRequests, async (data, req) => {
        await audit(req.user.id, 'Create', 'PurchaseRequest', data.ID, null, 'Draft');
    });

    this.before('UPDATE', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        if (!id) return;
        PROTECTED_PR_FIELDS.forEach(f => delete req.data[f]);
        delete req.data.items; // items are maintained via PurchaseRequestItems
        const pr = await SELECT.one.from(PurchaseRequests, id).columns('status', 'requestor_ID');
        if (!pr) return;
        if (pr.requestor_ID !== req.user.id && !req.user.is('Admin')) {
            return req.reject(403, 'Only the requestor can edit this request.');
        }
        if (!EDITABLE_STATUSES.includes(pr.status)) {
            return req.reject(400, `Request ${id} cannot be edited in status '${pr.status}'.`);
        }
    });

    this.before('DELETE', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const pr = await SELECT.one.from(PurchaseRequests, id).columns('status', 'requestor_ID');
        if (!pr) return;
        if (pr.requestor_ID !== req.user.id && !req.user.is('Admin')) {
            return req.reject(403, 'Only the requestor can delete this request.');
        }
        if (pr.status !== 'Draft') {
            return req.reject(400, `Only draft requests can be deleted (current status '${pr.status}').`);
        }
    });

    async function recalcAmount(parentID) {
        if (!parentID) return;
        const items = await SELECT.from(PurchaseRequestItems).where({ parent_ID: parentID });
        const amount = round2(items.reduce((s, it) => s + Number(it.total || 0), 0));
        await UPDATE(PurchaseRequests, parentID).with({ amount });
    }

    this.before(['CREATE', 'UPDATE', 'DELETE'], PurchaseRequestItems, async (req) => {
        const itemID = keyOf(req);
        let parentID = req.data && req.data.parent_ID;
        if (!parentID && itemID) {
            const existing = await SELECT.one.from(PurchaseRequestItems, itemID);
            if (existing) parentID = existing.parent_ID;
        }
        if (!parentID && req.params.length > 1) parentID = keyOf({ params: [req.params[0]] });

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
            req.data.total = round2(Number(qty) * Number(price));
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
        if (pr.requestor_ID !== req.user.id && !req.user.is('Admin')) {
            return req.reject(403, 'Only the requestor can submit this request.');
        }
        if (!EDITABLE_STATUSES.includes(pr.status)) {
            return req.reject(400, `Request cannot be submitted from status '${pr.status}'.`);
        }
        if (!pr.justification) return req.reject(400, 'Business justification is required.');
        if (pr.requiredDate && pr.requiredDate <= today()) {
            return req.reject(400, 'The required delivery date must be in the future.');
        }

        const items = await SELECT.from(PurchaseRequestItems).where({ parent_ID: id });
        if (!items.length) return req.reject(400, 'At least one line item is required.');
        for (const it of items) {
            if (!it.description) return req.reject(400, 'Every line item needs a description.');
            if (!(Number(it.qty) > 0)) return req.reject(400, `Item '${it.description}' must have a quantity greater than zero.`);
            if (Number(it.price) < 0) return req.reject(400, `Item '${it.description}' cannot have a negative price.`);
        }
        const amount = round2(items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0));
        if (!(amount > 0)) return req.reject(400, 'The request total must be greater than zero.');

        // FR-02 budget validation (hard error) - checked again and committed on final approval
        if (pr.department_ID) {
            const b = await remainingBudget(pr.department_ID);
            if (b && amount > b.remaining) {
                return req.reject(400, `E001: Budget Exceeded - department '${b.dept.name}' has ${round2(b.remaining)} remaining, this request needs ${amount}.`);
            }
        }

        const settings = await getSettings();
        const route = routeFor(amount, settings);
        const fromStatus = pr.status;
        const toStatus = STAGES[route[0]].status;

        await UPDATE(PurchaseRequests, id).with({
            status: toStatus, amount, submittedAt: new Date().toISOString(), approvalRoute: route.join('>')
        });
        await history(id, 'Submitted', req.user.id, currentRole(req),
            `Approval route: ${route.map(r => STAGES[r].label).join(' → ')}`, fromStatus, toStatus);
        await audit(req.user.id, 'Submit', 'PurchaseRequest', id, fromStatus, toStatus);
        await notify(await approversFor(route[0], pr), `Action Required: ${id} Pending Approval`,
            `"${pr.title}" (${amount} ${pr.currency}) is waiting for your approval.`, id, 'High');
    });

    this.on('approve', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const { comment } = req.data;
        const pr = await SELECT.one.from(PurchaseRequests, id);
        if (!pr) return req.reject(404, 'Purchase Request not found.');

        const stageKey = STAGE_BY_STATUS[pr.status];
        if (!stageKey) return req.reject(400, `Request cannot be approved from status '${pr.status}'.`);
        const stage = STAGES[stageKey];
        // Segregation of Duties: never approve your own request, even as Admin
        if (pr.requestor_ID === req.user.id) return req.reject(403, 'You cannot approve your own request.');
        if (!req.user.is(stage.role) && !req.user.is('Admin')) {
            return req.reject(403, `Only a ${stage.label} can approve this request at this stage.`);
        }
        if (stageKey === 'Manager' && !req.user.is('Admin')) {
            const requestor = await SELECT.one.from(Users, pr.requestor_ID).columns('manager_ID');
            if (requestor && requestor.manager_ID && requestor.manager_ID !== req.user.id) {
                return req.reject(403, `Only the requestor's line manager (${requestor.manager_ID}) can approve this stage.`);
            }
        }

        const settings = await getSettings();
        const route = routeOf(pr, settings);
        const nextKey = route[route.indexOf(stageKey) + 1];
        const fromStatus = pr.status;
        const toStatus = nextKey ? STAGES[nextKey].status : 'Pending Procurement';

        // final approval: commit the budget atomically (no read-modify-write race between approvers)
        if (!nextKey && pr.department_ID && !pr.budgetCommitted) {
            const amount = Number(pr.amount);
            const affected = await UPDATE(Departments)
                .with({ budgetUsed: { '+=': amount } })
                .where('ID =', pr.department_ID, 'and budgetUsed +', amount, '<= budgetAvailable');
            if (!affected) {
                const b = await remainingBudget(pr.department_ID);
                return req.reject(400, `E001: Budget Exceeded - department '${b ? b.dept.name : pr.department_ID}' ` +
                    `has ${b ? round2(b.remaining) : 0} remaining, this request needs ${amount}.`);
            }
        }

        await UPDATE(PurchaseRequests, id).with({
            status: toStatus, ...(nextKey ? {} : { budgetCommitted: true })
        });
        await history(id, 'Approved', req.user.id, stage.label, comment, fromStatus, toStatus);
        await audit(req.user.id, 'Approve', 'PurchaseRequest', id, fromStatus, toStatus);

        if (nextKey) {
            await notify(await approversFor(nextKey, pr), `Action Required: ${id} Pending Approval`,
                `"${pr.title}" was approved by ${stage.label} and now needs your approval.`, id, 'High');
        } else {
            await notify([pr.requestor_ID], `Approved: ${id}`, `Your request "${pr.title}" is fully approved and with Procurement.`, id);
            await notify(await usersWithRole('Procurement'), `Ready for sourcing: ${id}`,
                `"${pr.title}" is approved - select a vendor and create the PO.`, id);
        }
    });

    this.on('rejectRequest', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const { reason } = req.data;
        const pr = await SELECT.one.from(PurchaseRequests, id);
        if (!pr) return req.reject(404, 'Purchase Request not found.');

        const stageKey = STAGE_BY_STATUS[pr.status];
        if (!stageKey) return req.reject(400, `Request cannot be rejected from status '${pr.status}'.`);
        const stage = STAGES[stageKey];
        if (pr.requestor_ID === req.user.id) return req.reject(403, 'You cannot reject your own request.');
        if (!req.user.is(stage.role) && !req.user.is('Admin')) {
            return req.reject(403, `Only a ${stage.label} can reject this request at this stage.`);
        }

        const fromStatus = pr.status;
        await UPDATE(PurchaseRequests, id).with({ status: 'Rejected' });
        await history(id, 'Rejected', req.user.id, stage.label, reason, fromStatus, 'Rejected');
        await audit(req.user.id, 'Reject', 'PurchaseRequest', id, fromStatus, 'Rejected');
        await notify([pr.requestor_ID], `Rejected: ${id}`, `Your request "${pr.title}" was rejected: ${reason}`, id, 'High');
    });

    this.on('requestChanges', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const { comment } = req.data;
        const pr = await SELECT.one.from(PurchaseRequests, id);
        if (!pr) return req.reject(404, 'Purchase Request not found.');

        const stageKey = STAGE_BY_STATUS[pr.status];
        if (!stageKey) return req.reject(400, `Cannot request changes from status '${pr.status}'.`);
        const stage = STAGES[stageKey];
        if (pr.requestor_ID === req.user.id) return req.reject(403, 'You cannot request changes on your own request.');
        if (!req.user.is(stage.role) && !req.user.is('Admin')) {
            return req.reject(403, `Only a ${stage.label} can request changes at this stage.`);
        }

        const fromStatus = pr.status;
        await UPDATE(PurchaseRequests, id).with({ status: 'Changes Requested' });
        await history(id, 'ChangesRequested', req.user.id, stage.label, comment, fromStatus, 'Changes Requested');
        await audit(req.user.id, 'RequestChanges', 'PurchaseRequest', id, fromStatus, 'Changes Requested');
        await notify([pr.requestor_ID], `Rework needed: ${id}`, `Changes were requested on "${pr.title}": ${comment}`, id, 'High');
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
        await history(id, 'VendorSelected', req.user.id, currentRole(req), reason || v.name, fromStatus, 'Vendor Selected');
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
        const vendor = await SELECT.one.from(Vendors, pr.vendor_ID);
        if (!vendor || vendor.status !== 'Active') {
            return req.reject(400, 'POs can only be issued to Active vendors - re-select the vendor.');
        }

        const items = await SELECT.from(PurchaseRequestItems).where({ parent_ID: id });
        if (!items.length) return req.reject(400, 'Purchase Request has no line items.');

        const poID = await nextId(PurchaseOrders, 'PO');
        const amount = round2(items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0));

        await INSERT.into(PurchaseOrders).entries({
            ID: poID,
            request_ID: id,
            vendor_ID: pr.vendor_ID,
            date: today(),
            currency: pr.currency,
            amount,
            taxAmount: 0,
            status: 'Issued',
            buyer_ID: req.user.id,
            paymentTerms: vendor.paymentTerms || 'Net 30'
        });

        await INSERT.into(PurchaseOrderItems).entries(items.map((it, idx) => ({
            ID: `${poID}-I${idx + 1}`,
            parent_ID: poID,
            description: it.description,
            qty: it.qty,
            price: it.price,
            taxAmount: 0,
            total: round2(Number(it.qty) * Number(it.price)),
            expectedDeliveryDate: it.requiredDate || pr.requiredDate || null,
            qtyReceived: 0,
            qtyInvoiced: 0
        })));

        const fromStatus = pr.status;
        await UPDATE(PurchaseRequests, id).with({ status: 'PO Created' });
        await history(id, 'POGenerated', req.user.id, currentRole(req), poID, fromStatus, 'PO Created');
        await audit(req.user.id, 'GeneratePO', 'PurchaseRequest', id, fromStatus, 'PO Created');
        await audit(req.user.id, 'Create', 'PurchaseOrder', poID, null, 'Issued');
        await notify([pr.requestor_ID], `PO issued: ${poID}`,
            `Purchase Order ${poID} for "${pr.title}" was sent to ${vendor.name}.`, id);
    });

    this.on('addComment', PurchaseRequests, async (req) => {
        const id = keyOf(req);
        const { text } = req.data;
        if (!text || !text.trim()) return req.reject(400, 'Comment text is required.');
        const pr = await SELECT.one.from(PurchaseRequests, id).columns('ID');
        if (!pr) return req.reject(404, 'Purchase Request not found.');
        await INSERT.into(Comments).entries({ request_ID: id, author_ID: req.user.id, text: text.trim() });
    });

    // ---------------------------------------------------------------------
    // Purchase Order / Goods Receipt actions
    // ---------------------------------------------------------------------

    /** PR is Completed once its PO is fully received, fully invoiced and every invoice is paid. */
    async function checkCompletion(poID, req) {
        const po = await SELECT.one.from(PurchaseOrders, poID);
        if (!po || po.status !== 'Closed' || !po.request_ID) return;
        const items = await SELECT.from(PurchaseOrderItems).where({ parent_ID: poID });
        if (!items.every(it => Number(it.qtyInvoiced) >= Number(it.qtyReceived))) return;
        const open = await SELECT.from(Invoices).columns('ID')
            .where({ purchaseOrder_ID: poID, status: { in: ['Payment Pending', 'Blocked'] } });
        if (open.length) return;
        const paid = await SELECT.from(Invoices).columns('ID').where({ purchaseOrder_ID: poID, status: 'Paid' });
        if (!paid.length) return;

        const pr = await SELECT.one.from(PurchaseRequests, po.request_ID);
        if (!pr || pr.status === 'Completed') return;
        await UPDATE(PurchaseRequests, pr.ID).with({ status: 'Completed' });
        await history(pr.ID, 'Completed', req.user.id, currentRole(req), `${poID} fully received and paid`, pr.status, 'Completed');
        await audit(req.user.id, 'Complete', 'PurchaseRequest', pr.ID, pr.status, 'Completed');
        await notify([pr.requestor_ID], `Completed: ${pr.ID}`, `"${pr.title}" has been delivered and paid. The request is closed.`, pr.ID);
    }

    this.on('recordGoodsReceipt', PurchaseOrders, async (req) => {
        const poID = keyOf(req);
        const { location, notes, items } = req.data;
        const po = await SELECT.one.from(PurchaseOrders, poID);
        if (!po) return req.reject(404, 'Purchase Order not found.');
        if (!['Issued', 'Partially Received'].includes(po.status)) {
            return req.reject(400, `Goods cannot be received against a Purchase Order in status '${po.status}'.`);
        }
        if (!items || !items.length) return req.reject(400, 'At least one line item is required.');

        const settings = await getSettings();
        const poItems = await SELECT.from(PurchaseOrderItems).where({ parent_ID: poID });
        const poItemMap = new Map(poItems.map(it => [it.ID, it]));

        for (const line of items) {
            const poItem = poItemMap.get(line.orderItem);
            if (!poItem) return req.reject(400, `Purchase Order item '${line.orderItem}' not found.`);
            const qtyReceived = Number(line.qtyReceived) || 0;
            const qtyRejected = Number(line.qtyRejected) || 0;
            if (qtyReceived < 0 || qtyRejected < 0) return req.reject(400, 'Received/rejected quantities cannot be negative.');
            if (qtyReceived + qtyRejected === 0) return req.reject(400, `Enter a quantity for '${poItem.description}'.`);
            const allowed = Math.floor(Number(poItem.qty) * (1 + Number(settings.grOverDeliveryPct) / 100));
            const alreadyReceived = Number(poItem.qtyReceived) || 0;
            if (alreadyReceived + qtyReceived + qtyRejected > allowed) {
                return req.reject(400,
                    `Received quantity for '${poItem.description}' cannot exceed the ordered quantity (${poItem.qty}` +
                    (allowed > Number(poItem.qty) ? ` + ${settings.grOverDeliveryPct}% tolerance` : '') + ').');
            }
        }

        const grID = await nextId(GoodsReceipts, 'GR');

        await INSERT.into(GoodsReceipts).entries({
            ID: grID,
            purchaseOrder_ID: poID,
            date: today(),
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
            await UPDATE(PurchaseOrderItems, line.orderItem).with({ qtyReceived: { '+=': Number(line.qtyReceived) || 0 } });
        }

        const updatedItems = await SELECT.from(PurchaseOrderItems).where({ parent_ID: poID });
        const fullyReceived = updatedItems.every(it => Number(it.qtyReceived) >= Number(it.qty));
        const newPOStatus = fullyReceived ? 'Closed' : 'Partially Received';
        await UPDATE(PurchaseOrders, poID).with({ status: newPOStatus });
        await audit(req.user.id, 'GoodsReceipt', 'PurchaseOrder', poID, po.status, newPOStatus);

        if (po.request_ID) {
            const pr = await SELECT.one.from(PurchaseRequests, po.request_ID);
            const target = fullyReceived ? 'Goods Received' : 'Partially Received';
            if (pr && pr.status !== target && pr.status !== 'Completed') {
                await UPDATE(PurchaseRequests, po.request_ID).with({ status: target });
                await history(po.request_ID, 'GoodsReceived', req.user.id, currentRole(req), grID, pr.status, target);
                await audit(req.user.id, 'GoodsReceipt', 'PurchaseRequest', po.request_ID, pr.status, target);
            }
            if (pr) {
                await notify([pr.requestor_ID], `Delivered: ${poID}`,
                    `Goods receipt ${grID} was posted for "${pr.title}" (${newPOStatus}).`, pr.ID);
            }
        }
        await notify(await usersWithRole('Finance'), `Ready for invoice: ${poID}`,
            `Goods receipt ${grID} posted - vendor invoices for ${poID} can now be matched.`, poID, 'Low');
        if (fullyReceived) await checkCompletion(poID, req);
    });

    this.on('cancel', PurchaseOrders, async (req) => {
        const poID = keyOf(req);
        const { reason } = req.data;
        const po = await SELECT.one.from(PurchaseOrders, poID);
        if (!po) return req.reject(404, 'Purchase Order not found.');
        if (!['Issued', 'Partially Received'].includes(po.status)) {
            return req.reject(400, `Purchase Order cannot be cancelled from status '${po.status}'.`);
        }
        const invoices = await SELECT.from(Invoices).columns('ID').where({ purchaseOrder_ID: poID, status: { '!=': 'Rejected' } });
        if (invoices.length) return req.reject(400, 'Purchase Order already has invoices and cannot be cancelled.');

        const fromStatus = po.status;
        await UPDATE(PurchaseOrders, poID).with({ status: 'Cancelled' });
        await audit(req.user.id, 'Cancel', 'PurchaseOrder', poID, fromStatus, reason ? `Cancelled: ${reason}` : 'Cancelled');

        // nothing received yet: send the (still approved, budget-committed) request back for re-sourcing
        if (fromStatus === 'Issued' && po.request_ID) {
            const pr = await SELECT.one.from(PurchaseRequests, po.request_ID);
            if (pr && pr.status === 'PO Created') {
                await UPDATE(PurchaseRequests, pr.ID).with({ status: 'Pending Procurement', vendor_ID: null });
                await history(pr.ID, 'POCancelled', req.user.id, currentRole(req), reason || poID, pr.status, 'Pending Procurement');
                await notify([pr.requestor_ID], `PO cancelled: ${poID}`,
                    `The PO for "${pr.title}" was cancelled and the request is being re-sourced.`, pr.ID);
            }
        }
    });

    // ---------------------------------------------------------------------
    // Accounts Payable: invoice posting with 3-way match (PO <-> GR <-> Invoice)
    // ---------------------------------------------------------------------

    this.on('postInvoice', PurchaseOrders, async (req) => {
        const poID = keyOf(req);
        const { vendorInvoiceNo, invoiceDate, taxAmount, items } = req.data;
        const po = await SELECT.one.from(PurchaseOrders, poID);
        if (!po) return req.reject(404, 'Purchase Order not found.');
        if (!['Partially Received', 'Closed'].includes(po.status)) {
            return req.reject(400, `No goods receipt has been posted for ${poID} (status '${po.status}') - invoices need a goods receipt to match against.`);
        }
        if (!vendorInvoiceNo || !vendorInvoiceNo.trim()) return req.reject(400, 'Vendor invoice number is required.');
        if (!items || !items.length) return req.reject(400, 'At least one invoice line is required.');
        if (invoiceDate && invoiceDate > today()) return req.reject(400, 'Invoice date cannot be in the future.');

        // duplicate invoice check (same vendor + same vendor invoice number)
        const dup = await SELECT.one.from(Invoices).columns('ID')
            .where({ vendor_ID: po.vendor_ID, vendorInvoiceNo: vendorInvoiceNo.trim(), status: { '!=': 'Rejected' } });
        if (dup) return req.reject(409, `Duplicate invoice: ${vendorInvoiceNo} from this vendor is already posted as ${dup.ID}.`);

        const settings = await getSettings();
        const poItems = await SELECT.from(PurchaseOrderItems).where({ parent_ID: poID });
        const poItemMap = new Map(poItems.map(it => [it.ID, it]));

        let net = 0, expected = 0, qtyBlock = false, priceVarianceLines = 0;
        const lines = [];
        const seen = new Set();
        for (const line of items) {
            const poItem = poItemMap.get(line.orderItem);
            if (!poItem) return req.reject(400, `Purchase Order item '${line.orderItem}' not found.`);
            if (seen.has(line.orderItem)) return req.reject(400, `Item '${poItem.description}' appears twice on the invoice.`);
            seen.add(line.orderItem);
            const qty = Number(line.qty), price = Number(line.price);
            if (!(qty > 0)) return req.reject(400, `Invoice quantity for '${poItem.description}' must be greater than zero.`);
            if (price < 0) return req.reject(400, `Invoice price for '${poItem.description}' cannot be negative.`);

            const billable = Number(poItem.qtyReceived) - Number(poItem.qtyInvoiced);
            const total = round2(qty * price);
            let matchStatus = 'Matched';
            if (qty > billable) { matchStatus = 'Quantity Variance'; qtyBlock = true; }
            else if (price > Number(poItem.price)) { matchStatus = 'Price Variance'; priceVarianceLines++; }

            net += total;
            expected += qty * Number(poItem.price);
            lines.push({ poItem, qty, price, total, billable, matchStatus });
        }
        net = round2(net); expected = round2(expected);
        const variance = round2(net - expected);
        const tolerance = (base) => Math.min(base * Number(settings.invoiceTolerancePct) / 100, Number(settings.invoiceToleranceAbs));

        // hard rule: cumulative invoiced value may not exceed the PO value + tolerance
        const prior = await SELECT.from(Invoices).columns('netAmount').where({ purchaseOrder_ID: poID, status: { '!=': 'Rejected' } });
        const priorNet = prior.reduce((s, i) => s + Number(i.netAmount), 0);
        if (priorNet + net > Number(po.amount) + tolerance(Number(po.amount))) {
            return req.reject(400, `Invoice amount exceeds the PO amount (${po.amount}) beyond the allowed tolerance ` +
                `(already invoiced ${round2(priorNet)}, this invoice ${net}).`);
        }

        const reasons = [];
        if (qtyBlock) reasons.push('Quantity variance: invoiced quantity exceeds goods received');
        if (variance > tolerance(expected)) reasons.push(`Price variance ${variance} exceeds tolerance ${round2(tolerance(expected))}`);
        const blocked = reasons.length > 0;

        const vendor = await SELECT.one.from(Vendors, po.vendor_ID);
        const invDate = invoiceDate || today();
        const due = new Date(invDate);
        due.setDate(due.getDate() + paymentTermDays(po.paymentTerms || (vendor && vendor.paymentTerms)));

        const invID = await nextId(Invoices, 'INV');
        const tax = round2(taxAmount || 0);
        await INSERT.into(Invoices).entries({
            ID: invID,
            purchaseOrder_ID: poID,
            vendor_ID: po.vendor_ID,
            vendorInvoiceNo: vendorInvoiceNo.trim(),
            invoiceDate: invDate,
            dueDate: due.toISOString().slice(0, 10),
            currency: po.currency,
            netAmount: net,
            taxAmount: tax,
            amount: round2(net + tax),
            expectedAmount: expected,
            variance,
            status: blocked ? 'Blocked' : 'Payment Pending',
            blockReason: blocked ? reasons.join('; ') : (priceVarianceLines ? 'Price variance within tolerance' : null),
            postedBy_ID: req.user.id
        });
        await INSERT.into(InvoiceItems).entries(lines.map((l, idx) => ({
            ID: `${invID}-I${idx + 1}`,
            parent_ID: invID,
            orderItem_ID: l.poItem.ID,
            description: l.poItem.description,
            qty: l.qty,
            price: l.price,
            total: l.total,
            poPrice: l.poItem.price,
            qtyBillable: l.billable,
            matchStatus: l.matchStatus
        })));
        for (const l of lines) {
            await UPDATE(PurchaseOrderItems, l.poItem.ID).with({ qtyInvoiced: { '+=': l.qty } });
        }

        await audit(req.user.id, 'PostInvoice', 'Invoice', invID, null, blocked ? 'Blocked' : 'Payment Pending');
        if (po.request_ID) {
            const pr = await SELECT.one.from(PurchaseRequests, po.request_ID).columns('status');
            if (pr) await history(po.request_ID, 'InvoicePosted', req.user.id, currentRole(req),
                `${invID} (${vendorInvoiceNo}) - ${blocked ? 'blocked: ' + reasons.join('; ') : '3-way match OK'}`, pr.status, pr.status);
        }
        if (blocked) {
            await notify(await usersWithRole('Finance'), `Invoice blocked: ${invID}`,
                `${vendorInvoiceNo} for ${poID} failed the 3-way match: ${reasons.join('; ')}`, invID, 'High');
        }
        return invID;
    });

    this.on('releaseBlock', Invoices, async (req) => {
        const id = keyOf(req);
        const inv = await SELECT.one.from(Invoices, id);
        if (!inv) return req.reject(404, 'Invoice not found.');
        if (inv.status !== 'Blocked') return req.reject(400, `Only blocked invoices can be released (status '${inv.status}').`);
        // four-eyes principle: whoever posted the invoice may not release its block
        if (inv.postedBy_ID === req.user.id && !req.user.is('Admin')) {
            return req.reject(403, 'You posted this invoice - a different AP approver must release the block.');
        }
        await UPDATE(Invoices, id).with({ status: 'Payment Pending', resolutionNote: req.data.comment });
        await audit(req.user.id, 'ReleaseBlock', 'Invoice', id, 'Blocked', 'Payment Pending');
    });

    this.on('rejectInvoice', Invoices, async (req) => {
        const id = keyOf(req);
        const inv = await SELECT.one.from(Invoices, id);
        if (!inv) return req.reject(404, 'Invoice not found.');
        if (!['Blocked', 'Payment Pending'].includes(inv.status)) {
            return req.reject(400, `Invoice cannot be rejected from status '${inv.status}'.`);
        }
        const lines = await SELECT.from(InvoiceItems).where({ parent_ID: id });
        for (const l of lines) {
            await UPDATE(PurchaseOrderItems, l.orderItem_ID).with({ qtyInvoiced: { '-=': Number(l.qty) } });
        }
        await UPDATE(Invoices, id).with({ status: 'Rejected', resolutionNote: req.data.reason });
        await audit(req.user.id, 'RejectInvoice', 'Invoice', id, inv.status, 'Rejected');
    });

    this.on('pay', Invoices, async (req) => {
        const id = keyOf(req);
        const { method, reference } = req.data;
        const inv = await SELECT.one.from(Invoices, id);
        if (!inv) return req.reject(404, 'Invoice not found.');
        if (inv.status !== 'Payment Pending') {
            return req.reject(400, `Only invoices in 'Payment Pending' can be paid (status '${inv.status}').`);
        }
        if (!PAYMENT_METHODS.includes(method)) {
            return req.reject(400, `Payment method must be one of ${PAYMENT_METHODS.join(', ')}.`);
        }

        const payID = await nextId(Payments, 'PAY');
        await INSERT.into(Payments).entries({
            ID: payID,
            invoice_ID: id,
            vendor_ID: inv.vendor_ID,
            amount: inv.amount,
            currency: inv.currency,
            method,
            reference: reference || payID,
            clearingDate: today(),
            status: 'Paid',
            paidBy_ID: req.user.id
        });
        await UPDATE(Invoices, id).with({ status: 'Paid' });
        await UPDATE(Vendors, inv.vendor_ID).with({ spend: { '+=': Number(inv.amount) } });
        await audit(req.user.id, 'Pay', 'Invoice', id, 'Payment Pending', `Paid (${payID})`);

        const po = await SELECT.one.from(PurchaseOrders, inv.purchaseOrder_ID).columns('request_ID');
        if (po && po.request_ID) {
            const pr = await SELECT.one.from(PurchaseRequests, po.request_ID).columns('status');
            if (pr) await history(po.request_ID, 'Paid', req.user.id, currentRole(req),
                `${payID}: ${inv.amount} ${inv.currency} via ${method}`, pr.status, pr.status);
        }
        await checkCompletion(inv.purchaseOrder_ID, req);
    });

    // ---------------------------------------------------------------------
    // Identity
    // ---------------------------------------------------------------------

    this.on('me', async (req) => {
        const u = (await SELECT.one.from(Users, req.user.id)) ||
            (await SELECT.one.from(Users).where({ email: req.user.id }));
        return {
            id: req.user.id,
            name: (u && u.name) || req.user.id,
            role: currentRole(req),
            roles: KNOWN_ROLES.filter(r => req.user.is(r)),
            department: (u && u.department_ID) || null
        };
    });

    // ---------------------------------------------------------------------
    // Analytics
    // ---------------------------------------------------------------------

    this.on('analytics', async () => {
        const [prs, pos, invoices, payments, depts, prItems, hist, vendors] = await Promise.all([
            SELECT.from(PurchaseRequests).columns('ID', 'status', 'amount'),
            SELECT.from(PurchaseOrders).columns('ID', 'status', 'amount', 'vendor_ID'),
            SELECT.from(Invoices).columns('status', 'amount'),
            SELECT.from(Payments).columns('status', 'amount'),
            SELECT.from(Departments),
            SELECT.from(PurchaseRequestItems).columns('parent_ID', 'category', 'total'),
            SELECT.from(ApprovalHistory).columns('request_ID', 'action', 'toStatus', 'createdAt'),
            SELECT.from(Vendors).columns('ID', 'name')
        ]);

        const group = (rows, keyFn, amountFn) => {
            const m = new Map();
            for (const r of rows) {
                const k = keyFn(r) || 'Unassigned';
                const g = m.get(k) || { label: k, count: 0, amount: 0 };
                g.count++; g.amount = round2(g.amount + Number(amountFn(r) || 0));
                m.set(k, g);
            }
            return [...m.values()].sort((a, b) => b.amount - a.amount);
        };

        const livePOs = pos.filter(p => p.status !== 'Cancelled');
        const vendorName = Object.fromEntries(vendors.map(v => [v.ID, v.name]));
        const prStatus = Object.fromEntries(prs.map(p => [p.ID, p.status]));
        const spendItems = prItems.filter(i => !['Draft', 'Rejected', 'Cancelled', undefined].includes(prStatus[i.parent_ID]));

        // cycle times from the approval history
        const byReq = new Map();
        for (const h of hist) {
            const e = byReq.get(h.request_ID) || {};
            const t = new Date(h.createdAt).getTime();
            if (h.action === 'Submitted') e.submitted = Math.max(e.submitted || 0, t);
            if (h.action === 'Approved' && h.toStatus === 'Pending Procurement') e.approved = t;
            if (h.action === 'POGenerated') e.po = t;
            byReq.set(h.request_ID, e);
        }
        const avgHours = (key) => {
            const d = [...byReq.values()].filter(e => e.submitted && e[key] && e[key] >= e.submitted)
                .map(e => (e[key] - e.submitted) / 36e5);
            return d.length ? Math.round(d.reduce((s, x) => s + x, 0) / d.length * 10) / 10 : 0;
        };

        const totalBudget = depts.reduce((s, d) => s + Number(d.budgetAvailable), 0);
        const totalUsed = depts.reduce((s, d) => s + Number(d.budgetUsed), 0);

        return {
            totalRequests: prs.length,
            pendingApprovals: prs.filter(p => PENDING_STATUSES.includes(p.status) || p.status === 'Pending Procurement').length,
            activePOs: pos.filter(p => ['Issued', 'Partially Received'].includes(p.status)).length,
            committedSpend: round2(livePOs.reduce((s, p) => s + Number(p.amount), 0)),
            paidSpend: round2(payments.filter(p => p.status === 'Paid').reduce((s, p) => s + Number(p.amount), 0)),
            openPayables: round2(invoices.filter(i => ['Payment Pending', 'Blocked'].includes(i.status)).reduce((s, i) => s + Number(i.amount), 0)),
            blockedInvoices: invoices.filter(i => i.status === 'Blocked').length,
            budgetUtilization: totalBudget ? Math.round(totalUsed / totalBudget * 100) : 0,
            avgApprovalHours: avgHours('approved'),
            avgPRtoPOHours: avgHours('po'),
            byStatus: group(prs, p => p.status, p => p.amount),
            byCategory: group(spendItems, i => i.category, i => i.total),
            byVendor: group(livePOs, p => vendorName[p.vendor_ID], p => p.amount),
            byDepartment: depts.map(d => ({
                department: d.name,
                budget: Number(d.budgetAvailable),
                used: Number(d.budgetUsed),
                remaining: round2(Number(d.budgetAvailable) - Number(d.budgetUsed)),
                utilization: Number(d.budgetAvailable) ? Math.round(Number(d.budgetUsed) / Number(d.budgetAvailable) * 100) : 0
            })).sort((a, b) => b.utilization - a.utilization)
        };
    });
});
