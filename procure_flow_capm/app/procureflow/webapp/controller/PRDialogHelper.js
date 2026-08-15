sap.ui.define([
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "../model/actions"
], function (Fragment, JSONModel, MessageToast, MessageBox, actions) {
    "use strict";

    function getDialog(oController) {
        var oView = oController.getView();
        if (!oController._pCreatePRDialog) {
            oController._pCreatePRDialog = Fragment.load({
                id: oView.getId(),
                name: "procureflow.view.CreatePRDialog",
                controller: oController
            }).then(function (oDialog) {
                oView.addDependent(oDialog);
                return oDialog;
            });
        }
        return oController._pCreatePRDialog;
    }

    function newItem() {
        return { description: "", category: "", unit: "EA", qty: 1, price: 0 };
    }

    function buildPayload(oNewPRData) {
        var sYear = new Date().getFullYear();
        var sID = "PR-" + sYear + "-" + Date.now().toString().slice(-6);
        var aItems = (oNewPRData.items || []).map(function (oItem, i) {
            return {
                ID: sID + "-I" + (i + 1),
                description: oItem.description,
                category: oItem.category || null,
                unit: oItem.unit || "EA",
                qty: parseInt(oItem.qty, 10) || 0,
                price: parseFloat(oItem.price) || 0
            };
        });
        return {
            ID: sID,
            title: oNewPRData.title || "New Request",
            priority: oNewPRData.priority || "Normal",
            requiredDate: oNewPRData.requiredDate || null,
            justification: oNewPRData.justification || "",
            items: aItems
        };
    }

    return {
        open: function (oController) {
            getDialog(oController).then(function (oDialog) {
                var oNewPRModel = new JSONModel({
                    title: "",
                    priority: "Normal",
                    requiredDate: null,
                    justification: "",
                    items: [newItem()]
                });
                oDialog.setModel(oNewPRModel, "newPR");
                oDialog.open();
            });
        },

        addItem: function (oController) {
            getDialog(oController).then(function (oDialog) {
                var oModel = oDialog.getModel("newPR");
                var aItems = oModel.getProperty("/items") || [];
                aItems.push(newItem());
                oModel.setProperty("/items", aItems);
            });
        },

        deleteItem: function (oEvent) {
            var oItem = oEvent.getSource().getParent();
            var oContext = oItem.getBindingContext("newPR");
            var sPath = oContext.getPath();
            var iIndex = parseInt(sPath.substring(sPath.lastIndexOf("/") + 1), 10);
            var oModel = oContext.getModel();
            var aItems = oModel.getProperty("/items");
            aItems.splice(iIndex, 1);
            oModel.setProperty("/items", aItems);
        },

        close: function (oController) {
            getDialog(oController).then(function (oDialog) {
                oDialog.close();
            });
        },

        saveDraft: function (oController) {
            getDialog(oController).then(function (oDialog) {
                var oNewPRData = oDialog.getModel("newPR").getData();
                if (!oNewPRData.title) {
                    MessageToast.show("Please enter a title before saving.");
                    return;
                }
                var oModel = oController.getOwnerComponent().getModel();
                var oListBinding = oModel.bindList("/PurchaseRequests");
                var oContext = oListBinding.create(buildPayload(oNewPRData));

                oContext.created().then(function () {
                    MessageToast.show("Draft " + oContext.getProperty("ID") + " saved.");
                    oDialog.close();
                    if (oController.onRequestCreated) {
                        oController.onRequestCreated();
                    }
                }).catch(function (oError) {
                    MessageBox.error("Could not save draft: " + (oError.message || "unknown error"));
                });
            });
        },

        submit: function (oController) {
            getDialog(oController).then(function (oDialog) {
                var oNewPRData = oDialog.getModel("newPR").getData();
                if (!oNewPRData.title || !oNewPRData.justification) {
                    MessageToast.show("Title and business justification are required.");
                    return;
                }
                if (!oNewPRData.items || !oNewPRData.items.length || !oNewPRData.items[0].description) {
                    MessageToast.show("At least one line item is required.");
                    return;
                }
                var oModel = oController.getOwnerComponent().getModel();
                var oListBinding = oModel.bindList("/PurchaseRequests");
                var oContext = oListBinding.create(buildPayload(oNewPRData));

                oContext.created().then(function () {
                    var sID = oContext.getProperty("ID");
                    return actions.invoke(oContext, "submit").then(function () {
                        MessageToast.show("Purchase Request " + sID + " submitted successfully.");
                        oDialog.close();
                        if (oController.onRequestCreated) {
                            oController.onRequestCreated();
                        }
                    });
                }).catch(function (oError) {
                    MessageBox.error("Could not submit request: " + (oError.message || "unknown error"));
                });
            });
        }
    };
});
