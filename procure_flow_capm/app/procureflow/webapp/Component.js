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
            if (models.DEMO_MODE) {
                this.setModel(models.createODataModel(sServiceUrl, oUiModel.getProperty("/currentUser/id")));
            } else {
                // production: real identity (XSUAA via approuter) - ask the backend who we are
                const oModel = models.createODataModel(sServiceUrl);
                this.setModel(oModel);
                const oMe = oModel.bindContext("/me(...)");
                (oMe.invoke ? oMe.invoke() : oMe.execute()).then(() => {
                    const oInfo = oMe.getBoundContext().getObject();
                    oUiModel.setProperty("/currentUser", { id: oInfo.id, name: oInfo.name, role: oInfo.role, roles: oInfo.roles });
                    this.getRouter().navTo("Dashboard", {}, true);
                });
            }

            // restore the user's theme preference (Settings > Preferences)
            try {
                const sTheme = window.localStorage.getItem("procureflow.theme");
                if (sTheme) sap.ui.require(["sap/ui/core/Theming"], (Theming) => Theming.setTheme(sTheme));
            } catch (e) { /* storage unavailable */ }

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
