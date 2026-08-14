sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/routing/History"
], function (Controller, Filter, FilterOperator, History) {
    "use strict";

    return Controller.extend("procureflow.controller.PurchaseOrders", {
        onInit: function () {
        },

        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();
            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("Dashboard", {}, true);
            }
        },

        onSearch: function (oEvent) {
            var aFilters = [];
            var sQuery = this.byId("searchField").getValue();
            if (sQuery && sQuery.length > 0) {
                var oFilter1 = new Filter("ID", FilterOperator.Contains, sQuery);
                var oFilter2 = new Filter("vendor", FilterOperator.Contains, sQuery);
                aFilters.push(new Filter({filters: [oFilter1, oFilter2], and: false}));
            }

            var sStatus = this.byId("statusFilter").getSelectedKey();
            if (sStatus && sStatus !== "All") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
            }

            var oList = this.byId("poTable");
            var oBinding = oList.getBinding("items");
            if (oBinding) {
                oBinding.filter(aFilters);
            }
        },

        onClear: function () {
            this.byId("searchField").setValue("");
            this.byId("statusFilter").setSelectedKey("All");
            this.onSearch();
        }
    });
});
