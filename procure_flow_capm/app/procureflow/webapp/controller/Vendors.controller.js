sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast"
], function (Controller, MessageToast) {
    "use strict";

    return Controller.extend("procureflow.controller.Vendors", {
        onInit: function () {
        },

        onOnboardPress: function () {
            MessageToast.show("Onboard Vendor dialog simulated.");
        },

        onVendorPress: function (oEvent) {
            var sVendorName = oEvent.getSource().getBindingContext("mock").getProperty("name");
            MessageToast.show("Vendor: " + sVendorName);
        }
    });
});
