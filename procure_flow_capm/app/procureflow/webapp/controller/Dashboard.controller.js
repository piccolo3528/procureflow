sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "./PRDialogHelper",
    "../model/formatter"
], function (Controller, Filter, FilterOperator, JSONModel, PRDialogHelper, formatter) {
    "use strict";

    var PENDING_STATUS_BY_ROLE = {
        Manager: ["Pending Manager Approval"],
        Finance: ["Pending Finance Approval"],
        Procurement: ["Pending Procurement"],
        Admin: ["Pending Manager Approval", "Pending Finance Approval", "Pending Procurement"]
    };

    return Controller.extend("procureflow.controller.Dashboard", {
        formatter: formatter,

        onInit: function () {
            this.getView().setModel(new JSONModel({
                myOpenRequests: 0,
                myDrafts: 0,
                pendingMyAction: 0,
                activeVendors: 0
            }), "kpi");
            this.getOwnerComponent().getRouter().getRoute("Dashboard").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._refreshKpis();
        },

        _count: function (sPath, aFilters) {
            var oModel = this.getOwnerComponent().getModel();
            var oBinding = oModel.bindList(sPath, undefined, undefined, aFilters, { $count: true });
            return oBinding.getHeaderContext().requestProperty("$count");
        },

        _refreshKpis: function () {
            var oUser = this.getOwnerComponent().getModel("ui").getProperty("/currentUser");
            var oKpiModel = this.getView().getModel("kpi");
            var aPendingStatuses = PENDING_STATUS_BY_ROLE[oUser.role] || [];

            this._count("/PurchaseRequests", [
                new Filter("requestor_ID", FilterOperator.EQ, oUser.id),
                new Filter("status", FilterOperator.NE, "Draft")
            ]).then(function (n) { oKpiModel.setProperty("/myOpenRequests", n); });

            this._count("/PurchaseRequests", [
                new Filter("requestor_ID", FilterOperator.EQ, oUser.id),
                new Filter("status", FilterOperator.EQ, "Draft")
            ]).then(function (n) { oKpiModel.setProperty("/myDrafts", n); });

            if (aPendingStatuses.length) {
                this._count("/PurchaseRequests", [
                    new Filter(aPendingStatuses.map(function (s) { return new Filter("status", FilterOperator.EQ, s); }), false)
                ]).then(function (n) { oKpiModel.setProperty("/pendingMyAction", n); });
            } else {
                oKpiModel.setProperty("/pendingMyAction", 0);
            }

            this._count("/Vendors", [new Filter("status", FilterOperator.EQ, "Active")])
                .then(function (n) { oKpiModel.setProperty("/activeVendors", n); });

            var oRecentTable = this.byId("recentTable");
            var oRecentBinding = oRecentTable && oRecentTable.getBinding("items");
            if (oRecentBinding) {
                oRecentBinding.filter([new Filter("requestor_ID", FilterOperator.EQ, oUser.id)]);
            }

            var oActivityBinding = this.byId("activityTable") && this.byId("activityTable").getBinding("items");
            if (oActivityBinding) {
                oActivityBinding.refresh();
            }
        },

        onCreatePress: function () {
            PRDialogHelper.open(this);
        },

        onAddItemPress: function () {
            PRDialogHelper.addItem(this);
        },

        onDeleteItemPress: function (oEvent) {
            PRDialogHelper.deleteItem(oEvent);
        },

        onClosePRDialog: function () {
            PRDialogHelper.close(this);
        },

        onSubmitPRPress: function () {
            PRDialogHelper.submit(this);
        },

        onSaveDraftPress: function () {
            PRDialogHelper.saveDraft(this);
        },

        onRequestCreated: function () {
            this._refreshKpis();
        },

        onNavToPR: function () {
            this.getOwnerComponent().getRouter().navTo("PurchaseRequests");
        },

        onNavToApprovals: function () {
            this.getOwnerComponent().getRouter().navTo("Approvals");
        },

        onPRSelect: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext();
            var sId = oContext.getProperty("ID");

            this.getOwnerComponent().getRouter().navTo("PRDetail", {
                id: encodeURIComponent(sId)
            });
        }
    });
});
