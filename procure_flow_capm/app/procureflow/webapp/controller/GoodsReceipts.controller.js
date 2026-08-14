sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/routing/History",
    "sap/m/MessageToast"
], function (Controller, Filter, FilterOperator, History, MessageToast) {
    "use strict";

    return Controller.extend("procureflow.controller.GoodsReceipts", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("GoodsReceipts").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oList = this.byId("poList");
            var oBinding = oList.getBinding("items");
            if (oBinding) {
                var oFilter = new Filter("status", FilterOperator.NE, "Closed");
                oBinding.filter([oFilter]);
            }
            this.byId("detailBox").setVisible(false);
            oList.removeSelections(true);
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

        onPOSelect: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext("mock");
            
            var oDetailBox = this.byId("detailBox");
            oDetailBox.setBindingContext(oContext, "mock");
            oDetailBox.setVisible(true);
        },

        onPostGR: function () {
            var oContext = this.byId("detailBox").getBindingContext("mock");
            if (!oContext) {
                MessageToast.show("Please select a Purchase Order first.");
                return;
            }
            
            // In a real app we'd construct a payload from the table for GoodsReceipts endpoint.
            // For this flow we just mark the PO as Received/Closed for demonstration.
            oContext.setProperty("status", "Closed").then(function() {
                MessageToast.show("Goods Receipt posted successfully. PO Closed.");
            });
            this.byId("detailBox").setVisible(false);
            this.byId("poList").removeSelections(true);
        }
    });
});
