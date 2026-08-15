sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "../model/actions",
    "../model/formatter"
], function (Controller, History, Fragment, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, actions, formatter) {
    "use strict";

    var DRAFT_LIKE = ["Draft", "Changes Requested"];
    var CANCELLABLE = ["Draft", "Pending Manager Approval", "Pending Finance Approval", "Changes Requested"];

    return Controller.extend("procureflow.controller.PRDetail", {
        formatter: formatter,

        onInit: function () {
            this._pageState = new JSONModel({
                canEditItems: false, canSubmit: false, canDelete: false, canCancel: false,
                canApprove: false, canReject: false, canRequestChanges: false,
                canSelectVendor: false, canGeneratePO: false
            });
            this.getView().setModel(this._pageState, "pageState");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("PRDetail").attachPatternMatched(this._onObjectMatched, this);
        },

        _onObjectMatched: function (oEvent) {
            var sId = decodeURIComponent(oEvent.getParameter("arguments").id);
            this.getView().bindElement({
                path: "/PurchaseRequests('" + sId + "')",
                events: { dataReceived: this._syncPageState.bind(this) }
            });
        },

        _syncPageState: function () {
            var oContext = this.getView().getBindingContext();
            if (!oContext) return Promise.resolve();
            return oContext.requestObject().then(function (oData) {
                if (!oData) return;
                var oUser = this.getOwnerComponent().getModel("ui").getProperty("/currentUser");
                var bIsRequestor = oData.requestor_ID === oUser.id;
                var bDraftLike = DRAFT_LIKE.indexOf(oData.status) !== -1;
                var bManagerStage = oData.status === "Pending Manager Approval" && (oUser.role === "Manager" || oUser.role === "Admin");
                var bFinanceStage = oData.status === "Pending Finance Approval" && (oUser.role === "Finance" || oUser.role === "Admin");
                var bCanAct = (bManagerStage || bFinanceStage) && !bIsRequestor;

                this._pageState.setData({
                    canEditItems: bIsRequestor && bDraftLike,
                    canSubmit: bIsRequestor && bDraftLike,
                    canDelete: bIsRequestor && oData.status === "Draft",
                    canCancel: bIsRequestor && CANCELLABLE.indexOf(oData.status) !== -1,
                    canApprove: bCanAct,
                    canReject: bCanAct,
                    canRequestChanges: bCanAct,
                    canSelectVendor: oData.status === "Pending Procurement" && (oUser.role === "Procurement" || oUser.role === "Admin"),
                    canGeneratePO: oData.status === "Vendor Selected" && (oUser.role === "Procurement" || oUser.role === "Admin")
                });
            }.bind(this));
        },

        onNavBack: function () {
            var oHistory = History.getInstance();
            var sPreviousHash = oHistory.getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("PurchaseRequests", {}, true);
            }
        },

        onNavToDashboard: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard", {}, true);
        },

        _handleActionError: function (oError) {
            if (oError && oError.message === "cancelled") return;
            MessageBox.error((oError && oError.message) || "Something went wrong.");
        },

        // ---------------------------------------------------------------
        // Item editing (inline, only while canEditItems)
        // ---------------------------------------------------------------

        onAddItemRowPress: function () {
            var oContext = this.getView().getBindingContext();
            var oTable = this.byId("itemsTable");
            var oBinding = oTable.getBinding("items");
            var sId = oContext.getProperty("ID") + "-I" + Date.now().toString().slice(-6);
            oBinding.create({ ID: sId, description: "", category: "", unit: "EA", qty: 1, price: 0 });
        },

        onDeleteItemRowPress: function (oEvent) {
            var oItemContext = oEvent.getSource().getBindingContext();
            MessageBox.confirm("Remove this line item?", {
                onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        oItemContext.delete().catch(function (oErr) {
                            MessageBox.error(oErr.message || "Could not remove item.");
                        });
                    }
                }
            });
        },

        // ---------------------------------------------------------------
        // Comments
        // ---------------------------------------------------------------

        onPostComment: function () {
            var oInput = this.byId("newCommentText");
            var sText = oInput.getValue();
            if (!sText) {
                MessageToast.show("Enter a comment first.");
                return;
            }
            var oContext = this.getView().getBindingContext();
            actions.invoke(oContext, "addComment", { text: sText }).then(function () {
                oInput.setValue("");
                var oBinding = this.byId("commentsList").getBinding("items");
                if (oBinding) oBinding.refresh();
            }.bind(this)).catch(this._handleActionError.bind(this));
        },

        // ---------------------------------------------------------------
        // Workflow actions
        // ---------------------------------------------------------------

        onSubmitPress: function () {
            var oContext = this.getView().getBindingContext();
            var that = this;
            MessageBox.confirm("Submit this request for manager approval?", {
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) return;
                    actions.invoke(oContext, "submit")
                        .then(function () { MessageToast.show("Request submitted."); return that._syncPageState(); })
                        .catch(that._handleActionError.bind(that));
                }
            });
        },

        onDeletePress: function () {
            var oContext = this.getView().getBindingContext();
            var that = this;
            MessageBox.confirm("Delete this draft? This cannot be undone.", {
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) return;
                    oContext.delete().then(function () {
                        MessageToast.show("Draft deleted.");
                        that.onNavBack();
                    }).catch(function (oErr) {
                        MessageBox.error(oErr.message || "Could not delete draft.");
                    });
                }
            });
        },

        _getActionDialog: function () {
            if (!this._pActionDialog) {
                this._pActionDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "procureflow.view.ActionDialog",
                    controller: this
                }).then(function (oDialog) {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }
            return this._pActionDialog;
        },

        _promptComment: function (sTitle, sMessage, sPlaceholder, sConfirmText, bMandatory) {
            return this._getActionDialog().then(function (oDialog) {
                var oModel = new JSONModel({ title: sTitle, message: sMessage, placeholder: sPlaceholder, confirmText: sConfirmText, comment: "" });
                oDialog.setModel(oModel, "actionDlg");
                return new Promise(function (resolve, reject) {
                    this._actionDialogBusy = { resolve: resolve, reject: reject, mandatory: bMandatory, model: oModel, dialog: oDialog };
                    oDialog.open();
                }.bind(this));
            }.bind(this));
        },

        onActionDialogConfirm: function () {
            var oCtx = this._actionDialogBusy;
            var sComment = (oCtx.model.getProperty("/comment") || "").trim();
            if (oCtx.mandatory && !sComment) {
                MessageToast.show("Please provide a reason/comment.");
                return;
            }
            oCtx.dialog.close();
            oCtx.resolve(sComment);
        },

        onActionDialogCancel: function () {
            var oCtx = this._actionDialogBusy;
            oCtx.dialog.close();
            oCtx.reject(new Error("cancelled"));
        },

        onApprovePress: function () {
            var oContext = this.getView().getBindingContext();
            var that = this;
            this._promptComment("Approve Request", "Add an optional comment for this approval.", "Comment (optional)", "Approve", false)
                .then(function (sComment) { return actions.invoke(oContext, "approve", { comment: sComment || null }); })
                .then(function () { MessageToast.show("Request approved."); return that._syncPageState(); })
                .catch(that._handleActionError.bind(that));
        },

        onRejectPress: function () {
            var oContext = this.getView().getBindingContext();
            var that = this;
            this._promptComment("Reject Request", "Please provide a reason for rejecting this request.", "Reason (required)", "Reject", true)
                .then(function (sReason) { return actions.invoke(oContext, "rejectRequest", { reason: sReason }); })
                .then(function () { MessageToast.show("Request rejected."); return that._syncPageState(); })
                .catch(that._handleActionError.bind(that));
        },

        onRequestChangesPress: function () {
            var oContext = this.getView().getBindingContext();
            var that = this;
            this._promptComment("Request Changes", "Explain what needs to change before this can be approved.", "Comment (required)", "Request Changes", true)
                .then(function (sComment) { return actions.invoke(oContext, "requestChanges", { comment: sComment }); })
                .then(function () { MessageToast.show("Changes requested."); return that._syncPageState(); })
                .catch(that._handleActionError.bind(that));
        },

        onCancelPress: function () {
            var oContext = this.getView().getBindingContext();
            var that = this;
            this._promptComment("Cancel Request", "Please provide a cancellation reason.", "Reason (required)", "Cancel Request", true)
                .then(function (sReason) { return actions.invoke(oContext, "cancel", { reason: sReason }); })
                .then(function () { MessageToast.show("Request cancelled."); return that._syncPageState(); })
                .catch(that._handleActionError.bind(that));
        },

        _getSelectVendorDialog: function () {
            if (!this._pSelectVendorDialog) {
                this._pSelectVendorDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "procureflow.view.SelectVendorDialog",
                    controller: this
                }).then(function (oDialog) {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }
            return this._pSelectVendorDialog;
        },

        onSelectVendorPress: function () {
            var oContext = this.getView().getBindingContext();
            var that = this;
            var oODataModel = this.getOwnerComponent().getModel();
            var oListBinding = oODataModel.bindList("/Vendors", undefined, undefined, new Filter("status", FilterOperator.EQ, "Active"));

            oListBinding.requestContexts(0, 200).then(function (aContexts) {
                var aVendors = aContexts.map(function (c) { return c.getObject(); });
                if (!aVendors.length) {
                    MessageToast.show("No active vendors available.");
                    return null;
                }
                return that._getSelectVendorDialog().then(function (oDialog) {
                    var oModel = new JSONModel({ vendors: aVendors, vendorId: aVendors[0].ID, reason: "" });
                    oDialog.setModel(oModel, "vsel");
                    return new Promise(function (resolve, reject) {
                        that._vendorDialogBusy = { resolve: resolve, reject: reject };
                        that._vendorDialogModel = oModel;
                        oDialog.open();
                    });
                });
            }).then(function (oResult) {
                if (!oResult) return;
                return actions.invoke(oContext, "selectVendor", { vendor: oResult.vendorId, reason: oResult.reason || null });
            }).then(function () {
                MessageToast.show("Vendor selected.");
                return that._syncPageState();
            }).catch(that._handleActionError.bind(that));
        },

        onSelectVendorConfirm: function () {
            var mData = this._vendorDialogModel.getData();
            this.byId("selectVendorDialog").close();
            this._vendorDialogBusy.resolve(mData);
        },

        onSelectVendorCancel: function () {
            this.byId("selectVendorDialog").close();
            this._vendorDialogBusy.reject(new Error("cancelled"));
        },

        onGeneratePOPress: function () {
            var oContext = this.getView().getBindingContext();
            var that = this;
            MessageBox.confirm("Generate a Purchase Order for the selected vendor?", {
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) return;
                    actions.invoke(oContext, "generatePO")
                        .then(function () { MessageToast.show("Purchase Order generated."); return that._syncPageState(); })
                        .catch(that._handleActionError.bind(that));
                }
            });
        }
    });
});
