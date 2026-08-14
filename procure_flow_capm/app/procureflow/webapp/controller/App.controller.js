sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast"
], function (Controller, Fragment, MessageToast) {
    "use strict";

    return Controller.extend("procureflow.controller.App", {
        onInit: function () {
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
            
            // Only route if the target exists
            if (["Dashboard", "PurchaseRequests", "Approvals", "Vendors"].indexOf(sKey) !== -1) {
                var oRouter = this.getOwnerComponent().getRouter();
                oRouter.navTo(sKey);
            } else {
                MessageToast.show(sKey + " module is under construction.");
            }
        },

        onProfilePress: function (oEvent) {
            var oButton = oEvent.getSource(),
                oView = this.getView();

            // create popover
            if (!this._pPopover) {
                this._pPopover = Fragment.load({
                    id: oView.getId(),
                    name: "procureflow.view.RoleSelectPopover",
                    controller: this
                }).then(function(oPopover) {
                    oView.addDependent(oPopover);
                    return oPopover;
                });
            }
            this._pPopover.then(function(oPopover) {
                oPopover.openBy(oButton);
            });
        },

        onRoleSelect: function (oEvent) {
            var sRole = oEvent.getParameter("listItem").getTitle();
            this.getView().getModel("ui").setProperty("/appState/currentUserRole", sRole);
            this.byId("rolePopover").close();
            
            // Re-route to dashboard to refresh data view
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        }
    });
});
