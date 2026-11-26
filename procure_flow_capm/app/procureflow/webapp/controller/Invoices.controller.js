sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "../model/actions",
    "../model/formatter"
], function (Controller, Fragment, History, Filter, FilterOperator, JSONModel, MessageToast, MessageBox, actions, formatter) {
    "use strict";

    var AP_ROLES = ["Finance", "Procurement", "Admin"];

    return Controller.extend("procureflow.controller.Invoices", {
        formatter: formatter,

        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("Invoices").attachPatternMatched(this._onRouteMatched, this);
        },

        _currentUser: function () {
            return this.getOwnerComponent().getModel("ui").getProperty("/currentUser");
        },

        _onRouteMatched: function () {
            if (AP_ROLES.indexOf(this._currentUser().role) === -1) return;
            // list bindings start suspended so users without AP access never fire a (403) request
            [this.byId("invoiceList"), this.byId("paymentsTable")].forEach(function (oControl) {
                var oBinding = oControl.getBinding("items");
                if (!oBinding) return;
                if (oBinding.isSuspended()) oBinding.resume(); else oBinding.refresh();
            });
            this.byId("invoiceDetail").setVisible(false);
            this.byId("invoiceList").removeSelections(true);
        },

        onNavBack: function () {
            if (History.getInstance().getPreviousHash() !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("Dashboard", {}, true);
            }
        },

        _handleError: function (oError) {
            if (oError && oError.message === "cancelled") return;
            MessageBox.error((oError && oError.message) || "Something went wrong.");
        },

        _refresh: function () {
            this.byId("invoiceList").getBinding("items").refresh();
            this.byId("paymentsTable").getBinding("items").refresh();
            var oDetailCtx = this.byId("invoiceDetail").getBindingContext();
            if (oDetailCtx) oDetailCtx.refresh();
        },

        // ------------------------------------------------------------------
        // List / detail
        // ------------------------------------------------------------------

        onInvoiceFilterChange: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            var oBinding = this.byId("invoiceList").getBinding("items");
            oBinding.filter(sKey === "All" ? [] : [new Filter("status", FilterOperator.EQ, sKey)]);
            this.byId("invoiceDetail").setVisible(false);
        },

        onInvoiceSelect: function (oEvent) {
            var oCtx = oEvent.getParameter("listItem").getBindingContext();
            var oDetail = this.byId("invoiceDetail");
            oDetail.bindElement({ path: oCtx.getPath() });
            oDetail.setVisible(true);
        },

        // ------------------------------------------------------------------
        // Post invoice (3-way match happens on the server)
        // ------------------------------------------------------------------

        _getDialog: function (sName, sProp) {
            if (!this[sProp]) {
                this[sProp] = Fragment.load({
                    id: this.getView().getId(),
                    name: "procureflow.view." + sName,
                    controller: this
                }).then(function (oDialog) {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }
            return this[sProp];
        },

        onPostInvoicePress: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oPOBinding = oModel.bindList("/PurchaseOrders", undefined, undefined, [new Filter([
                new Filter("status", FilterOperator.EQ, "Partially Received"),
                new Filter("status", FilterOperator.EQ, "Closed")
            ], false)], { $expand: "vendor($select=name),items", $orderby: "date desc" });
            var that = this;

            Promise.all([oPOBinding.requestContexts(0, 200), this._getDialog("PostInvoiceDialog", "_pPostDialog")])
                .then(function (aResult) {
                    var aPOs = aResult[0].map(function (c) {
                        var o = c.getObject();
                        return {
                            ID: o.ID, status: o.status, currency: o.currency,
                            vendorName: o.vendor ? o.vendor.name : "",
                            items: (o.items || []).map(function (it) {
                                var iBillable = Math.max(0, Number(it.qtyReceived) - Number(it.qtyInvoiced || 0));
                                return {
                                    ID: it.ID, description: it.description, qty: it.qty,
                                    qtyReceived: it.qtyReceived, qtyInvoiced: it.qtyInvoiced || 0,
                                    poPrice: it.price, invQty: iBillable, invPrice: Number(it.price)
                                };
                            })
                        };
                    }).filter(function (po) {
                        return po.items.some(function (it) { return it.invQty > 0; });
                    });
                    if (!aPOs.length) {
                        MessageToast.show("No Purchase Orders with received, un-invoiced goods.");
                        return;
                    }
                    var oDialog = aResult[1];
                    oDialog.setModel(new JSONModel({
                        openPOs: aPOs, poId: aPOs[0].ID, items: aPOs[0].items, currency: aPOs[0].currency,
                        vendorInvoiceNo: "", invoiceDate: new Date().toISOString().slice(0, 10), taxAmount: 0
                    }), "inv");
                    oDialog.open();
                }).catch(that._handleError.bind(that));
        },

        onInvoicePOChange: function () {
            var oModel = this.byId("postInvoiceDialog").getModel("inv");
            var sId = oModel.getProperty("/poId");
            var oPO = oModel.getProperty("/openPOs").filter(function (p) { return p.ID === sId; })[0];
            oModel.setProperty("/items", oPO ? oPO.items : []);
            oModel.setProperty("/currency", oPO ? oPO.currency : "USD");
        },

        onPostInvoiceConfirm: function () {
            var oDialog = this.byId("postInvoiceDialog");
            var oData = oDialog.getModel("inv").getData();
            var aLines = oData.items.filter(function (it) { return Number(it.invQty) > 0; }).map(function (it) {
                return { orderItem: it.ID, qty: parseInt(it.invQty, 10), price: String(Number(it.invPrice) || 0) };
            });
            if (!oData.vendorInvoiceNo) { MessageToast.show("Enter the vendor's invoice number."); return; }
            if (!aLines.length) { MessageToast.show("Enter an invoice quantity for at least one item."); return; }

            var oPOContext = this.getOwnerComponent().getModel().bindContext("/PurchaseOrders('" + oData.poId + "')").getBoundContext();
            var that = this;
            actions.invokeWithResult(oPOContext, "postInvoice", {
                vendorInvoiceNo: oData.vendorInvoiceNo,
                invoiceDate: oData.invoiceDate || null,
                taxAmount: String(Number(oData.taxAmount) || 0),
                items: aLines
            }).then(function (sInvoiceId) {
                oDialog.close();
                that._refresh();
                MessageToast.show("Invoice " + (sInvoiceId || "") + " posted - see its 3-way match result.");
            }).catch(this._handleError.bind(this));
        },

        onPostInvoiceCancel: function () {
            this.byId("postInvoiceDialog").close();
        },

        // ------------------------------------------------------------------
        // Release / reject / pay
        // ------------------------------------------------------------------

        _promptComment: function (sTitle, sMessage, sPlaceholder, sConfirmText) {
            return this._getDialog("ActionDialog", "_pActionDialog").then(function (oDialog) {
                var oModel = new JSONModel({ title: sTitle, message: sMessage, placeholder: sPlaceholder, confirmText: sConfirmText, comment: "" });
                oDialog.setModel(oModel, "actionDlg");
                return new Promise(function (resolve, reject) {
                    this._actionDialogBusy = { resolve: resolve, reject: reject, model: oModel, dialog: oDialog };
                    oDialog.open();
                }.bind(this));
            }.bind(this));
        },

        onActionDialogConfirm: function () {
            var oCtx = this._actionDialogBusy;
            var sComment = (oCtx.model.getProperty("/comment") || "").trim();
            if (!sComment) { MessageToast.show("Please provide a reason/comment."); return; }
            oCtx.dialog.close();
            oCtx.resolve(sComment);
        },

        onActionDialogCancel: function () {
            this._actionDialogBusy.dialog.close();
            this._actionDialogBusy.reject(new Error("cancelled"));
        },

        onReleaseBlockPress: function () {
            var oCtx = this.byId("invoiceDetail").getBindingContext();
            var that = this;
            this._promptComment("Release Payment Block", "Explain why this variance is acceptable (e.g. confirmed with buyer).", "Justification (required)", "Release")
                .then(function (s) { return actions.invoke(oCtx, "releaseBlock", { comment: s }); })
                .then(function () { MessageToast.show("Block released - invoice is ready for payment."); that._refresh(); })
                .catch(this._handleError.bind(this));
        },

        onRejectInvoicePress: function () {
            var oCtx = this.byId("invoiceDetail").getBindingContext();
            var that = this;
            this._promptComment("Reject Invoice", "The invoice will be returned to the vendor and its quantities released.", "Reason (required)", "Reject")
                .then(function (s) { return actions.invoke(oCtx, "rejectInvoice", { reason: s }); })
                .then(function () { MessageToast.show("Invoice rejected."); that._refresh(); })
                .catch(this._handleError.bind(this));
        },

        onPayPress: function () {
            var oCtx = this.byId("invoiceDetail").getBindingContext();
            this._getDialog("PayInvoiceDialog", "_pPayDialog").then(function (oDialog) {
                oDialog.setModel(new JSONModel({
                    amount: oCtx.getProperty("amount"), currency: oCtx.getProperty("currency"), method: "Wire", reference: ""
                }), "pay");
                oDialog.open();
            });
        },

        onPayConfirm: function () {
            var oDialog = this.byId("payInvoiceDialog");
            var oData = oDialog.getModel("pay").getData();
            var oCtx = this.byId("invoiceDetail").getBindingContext();
            var that = this;
            oDialog.close();
            actions.invoke(oCtx, "pay", { method: oData.method, reference: oData.reference || null })
                .then(function () { MessageToast.show("Payment executed."); that._refresh(); })
                .catch(this._handleError.bind(this));
        },

        onPayCancel: function () {
            this.byId("payInvoiceDialog").close();
        }
    });
});
