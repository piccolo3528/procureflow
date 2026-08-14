sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/m/MessageToast"
], function (Controller, History, MessageToast) {
    "use strict";

    return Controller.extend("procureflow.controller.PRDetail", {
        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("PRDetail").attachPatternMatched(this._onObjectMatched, this);
        },

        _onObjectMatched: function (oEvent) {
            var sId = decodeURIComponent(oEvent.getParameter("arguments").id);
            this.getView().bindElement({
                path: "/PurchaseRequests('" + sId + "')",
                model: "mock"
            });
        },

        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                var oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo("PurchaseRequests", {}, true);
            }
        },

        onNavToDashboard: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("Dashboard", {}, true);
        },

        onActionPress: function (oEvent) {
            var sText = oEvent.getSource().getText();
            var oContext = this.getView().getBindingContext("mock");
            
            if (!oContext) {
                MessageToast.show("No item loaded.");
                return;
            }

            if (sText === "Approve") {
                oContext.setProperty("status", "Approved").then(function() {
                    MessageToast.show("Purchase Request Approved.");
                });
            } else if (sText === "Reject") {
                oContext.setProperty("status", "Rejected").then(function() {
                    MessageToast.show("Purchase Request Rejected.");
                });
            } else if (sText === "Generate PO") {
                var oModel = this.getView().getModel("mock");
                var oListBinding = oModel.bindList("/PurchaseOrders");
                var sNewId = "PO-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 1000);
                
                var oNewPO = oListBinding.create({
                    ID: sNewId,
                    title: oContext.getProperty("title"),
                    vendor: oContext.getProperty("vendor") || "Selected Vendor",
                    date: new Date().toISOString().split('T')[0],
                    amount: oContext.getProperty("amount"),
                    currency: oContext.getProperty("currency"),
                    status: "Issued",
                    buyer: "Current User",
                    prID: oContext.getProperty("ID")
                });

                oNewPO.created().then(function() {
                    oContext.setProperty("status", "PO Created").then(function() {
                        MessageToast.show("PO " + sNewId + " generated successfully.");
                    });
                }).catch(function() {
                    MessageToast.show("Error generating PO.");
                });
            } else {
                MessageToast.show(sText + " action triggered.");
            }
        }
    });
});
