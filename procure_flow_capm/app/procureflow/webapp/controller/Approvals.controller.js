sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "../model/actions",
    "../model/formatter"
], function (Controller, Fragment, Filter, FilterOperator, JSONModel, MessageToast, MessageBox, actions, formatter) {
    "use strict";

    var PENDING_STATUS_BY_ROLE = {
        Manager: ["Pending Manager Approval"],
        Finance: ["Pending Finance Approval"],
        Procurement: ["Pending Head Approval"],
        Admin: ["Pending Manager Approval", "Pending Finance Approval", "Pending Head Approval"]
    };

    return Controller.extend("procureflow.controller.Approvals", {
        formatter: formatter,

        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("Approvals").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oUser = this.getOwnerComponent().getModel("ui").getProperty("/currentUser");
            var aStatuses = PENDING_STATUS_BY_ROLE[oUser.role] || [];

            var oList = this.byId("approvalList");
            var oBinding = oList.getBinding("items");
            if (oBinding) {
                var aFilters = [new Filter("requestor_ID", FilterOperator.NE, oUser.id)];
                if (aStatuses.length) {
                    aFilters.push(new Filter(aStatuses.map(function (s) { return new Filter("status", FilterOperator.EQ, s); }), false));
                } else {
                    // no actionable stage for this role: show nothing
                    aFilters.push(new Filter("status", FilterOperator.EQ, "__none__"));
                }
                oBinding.filter(aFilters);
            }

            this.byId("detailBox").setVisible(false);
            oList.removeSelections(true);
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue");
            var oBinding = this.byId("approvalList").getBinding("items");
            var oUser = this.getOwnerComponent().getModel("ui").getProperty("/currentUser");
            var aStatuses = PENDING_STATUS_BY_ROLE[oUser.role] || [];
            var aFilters = [new Filter("requestor_ID", FilterOperator.NE, oUser.id)];
            aFilters.push(aStatuses.length
                ? new Filter(aStatuses.map(function (s) { return new Filter("status", FilterOperator.EQ, s); }), false)
                : new Filter("status", FilterOperator.EQ, "__none__"));
            if (sQuery) {
                aFilters.push(new Filter([
                    new Filter("ID", FilterOperator.Contains, sQuery),
                    new Filter("title", FilterOperator.Contains, sQuery)
                ], false));
            }
            oBinding.filter(aFilters);
        },

        onListSelect: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext();

            var oDetailBox = this.byId("detailBox");
            oDetailBox.setBindingContext(oContext);
            oDetailBox.setVisible(true);
        },

        _refreshList: function () {
            var oBinding = this.byId("approvalList").getBinding("items");
            if (oBinding) oBinding.refresh();
            this.byId("detailBox").setVisible(false);
            this.byId("approvalList").removeSelections(true);
        },

        _handleActionError: function (oError) {
            if (oError && oError.message === "cancelled") return;
            MessageBox.error((oError && oError.message) || "Something went wrong.");
        },

        _getActionDialog: function () {
            if (!this._pActionDialog) {
                this._pActionDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "procureflow.view.ActionDialog",
                    controller: this
                }).then(function (oDialog) {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }
            return this._pActionDialog;
        },

        _promptComment: function (sTitle, sMessage, sPlaceholder, sConfirmText, bMandatory) {
            return this._getActionDialog().then(function (oDialog) {
                var oModel = new JSONModel({ title: sTitle, message: sMessage, placeholder: sPlaceholder, confirmText: sConfirmText, comment: "" });
                oDialog.setModel(oModel, "actionDlg");
                return new Promise(function (resolve, reject) {
                    this._actionDialogBusy = { resolve: resolve, reject: reject, mandatory: bMandatory, model: oModel, dialog: oDialog };
                    oDialog.open();
                }.bind(this));
            }.bind(this));
        },

        onActionDialogConfirm: function () {
            var oCtx = this._actionDialogBusy;
            var sComment = (oCtx.model.getProperty("/comment") || "").trim();
            if (oCtx.mandatory && !sComment) {
                MessageToast.show("Please provide a reason/comment.");
                return;
            }
            oCtx.dialog.close();
            oCtx.resolve(sComment);
        },

        onActionDialogCancel: function () {
            var oCtx = this._actionDialogBusy;
            oCtx.dialog.close();
            oCtx.reject(new Error("cancelled"));
        },

        onApprovePress: function () {
            var oContext = this.byId("detailBox").getBindingContext();
            if (!oContext) { MessageToast.show("No item selected."); return; }
            var that = this;
            this._promptComment("Approve Request", "Add an optional comment for this approval.", "Comment (optional)", "Approve", false)
                .then(function (sComment) { return actions.invoke(oContext, "approve", { comment: sComment || null }); })
                .then(function () { MessageToast.show("Purchase Request approved."); that._refreshList(); })
                .catch(that._handleActionError.bind(that));
        },

        onRejectPress: function () {
            var oContext = this.byId("detailBox").getBindingContext();
            if (!oContext) { MessageToast.show("No item selected."); return; }
            var that = this;
            this._promptComment("Reject Request", "Please provide a reason for rejecting this request.", "Reason (required)", "Reject", true)
                .then(function (sReason) { return actions.invoke(oContext, "rejectRequest", { reason: sReason }); })
                .then(function () { MessageToast.show("Purchase Request rejected."); that._refreshList(); })
                .catch(that._handleActionError.bind(that));
        },

        onRequestChangesPress: function () {
            var oContext = this.byId("detailBox").getBindingContext();
            if (!oContext) { MessageToast.show("No item selected."); return; }
            var that = this;
            this._promptComment("Request Changes", "Explain what needs to change before this can be approved.", "Comment (required)", "Request Changes", true)
                .then(function (sComment) { return actions.invoke(oContext, "requestChanges", { comment: sComment }); })
                .then(function () { MessageToast.show("Changes requested."); that._refreshList(); })
                .catch(that._handleActionError.bind(that));
        }
    });
});
