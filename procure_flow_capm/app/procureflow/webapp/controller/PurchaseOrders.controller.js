sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/routing/History",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "../model/actions",
    "../model/formatter",
    "../model/csv"
], function (Controller, Filter, FilterOperator, History, MessageToast, MessageBox, actions, formatter, csv) {
    "use strict";

    return Controller.extend("procureflow.controller.PurchaseOrders", {
        formatter: formatter,

        onInit: function () {
        },

        onExport: function () {
            csv.downloadBinding(this.byId("poTable").getBinding("items"), "purchase-orders.csv", [
                { label: "PO Number", path: "ID" }, { label: "Purchase Request", path: "request_ID" },
                { label: "Vendor", path: "vendor/name" }, { label: "Amount", path: "amount" },
                { label: "Currency", path: "currency" }, { label: "Status", path: "status" },
                { label: "Buyer", path: "buyer/name" }, { label: "Date", path: "date" }
            ]);
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

        onNavToGoodsReceipts: function () {
            this.getOwnerComponent().getRouter().navTo("GoodsReceipts");
        },

        onSearch: function (oEvent) {
            var aFilters = [];
            var sQuery = this.byId("searchField").getValue();
            if (sQuery && sQuery.length > 0) {
                var oFilter1 = new Filter("ID", FilterOperator.Contains, sQuery);
                var oFilter2 = new Filter("vendor_ID", FilterOperator.Contains, sQuery);
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
        },

        onCancelPOPress: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext();
            var that = this;
            MessageBox.confirm("Cancel this Purchase Order?", {
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) return;
                    actions.invoke(oContext, "cancel", { reason: null }).then(function () {
                        MessageToast.show("Purchase Order cancelled.");
                    }).catch(function (oError) {
                        MessageBox.error(oError.message || "Could not cancel Purchase Order.");
                    });
                }
            });
        }
    });
});
