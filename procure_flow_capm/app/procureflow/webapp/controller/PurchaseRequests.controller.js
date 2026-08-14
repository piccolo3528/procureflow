sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel"
], function (Controller, History, Filter, FilterOperator, MessageToast, Fragment, JSONModel) {
    "use strict";

    return Controller.extend("procureflow.controller.PurchaseRequests", {
        onInit: function () {
        },

        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                var oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo("Dashboard", {}, true);
            }
        },

        onSearch: function (oEvent) {
            var aFilters = [];
            var sQuery = this.byId("searchField").getValue();
            var sStatus = this.byId("statusFilter").getSelectedKey();

            if (sQuery) {
                var filterQuery = new Filter([
                    new Filter("ID", FilterOperator.Contains, sQuery),
                    new Filter("title", FilterOperator.Contains, sQuery)
                ], false);
                aFilters.push(filterQuery);
            }
            if (sStatus && sStatus !== "All") {
                aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
            }

            // update list binding
            var oList = this.byId("prTable");
            var oBinding = oList.getBinding("items");
            oBinding.filter(aFilters, "Application");
        },

        onClear: function (oEvent) {
            this.byId("searchField").setValue("");
            this.byId("statusFilter").setSelectedKey("");
            this.onSearch();
        },

        onPRSelect: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem.getBindingContext("mock");
            var sId = oContext.getProperty("ID");
            
            this.getOwnerComponent().getRouter().navTo("PRDetail", {
                id: encodeURIComponent(sId)
            });
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
            MessageToast.show("Purchase Request submitted successfully.");
        },

        onSaveDraftPress: function () {
            this.byId("createPRDialog").close();
            MessageToast.show("Draft saved.");
        }
    });
});
