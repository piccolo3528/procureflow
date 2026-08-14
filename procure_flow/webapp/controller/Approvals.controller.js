sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast"
], function (Controller, Filter, FilterOperator, MessageToast) {
    "use strict";

    return Controller.extend("procureflow.controller.Approvals", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("Approvals").attachPatternMatched(this._onRouteMatched, this);
        },
        
        _onRouteMatched: function () {
            // filter for pending approvals
            var oList = this.byId("approvalList");
            var oBinding = oList.getBinding("items");
            if (oBinding) {
                var oFilter = new Filter("status", FilterOperator.EQ, "Pending Approval");
                oBinding.filter([oFilter]);
            }
            
            // clear detail selection
            this.byId("detailBox").setVisible(false);
            oList.removeSelections(true);
        },

        onListSelect: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext("mock");
            
            var oDetailBox = this.byId("detailBox");
            oDetailBox.setBindingContext(oContext, "mock");
            oDetailBox.setVisible(true);
        },

        onActionPress: function (oEvent) {
            var sAction = oEvent.getSource().getText();
            var oContext = this.byId("detailBox").getBindingContext("mock");
            
            if (!oContext) {
                MessageToast.show("No item selected.");
                return;
            }

            if (sAction === "Approve Request") {
                oContext.setProperty("status", "Approved").then(function() {
                    MessageToast.show("Purchase Request Approved successfully.");
                }).catch(function(oError) {
                    MessageToast.show("Error approving request.");
                });
                this.byId("detailBox").setVisible(false);
                this.byId("approvalList").removeSelections(true);
            } else if (sAction === "Reject") {
                oContext.setProperty("status", "Rejected").then(function() {
                    MessageToast.show("Purchase Request Rejected.");
                }).catch(function(oError) {
                    MessageToast.show("Error rejecting request.");
                });
                this.byId("detailBox").setVisible(false);
                this.byId("approvalList").removeSelections(true);
            } else {
                MessageToast.show("Action '" + sAction + "' triggered.");
            }
        }
    });
});
