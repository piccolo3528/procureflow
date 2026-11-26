sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "../model/actions",
    "../model/formatter"
], function (Controller, Fragment, Filter, FilterOperator, MessageToast, actions, formatter) {
    "use strict";

    var VALID_ROUTES = ["Dashboard", "PurchaseRequests", "Approvals", "Vendors", "PurchaseOrders", "GoodsReceipts", "Invoices", "Reports", "Settings"];
    var POLL_MS = 30000;

    return Controller.extend("procureflow.controller.App", {
        formatter: formatter,

        onInit: function () {
            // the component sets the OData model right after creating the root view
            setTimeout(this._refreshUnreadCount.bind(this), 0);
            this._iPoll = setInterval(this._refreshUnreadCount.bind(this), POLL_MS);
        },

        onExit: function () {
            clearInterval(this._iPoll);
        },

        onSideNavButtonPress: function () {
            var oToolPage = this.byId("toolPage");
            var bSideExpanded = oToolPage.getSideExpanded();

            oToolPage.setSideExpanded(!bSideExpanded);
            this.getView().getModel("ui").setProperty("/appState/sidebarExpanded", !bSideExpanded);
        },

        onItemSelect: function (oEvent) {
            var oItem = oEvent.getParameter("item");
            var sKey = oItem.getKey();

            if (VALID_ROUTES.indexOf(sKey) !== -1) {
                this.getOwnerComponent().getRouter().navTo(sKey);
            } else {
                MessageToast.show(sKey + " module is under construction.");
            }
        },

        // ------------------------------------------------------------------
        // Notifications (server only returns the current user's own rows)
        // ------------------------------------------------------------------

        _refreshUnreadCount: function () {
            var oModel = this.getOwnerComponent().getModel();
            var oUi = this.getOwnerComponent().getModel("ui");
            if (!oModel) return;
            var oBinding = oModel.bindList("/Notifications", undefined, undefined,
                [new Filter("isRead", FilterOperator.EQ, false)], { $count: true });
            oBinding.requestContexts(0, 1).then(function () {
                oUi.setProperty("/unreadCount", oBinding.getCount() || 0);
            }).catch(function () { /* backend not reachable - keep last value */ });
        },

        onNotificationsPress: function (oEvent) {
            var oButton = oEvent.getSource();
            var oView = this.getView();
            if (!this._pNotifications) {
                this._pNotifications = Fragment.load({
                    id: oView.getId(),
                    name: "procureflow.view.NotificationsPopover",
                    controller: this
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }
            this._pNotifications.then(function (oPopover) {
                var oBinding = this.byId("notificationsList").getBinding("items");
                if (oBinding) oBinding.refresh();
                oPopover.openBy(oButton);
            }.bind(this));
        },

        onNotificationPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext();
            var sDoc = oCtx.getProperty("documentID") || "";
            if (!oCtx.getProperty("isRead")) {
                oCtx.setProperty("isRead", true).then(this._refreshUnreadCount.bind(this));
            }
            this.byId("notificationsPopover").close();
            var oRouter = this.getOwnerComponent().getRouter();
            if (sDoc.indexOf("PR-") === 0) {
                oRouter.navTo("PRDetail", { id: encodeURIComponent(sDoc) });
            } else if (sDoc.indexOf("INV-") === 0) {
                oRouter.navTo("Invoices");
            } else if (sDoc.indexOf("PO-") === 0) {
                oRouter.navTo("PurchaseOrders");
            }
        },

        onMarkAllRead: function () {
            var that = this;
            actions.callOperation(this.getOwnerComponent().getModel(), "/markAllNotificationsRead").then(function () {
                that.byId("notificationsList").getBinding("items").refresh();
                that._refreshUnreadCount();
            });
        },

        onCloseNotifications: function () {
            this.byId("notificationsPopover").close();
        },

        // ------------------------------------------------------------------
        // Demo identity switch
        // ------------------------------------------------------------------

        onProfilePress: function (oEvent) {
            var oButton = oEvent.getSource(),
                oView = this.getView();

            if (!this._pPopover) {
                this._pPopover = Fragment.load({
                    id: oView.getId(),
                    name: "procureflow.view.RoleSelectPopover",
                    controller: this
                }).then(function (oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }
            this._pPopover.then(function (oPopover) {
                oPopover.openBy(oButton);
            });
        },

        onRoleSelect: function (oEvent) {
            var oListItem = oEvent.getParameter("listItem");
            var oContext = oListItem.getBindingContext("ui");
            var oUser = oContext.getObject();

            var oUiModel = this.getView().getModel("ui");
            oUiModel.setProperty("/currentUser", oUser);

            // switching "role" re-authenticates the OData model as a different mocked CAP user
            this.getOwnerComponent().switchDemoUser(oUser.id);
            this._refreshUnreadCount();

            this.byId("rolePopover").close();
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        }
    });
});
