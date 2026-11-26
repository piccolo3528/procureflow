/**
 * End-to-end tests for the ProcureFlow CAP service.
 * Run with: npm test   (node --test, in-memory SQLite, mocked auth users U1..U5)
 *
 * U1 Employee (reports to U2) | U2 Manager | U3 Finance | U4 Procurement | U5 Admin
 */
const cds = require('@sap/cds');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { GET, POST, PATCH } = cds.test(__dirname + '/..');

const SRV = '/odata/v4/procure-flow';
const NS = 'ProcureFlowService';
const as = (u) => ({ auth: { username: u, password: u } });

async function fails(promise, status, pattern) {
    try {
        await promise;
    } catch (err) {
        const actual = err.status || (err.response && err.response.status) || err.code;
        assert.equal(Number(actual), status, `expected HTTP ${status}, got ${actual}: ${err.message}`);
        if (pattern) assert.match(err.message, pattern);
        return;
    }
    assert.fail(`expected request to fail with HTTP ${status}`);
}

const pr = (id) => `${SRV}/PurchaseRequests('${id}')`;
const po = (id) => `${SRV}/PurchaseOrders('${id}')`;
const inv = (id) => `${SRV}/Invoices('${id}')`;
const act = (path, action, data, user) => POST(`${path}/${NS}.${action}`, data || {}, as(user));
const read = async (path, user = 'U5') => (await GET(path, as(user))).data;

async function createPR(user, items, extra = {}) {
    const { data } = await POST(`${SRV}/PurchaseRequests`, {
        title: 'Test request',
        justification: 'Needed for testing',
        requiredDate: '2099-01-15',
        items,
        ...extra
    }, as(user));
    return data;
}

describe('Security & data protection', () => {
    it('rejects unauthenticated access', async () => {
        await fails(GET(`${SRV}/PurchaseRequests`), 401);
    });

    it('employees only see their own purchase requests', async () => {
        const { value } = await read(`${SRV}/PurchaseRequests`, 'U1');
        assert.ok(value.length > 0);
        assert.ok(value.every(r => r.requestor_ID === 'U1'));
        const all = await read(`${SRV}/PurchaseRequests`, 'U2');
        assert.ok(all.value.length > value.length);
    });

    it('ignores client attempts to change workflow-controlled fields', async () => {
        await PATCH(pr('PR-2026-005'), { status: 'Pending Procurement', amount: 1, title: 'Renamed draft' }, as('U1'));
        const row = await read(pr('PR-2026-005'));
        assert.equal(row.status, 'Draft');
        assert.equal(row.title, 'Renamed draft');
        assert.notEqual(Number(row.amount), 1);
    });

    it('only the requestor may edit a draft', async () => {
        await fails(PATCH(pr('PR-2026-005'), { title: 'Hijacked' }, as('U2')), 403);
    });

    it('me() reports the backend identity and highest role', async () => {
        const me = await read(`${SRV}/me()`, 'U3');
        assert.equal(me.id, 'U3');
        assert.equal(me.name, 'Mike Torres');
        assert.equal(me.role, 'Finance');
    });

    it('analytics are not available to employees', async () => {
        await fails(GET(`${SRV}/analytics()`, as('U1')), 403);
    });

    it('settings are validated and admin-only', async () => {
        await fails(PATCH(`${SRV}/Settings('default')`, { managerOnlyLimit: 500 }, as('U2')), 403);
        await fails(PATCH(`${SRV}/Settings('default')`, { managerOnlyLimit: 50000 }, as('U5')), 400, /lower than/);
    });

    it('deactivated users are locked out', async () => {
        await PATCH(`${SRV}/Users('U1')`, { active: false }, as('U5'));
        await fails(GET(`${SRV}/PurchaseRequests`, as('U1')), 403, /deactivated/);
        await PATCH(`${SRV}/Users('U1')`, { active: true }, as('U5'));
        await GET(`${SRV}/PurchaseRequests`, as('U1'));
        await fails(PATCH(`${SRV}/Users('U5')`, { active: false }, as('U5')), 400);
    });
});

