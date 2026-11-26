sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "../model/actions",
    "../model/formatter",
    "../model/csv"
], function (Controller, History, Filter, FilterOperator, JSONModel, MessageBox, actions, formatter, csv) {
    "use strict";

    function isoDate(d) {
        return d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null;
    }

    return Controller.extend("procureflow.controller.Reports", {
        formatter: formatter,

        onInit: function () {
            this.getView().setModel(new JSONModel({ busy: false, data: {} }), "an");
            this.getOwnerComponent().getRouter().getRoute("Reports").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var sRole = this.getOwnerComponent().getModel("ui").getProperty("/currentUser/role");
            if (sRole === "Employee") return;
            var oDrill = this.byId("drillTable").getBinding("items");
            if (oDrill && oDrill.isSuspended()) oDrill.resume();
            this.onRefresh();
        },

        onRefresh: function () {
            var oAn = this.getView().getModel("an");
            oAn.setProperty("/busy", true);
            actions.callOperation(this.getOwnerComponent().getModel(), "/analytics").then(function (oData) {
                oAn.setProperty("/data", oData || {});
            }).catch(function (oError) {
                MessageBox.error("Could not load analytics: " + (oError.message || oError));
            }).finally(function () {
                oAn.setProperty("/busy", false);
            });
            var oDrill = this.byId("drillTable").getBinding("items");
            if (oDrill && !oDrill.isSuspended()) oDrill.refresh();
        },

        // ------------------------------------------------------------------
        // Drill-down to document level
        // ------------------------------------------------------------------

        onStatusBarSelect: function (oEvent) {
            var aBars = oEvent.getParameter("selectedBars") || [];
            this.byId("drillStatus").setSelectedKey(aBars.length ? aBars[0].getLabel() : "");
            this.onDrillFilter();
        },

        onDrillFilter: function () {
            var aFilters = [];
            var sStatus = this.byId("drillStatus").getSelectedKey();
            var sDept = this.byId("drillDept").getSelectedKey();
            var oRange = this.byId("drillDates");
            if (sStatus) aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
            if (sDept) aFilters.push(new Filter("department_ID", FilterOperator.EQ, sDept));
            if (oRange.getDateValue()) {
                aFilters.push(new Filter("date", FilterOperator.BT, isoDate(oRange.getDateValue()), isoDate(oRange.getSecondDateValue() || oRange.getDateValue())));
            }
            this.byId("drillTable").getBinding("items").filter(aFilters);
        },

        onDrillClear: function () {
            this.byId("drillStatus").setSelectedKey("");
            this.byId("drillDept").setSelectedKey("");
            this.byId("drillDates").setValue("");
            this.onDrillFilter();
        },

        onDrillSelect: function (oEvent) {
            var sId = oEvent.getParameter("listItem").getBindingContext().getProperty("ID");
            this.getOwnerComponent().getRouter().navTo("PRDetail", { id: encodeURIComponent(sId) });
        },

        // ------------------------------------------------------------------
        // Export
        // ------------------------------------------------------------------

        onExport: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            var oData = this.getView().getModel("an").getProperty("/data") || {};
            if (sKey === "requests") {
                csv.downloadBinding(this.byId("drillTable").getBinding("items"), "spend-analysis.csv", [
                    { label: "Request ID", path: "ID" }, { label: "Title", path: "title" },
                    { label: "Department", path: "department/name" }, { label: "Requestor", path: "requestor/name" },
                    { label: "Vendor", path: "vendor/name" }, { label: "Status", path: "status" },
                    { label: "Date", path: "date" }, { label: "Amount", path: "amount" }, { label: "Currency", path: "currency" }
                ]);
            } else if (sKey === "departments") {
                csv.download("budget-variance.csv", [
                    { label: "Department", path: "department" }, { label: "Budget", path: "budget" },
                    { label: "Committed", path: "used" }, { label: "Remaining", path: "remaining" },
                    { label: "Utilization %", path: "utilization" }
                ], oData.byDepartment || []);
            } else {
                csv.download("vendor-spend.csv", [
                    { label: "Vendor", path: "label" }, { label: "Purchase Orders", path: "count" }, { label: "Amount", path: "amount" }
                ], oData.byVendor || []);
            }
        },

        onNavBack: function () {
            if (History.getInstance().getPreviousHash() !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("Dashboard", {}, true);
            }
        }
    });
});
