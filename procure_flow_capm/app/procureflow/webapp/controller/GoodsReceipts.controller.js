sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/routing/History",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "../model/actions"
], function (Controller, Filter, FilterOperator, JSONModel, History, MessageToast, MessageBox, actions) {
    "use strict";

    return Controller.extend("procureflow.controller.GoodsReceipts", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("GoodsReceipts").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oList = this.byId("poList");
            var oBinding = oList.getBinding("items");
            if (oBinding) {
                var oFilter = new Filter([
                    new Filter("status", FilterOperator.EQ, "Issued"),
                    new Filter("status", FilterOperator.EQ, "Partially Received")
                ], false);
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
            var oContext = oItem.getBindingContext();
            this._oSelectedPOContext = oContext;

            var oDetailBox = this.byId("detailBox");
            var oPO = oContext.getObject();

            var oItemsBinding = this.getOwnerComponent().getModel().bindList(oContext.getPath() + "/items");
            oItemsBinding.requestContexts(0, 100).then(function (aContexts) {
                var aItems = aContexts.map(function (c) {
                    var o = c.getObject();
                    var iRemaining = Number(o.qty) - Number(o.qtyReceived || 0);
                    return {
                        ID: o.ID,
                        description: o.description,
                        qtyOrdered: o.qty,
                        alreadyReceived: o.qtyReceived || 0,
                        remaining: iRemaining,
                        qtyReceivedNow: 0,
                        qtyRejectedNow: 0,
                        inspectionResult: "Good"
                    };
                });

                var oRecvModel = new JSONModel({
                    poId: oPO.ID,
                    vendorName: oPO.vendor ? oPO.vendor.name : "",
                    amount: oPO.amount,
                    currency: oPO.currency,
                    location: "",
                    notes: "",
                    items: aItems
                });
                oDetailBox.setModel(oRecvModel, "recv");
                oDetailBox.setVisible(true);
            });
        },

        onPostGR: function () {
            if (!this._oSelectedPOContext) {
                MessageToast.show("Please select a Purchase Order first.");
                return;
            }
            var oRecvModel = this.byId("detailBox").getModel("recv");
            var oData = oRecvModel.getData();
            var aLines = oData.items.filter(function (it) {
                return Number(it.qtyReceivedNow) > 0 || Number(it.qtyRejectedNow) > 0;
            }).map(function (it) {
                return {
                    orderItem: it.ID,
                    qtyReceived: Number(it.qtyReceivedNow) || 0,
                    qtyRejected: Number(it.qtyRejectedNow) || 0,
                    inspectionResult: it.inspectionResult,
                    damageInfo: it.inspectionResult === "Damaged" ? "Reported at receiving." : null,
                    remarks: null
                };
            });

            if (!aLines.length) {
                MessageToast.show("Enter a received or rejected quantity for at least one item.");
                return;
            }

            var that = this;
            actions.invoke(this._oSelectedPOContext, "recordGoodsReceipt", {
                location: oData.location || null,
                notes: oData.notes || null,
                items: aLines
            }).then(function () {
                MessageToast.show("Goods Receipt posted successfully.");
                that.byId("poList").getBinding("items").refresh();
                that.byId("detailBox").setVisible(false);
                that.byId("poList").removeSelections(true);
                that._oSelectedPOContext = null;
            }).catch(function (oError) {
                MessageBox.error(oError.message || "Could not post Goods Receipt.");
            });
        }
    });
});
