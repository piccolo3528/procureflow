sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "./PRDialogHelper",
    "../model/formatter",
    "../model/csv"
], function (Controller, History, Filter, FilterOperator, PRDialogHelper, formatter, csv) {
    "use strict";

    return Controller.extend("procureflow.controller.PurchaseRequests", {
        formatter: formatter,

        onInit: function () {
        },

        onExport: function () {
            csv.downloadBinding(this.byId("prTable").getBinding("items"), "purchase-requests.csv", [
                { label: "Request ID", path: "ID" }, { label: "Title", path: "title" },
                { label: "Requestor", path: "requestor/name" }, { label: "Status", path: "status" },
                { label: "Amount", path: "amount" }, { label: "Currency", path: "currency" },
                { label: "Date", path: "date" }
            ]);
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
            var oContext = oItem.getBindingContext();
            var sId = oContext.getProperty("ID");

            this.getOwnerComponent().getRouter().navTo("PRDetail", {
                id: encodeURIComponent(sId)
            });
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
            var oBinding = this.byId("prTable").getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        }
    });
});
