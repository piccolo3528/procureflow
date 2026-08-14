sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel"
], function (Controller, Fragment, JSONModel) {
    "use strict";

    return Controller.extend("procureflow.controller.Dashboard", {
        onInit: function () {
        },

        onCreatePress: function () {
            var oView = this.getView();

            if (!this._pCreatePRDialog) {
                this._pCreatePRDialog = Fragment.load({
                    id: oView.getId(),
                    name: "procureflow.view.CreatePRDialog",
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pCreatePRDialog.then(function (oDialog) {
                var oNewPRModel = new JSONModel({
                    title: "",
                    priority: "Normal",
                    deliveryDate: "",
                    justification: "",
                    items: []
                });
                oDialog.setModel(oNewPRModel, "newPR");
                oDialog.open();
            });
        },

        onAddItemPress: function (oEvent) {
            // Because the dialog is dependent on the view, we can get the model from the view or dialog
            var oDialog = this.byId("createPRDialog");
            var oModel = oDialog.getModel("newPR");
            if(oModel) {
                var aItems = oModel.getProperty("/items") || [];
                aItems.push({ description: "", qty: 1, price: 0 });
                oModel.setProperty("/items", aItems);
            }
        },

        onDeleteItemPress: function (oEvent) {
            var oItem = oEvent.getSource().getParent();
            var oContext = oItem.getBindingContext("newPR");
            var sPath = oContext.getPath();
            var idx = parseInt(sPath.substring(sPath.lastIndexOf('/') + 1));
            
            var oDialog = this.byId("createPRDialog");
            var oModel = oDialog.getModel("newPR");
            var aItems = oModel.getProperty("/items");
            aItems.splice(idx, 1);
            oModel.setProperty("/items", aItems);
        },

        onClosePRDialog: function () {
            this.byId("createPRDialog").close();
        },

        onSubmitPRPress: function () {
            this.byId("createPRDialog").close();
            sap.m.MessageToast.show("Purchase Request submitted successfully.");
        },

        onSaveDraftPress: function () {
            this.byId("createPRDialog").close();
            sap.m.MessageToast.show("Draft saved.");
        },

        onNavToPR: function () {
            this.getOwnerComponent().getRouter().navTo("PurchaseRequests");
        },

        onNavToApprovals: function () {
            this.getOwnerComponent().getRouter().navTo("Approvals");
        },

        onPRSelect: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext("mock");
            var sId = oContext.getProperty("ID");
            
            this.getOwnerComponent().getRouter().navTo("PRDetail", {
                id: encodeURIComponent(sId)
            });
        }
    });
});
