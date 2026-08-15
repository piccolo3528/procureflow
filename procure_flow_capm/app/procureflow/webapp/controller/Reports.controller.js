sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel"
], function (Controller, History, Filter, FilterOperator, JSONModel) {
    "use strict";

    return Controller.extend("procureflow.controller.Reports", {
        onInit: function () {
            this.getView().setModel(new JSONModel({ totalRequests: 0, pendingApprovals: 0, activePOs: 0 }), "kpi");
            this.getOwnerComponent().getRouter().getRoute("Reports").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oKpiModel = this.getView().getModel("kpi");

            function count(sPath, aFilters) {
                var oBinding = oModel.bindList(sPath, undefined, undefined, aFilters, { $count: true });
                return oBinding.getHeaderContext().requestProperty("$count");
            }

            count("/PurchaseRequests").then(function (n) { oKpiModel.setProperty("/totalRequests", n); });

            count("/PurchaseRequests", [new Filter([
                new Filter("status", FilterOperator.EQ, "Pending Manager Approval"),
                new Filter("status", FilterOperator.EQ, "Pending Finance Approval"),
                new Filter("status", FilterOperator.EQ, "Pending Procurement")
            ], false)]).then(function (n) { oKpiModel.setProperty("/pendingApprovals", n); });

            count("/PurchaseOrders", [new Filter([
                new Filter("status", FilterOperator.EQ, "Issued"),
                new Filter("status", FilterOperator.EQ, "Partially Received")
            ], false)]).then(function (n) { oKpiModel.setProperty("/activePOs", n); });
        },

        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("Dashboard", {}, true);
            }
        }
    });
});