describe('Approval matrix', () => {
    it('<= 1,000 needs manager approval only', async () => {
        const r = await createPR('U1', [{ ID: 'SM-1', description: 'Keyboard', category: 'Hardware', qty: 2, price: 150 }]);
        assert.equal(Number(r.amount), 300);
        await act(pr(r.ID), 'submit', {}, 'U1');
        let row = await read(pr(r.ID));
        assert.equal(row.status, 'Pending Manager Approval');
        assert.equal(row.approvalRoute, 'Manager');
        await act(pr(r.ID), 'approve', { comment: 'ok' }, 'U2');
        row = await read(pr(r.ID));
        assert.equal(row.status, 'Pending Procurement');
        assert.equal(row.budgetCommitted, true);
    });

    it('blocks submission when the department budget would be exceeded (E001)', async () => {
        const r = await createPR('U1', [{ ID: 'BX-1', description: 'Campaign', category: 'Services', qty: 1, price: 30000 }],
            { department_ID: 'D-MKT' });
        await fails(act(pr(r.ID), 'submit', {}, 'U1'), 400, /E001/);
    });

    it('rejects past required dates and empty requests', async () => {
        const r = await createPR('U1', [{ ID: 'PD-1', description: 'Mouse', qty: 1, price: 20 }], { requiredDate: '2020-01-01' });
        await fails(act(pr(r.ID), 'submit', {}, 'U1'), 400, /future/);
        await fails(createPR('U1', [{ ID: 'NQ-1', description: 'Bad', qty: 0, price: 20 }]), 400);
    });

    it('request changes sends it back to the requestor for rework', async () => {
        const r = await createPR('U1', [{ ID: 'RW-1', description: 'Monitor', qty: 1, price: 400 }]);
        await act(pr(r.ID), 'submit', {}, 'U1');
        await fails(act(pr(r.ID), 'requestChanges', {}, 'U2'), 400); // comment is mandatory
        await act(pr(r.ID), 'requestChanges', { comment: 'Add a quote' }, 'U2');
        assert.equal((await read(pr(r.ID))).status, 'Changes Requested');
        await PATCH(pr(r.ID), { justification: 'Quote attached' }, as('U1'));
        await act(pr(r.ID), 'submit', {}, 'U1');
        assert.equal((await read(pr(r.ID))).status, 'Pending Manager Approval');
    });
});

