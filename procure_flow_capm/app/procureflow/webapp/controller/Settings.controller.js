sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History",
    "sap/ui/core/Theming",
    "sap/ui/core/Messaging",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, History, Theming, Messaging, MessageToast, MessageBox) {
    "use strict";

    // all edits on this page are collected in one deferred batch group and sent on "Save"
    var GROUP = "admin";
    var THEME_KEY = "procureflow.theme";

    return Controller.extend("procureflow.controller.Settings", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("Settings").attachPatternMatched(this._onRouteMatched, this);
            try {
                var sTheme = window.localStorage.getItem(THEME_KEY);
                if (sTheme) this.byId("themeSelect").setSelectedKey(sTheme);
            } catch (e) { /* storage unavailable */ }
        },

        _onRouteMatched: function () {
            this.getView().bindElement({
                path: "/Settings('default')",
                parameters: { $$updateGroupId: GROUP }
            });
            ["deptTable", "usersTable"].forEach(function (sId) {
                var oBinding = this.byId(sId).getBinding("items");
                if (oBinding) oBinding.refresh();
            }, this);
        },

        onSave: function () {
            var oModel = this.getView().getModel();
            if (!oModel.hasPendingChanges(GROUP)) {
                MessageToast.show("No changes to save.");
                return;
            }
            Messaging.removeAllMessages();
            var that = this;
            oModel.submitBatch(GROUP).then(function () {
                var aErrors = Messaging.getMessageModel().getData()
                    .filter(function (m) { return m.getType() === "Error"; })
                    .map(function (m) { return m.getMessage(); });
                if (aErrors.length || oModel.hasPendingChanges(GROUP)) {
                    MessageBox.error("Some changes were rejected:\n\n" + (aErrors.join("\n") || "Unknown error"));
                    // re-read so the form shows what the server actually stored
                    oModel.resetChanges(GROUP);
                    that._onRouteMatched();
                } else {
                    MessageToast.show("Settings saved.");
                }
            });
        },

        onDiscard: function () {
            this.getView().getModel().resetChanges(GROUP);
            MessageToast.show("Changes discarded.");
        },

        onThemeChange: function (oEvent) {
            var sTheme = oEvent.getParameter("selectedItem").getKey();
            Theming.setTheme(sTheme);
            try { window.localStorage.setItem(THEME_KEY, sTheme); } catch (e) { /* ignore */ }
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
