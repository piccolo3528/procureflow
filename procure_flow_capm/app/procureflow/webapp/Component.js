sap.ui.define([
    "sap/ui/core/UIComponent",
    "procureflow/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("procureflow.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // client-side UI state (sidebar, current demo identity)
            const oUiModel = models.createUiModel();
            this.setModel(oUiModel, "ui");

            // the OData v4 model has no supported way to change its Authorization header
            // after construction, so it is built here (not declared in manifest.json) and
            // replaced wholesale whenever the demo user is switched - see switchDemoUser()
            const sServiceUrl = this.getManifestEntry("/sap.app/dataSources/mainService/uri");
            this.setModel(models.createODataModel(sServiceUrl, oUiModel.getProperty("/currentUser/id")));

            // enable routing
            this.getRouter().initialize();
        },

        /**
         * Re-authenticates as a different mocked CAP user by replacing the OData model instance,
         * then re-propagates it to every view/control bound to the component's default model.
         * @param {string} sUserId
         */
        switchDemoUser(sUserId) {
            const sServiceUrl = this.getManifestEntry("/sap.app/dataSources/mainService/uri");
            this.setModel(models.createODataModel(sServiceUrl, sUserId));
        }
    });
});