describe('Procure-to-Pay end to end (> 10,000: Manager -> Finance -> Procurement Head)', () => {
    let prID, poID, items, inv1, inv3;
    const budgetBefore = {};

    it('employee creates and submits a 12,000 request', async () => {
        budgetBefore.used = Number((await read(`${SRV}/Departments('D-IT')`)).budgetUsed);
        const r = await createPR('U1', [
            { ID: 'E2E-1', description: 'Laptop', category: 'Hardware', qty: 4, price: 2000 },
            { ID: 'E2E-2', description: 'Docking station', category: 'Hardware', qty: 2, price: 2000 }
        ], { title: 'E2E laptops' });
        prID = r.ID;
        assert.equal(Number(r.amount), 12000);
        assert.equal(r.department_ID, 'D-IT');
        await act(pr(prID), 'submit', {}, 'U1');
        const row = await read(pr(prID));
        assert.equal(row.approvalRoute, 'Manager>Finance>Head');
    });

    it('notifies the line manager, and only the recipient can see it', async () => {
        const mine = await read(`${SRV}/Notifications?$filter=documentID eq '${prID}'`, 'U2');
        assert.equal(mine.value.length, 1);
        const others = await read(`${SRV}/Notifications?$filter=documentID eq '${prID}'`, 'U3');
        assert.equal(others.value.length, 0);
    });

    it('enforces segregation of duties and stage roles', async () => {
        await fails(act(pr(prID), 'approve', {}, 'U1'), 403);
        await fails(act(pr(prID), 'approve', {}, 'U3'), 403);
        await fails(act(pr(prID), 'selectVendor', { vendor: 'V-001' }, 'U4'), 400);
    });

    it('moves through Manager -> Finance -> Procurement Head', async () => {
        await act(pr(prID), 'approve', { comment: 'Manager ok' }, 'U2');
        assert.equal((await read(pr(prID))).status, 'Pending Finance Approval');
        await act(pr(prID), 'approve', { comment: 'Budget ok' }, 'U3');
        assert.equal((await read(pr(prID))).status, 'Pending Head Approval');
        assert.equal(Number((await read(`${SRV}/Departments('D-IT')`)).budgetUsed), budgetBefore.used);
        await act(pr(prID), 'approve', { comment: 'Head ok' }, 'U4');
        const row = await read(pr(prID));
        assert.equal(row.status, 'Pending Procurement');
        assert.equal(Number((await read(`${SRV}/Departments('D-IT')`)).budgetUsed), budgetBefore.used + 12000);
    });

    it('only allows active vendors and generates the PO', async () => {
        await fails(act(pr(prID), 'selectVendor', { vendor: 'V-004' }, 'U4'), 400, /Inactive/);
        await act(pr(prID), 'selectVendor', { vendor: 'V-001', reason: 'Preferred' }, 'U4');
        await act(pr(prID), 'generatePO', {}, 'U4');
        const pos = await read(`${SRV}/PurchaseOrders?$filter=request_ID eq '${prID}'&$expand=items`);
        assert.equal(pos.value.length, 1);
        poID = pos.value[0].ID;
        items = Object.fromEntries(pos.value[0].items.map(i => [i.description, i.ID]));
        assert.match(poID, /^PO-\d{4}-\d{3}$/);
        assert.equal(Number(pos.value[0].amount), 12000);
        assert.equal((await read(pr(prID))).status, 'PO Created');
    });

    it('rejects invoices before goods receipt and over-receipt', async () => {
        await fails(act(po(poID), 'postInvoice', { vendorInvoiceNo: 'X', items: [{ orderItem: items.Laptop, qty: 1, price: 2000 }] }, 'U3'), 400, /goods receipt/);
        await fails(act(po(poID), 'recordGoodsReceipt', { items: [{ orderItem: items.Laptop, qtyReceived: 5 }] }, 'U4'), 400, /exceed/);
    });

    it('posts a partial goods receipt', async () => {
        await act(po(poID), 'recordGoodsReceipt', {
            location: 'HQ', items: [
                { orderItem: items.Laptop, qtyReceived: 4 },
                { orderItem: items['Docking station'], qtyReceived: 1 }
            ]
        }, 'U4');
        assert.equal((await read(po(poID))).status, 'Partially Received');
        assert.equal((await read(pr(prID))).status, 'Partially Received');
    });

    it('3-way match: a matching invoice goes to Payment Pending, duplicates are refused', async () => {
        const res = await act(po(poID), 'postInvoice', {
            vendorInvoiceNo: 'APL-1001', invoiceDate: '2026-01-10', taxAmount: 0,
            items: [{ orderItem: items.Laptop, qty: 4, price: 2000 }]
        }, 'U3');
        inv1 = res.data.value;
        const row = await read(inv(inv1));
        assert.equal(row.status, 'Payment Pending');
        assert.equal(Number(row.variance), 0);
        await fails(act(po(poID), 'postInvoice', {
            vendorInvoiceNo: 'APL-1001', items: [{ orderItem: items['Docking station'], qty: 1, price: 2000 }]
        }, 'U3'), 409, /Duplicate/);
    });

    it('3-way match: invoicing more than received is blocked; four-eyes release', async () => {
        const res = await act(po(poID), 'postInvoice', {
            vendorInvoiceNo: 'APL-1002', items: [{ orderItem: items['Docking station'], qty: 2, price: 2000 }]
        }, 'U3');
        const inv2 = res.data.value;
        const row = await read(`${inv(inv2)}?$expand=items`);
        assert.equal(row.status, 'Blocked');
        assert.match(row.blockReason, /Quantity variance/);
        assert.equal(row.items[0].matchStatus, 'Quantity Variance');
        await fails(act(inv(inv2), 'pay', { method: 'Wire' }, 'U3'), 400);
        await fails(act(inv(inv2), 'releaseBlock', { comment: 'fine' }, 'U3'), 403, /different/);
        await act(inv(inv2), 'rejectInvoice', { reason: 'Only one dock delivered' }, 'U5');
        assert.equal((await read(inv(inv2))).status, 'Rejected');
        const dock = (await read(`${SRV}/PurchaseOrderItems('${items['Docking station']}')`));
        assert.equal(dock.qtyInvoiced, 0);
    });

    it('closes the PO on the final goods receipt', async () => {
        await act(po(poID), 'recordGoodsReceipt', { items: [{ orderItem: items['Docking station'], qtyReceived: 1 }] }, 'U4');
        assert.equal((await read(po(poID))).status, 'Closed');
        assert.equal((await read(pr(prID))).status, 'Goods Received');
    });

    it('accepts a price variance within tolerance (min of 5% / 100)', async () => {
        await fails(act(po(poID), 'postInvoice', {
            vendorInvoiceNo: 'APL-1003', items: [{ orderItem: items['Docking station'], qty: 2, price: 2600 }]
        }, 'U3'), 400, /exceeds the PO amount/);
        const res = await act(po(poID), 'postInvoice', {
            vendorInvoiceNo: 'APL-1004', items: [{ orderItem: items['Docking station'], qty: 2, price: 2050 }]
        }, 'U3');
        inv3 = res.data.value;
        const row = await read(`${inv(inv3)}?$expand=items`);
        assert.equal(row.status, 'Payment Pending');
        assert.equal(Number(row.variance), 100);
        assert.equal(row.items[0].matchStatus, 'Price Variance');
    });

    it('pays invoices, updates vendor spend and completes the request', async () => {
        const spendBefore = Number((await read(`${SRV}/Vendors('V-001')`)).spend);
        await fails(act(inv(inv1), 'pay', { method: 'Bitcoin' }, 'U3'), 400);
        await fails(act(inv(inv1), 'pay', { method: 'Wire' }, 'U4'), 403);
        await act(inv(inv1), 'pay', { method: 'Wire', reference: 'WIRE-1' }, 'U3');
        assert.equal((await read(pr(prID))).status, 'Goods Received');
        await act(inv(inv3), 'pay', { method: 'ACH' }, 'U3');
        assert.equal((await read(pr(prID))).status, 'Completed');
        assert.equal(Number((await read(`${SRV}/Vendors('V-001')`)).spend), spendBefore + 8000 + 4100);
        const payments = await read(`${SRV}/Payments?$filter=vendor_ID eq 'V-001'`);
        assert.equal(payments.value.length, 2);
    });

    it('records the full approval/audit trail', async () => {
        const h = await read(`${SRV}/ApprovalHistory?$filter=request_ID eq '${prID}'&$orderby=createdAt`);
        const actions = h.value.map(x => x.action);
        for (const a of ['Submitted', 'Approved', 'VendorSelected', 'POGenerated', 'GoodsReceived', 'InvoicePosted', 'Paid', 'Completed']) {
            assert.ok(actions.includes(a), `missing history action ${a}`);
        }
        const logs = await read(`${SRV}/AuditLogs?$filter=documentID eq '${prID}'`, 'U1');
        assert.ok(logs.value.every(l => l.user_ID === 'U1'));
    });

    it('analytics reflect the cycle', async () => {
        const a = await read(`${SRV}/analytics()`, 'U3');
        assert.ok(a.totalRequests >= 6);
        assert.ok(Number(a.paidSpend) >= 12100);
        assert.ok(a.byDepartment.length === 5);
        assert.ok(a.byStatus.some(s => s.label === 'Completed'));
    });
});
