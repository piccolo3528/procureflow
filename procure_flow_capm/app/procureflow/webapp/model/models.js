sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/v4/ODataModel",
    "sap/ui/Device"
],
function (JSONModel, ODataModel, Device) {
    "use strict";

    // Local dev/demo convenience only: these map 1:1 to the mocked CAP auth
    // users configured in procure_flow_capm/package.json (cds.requires.auth.users).
    // Switching "role" in the UI really switches which backend user the app
    // authenticates as, so every authorization/business rule check on the
    // server is enforced against a real identity, not a client-side claim.
    var DEMO_USERS = [
        { id: "U1", name: "Alex Johnson", role: "Employee", avatar: "https://placehold.co/100x100/0070F2/FFFFFF?text=AJ" },
        { id: "U2", name: "Sarah Chen", role: "Manager", avatar: "https://placehold.co/100x100/107E3E/FFFFFF?text=SC" },
        { id: "U3", name: "Mike Torres", role: "Finance", avatar: "https://placehold.co/100x100/E9730C/FFFFFF?text=MT" },
        { id: "U4", name: "Lisa Ray", role: "Procurement", avatar: "https://placehold.co/100x100/BB0000/FFFFFF?text=LR" },
        { id: "U5", name: "Amara Okafor", role: "Admin", avatar: "https://placehold.co/100x100/5B738B/FFFFFF?text=AO" }
    ];

    // Demo mode (switchable mocked users) only when running locally against `cds watch`, or when
    // forced with ?demo=true. Deployed behind the approuter, the identity comes from XSUAA instead.
    var DEMO_MODE = ["localhost", "127.0.0.1"].indexOf(window.location.hostname) !== -1 ||
        /[?&]demo=true/.test(window.location.search);

    return {
        DEMO_USERS: DEMO_USERS,
        DEMO_MODE: DEMO_MODE,

        /**
         * Provides runtime information for the device the UI5 app is running on as a JSONModel.
         * @returns {sap.ui.model.json.JSONModel} The device model.
         */
        createDeviceModel: function () {
            var oModel = new JSONModel(Device);
            oModel.setDefaultBindingMode("OneWay");
            return oModel;
        },

        /**
         * Client-side UI state only (sidebar, current demo identity) - never business data.
         * @returns {sap.ui.model.json.JSONModel} The UI state model.
         */
        createUiModel: function () {
            return new JSONModel({
                appState: {
                    sidebarExpanded: true
                },
                currentUser: DEMO_MODE ? DEMO_USERS[0] : { id: "", name: "", role: "Employee" },
                unreadCount: 0,
                demoMode: DEMO_MODE,
                demoUsers: DEMO_MODE ? DEMO_USERS : []
            });
        },

        /**
         * Creates the OData v4 model, Basic-authenticated as the given demo user (matching the
         * mocked CAP auth users - password equals the user ID for local dev only). The v4 model
         * has no supported way to change its Authorization header after construction, so
         * switching identity means constructing a fresh model instance.
         * Without a user ID (production), no Authorization header is set and the approuter's
         * session/JWT is used.
         * @param {string} sServiceUrl
         * @param {string} [sUserId]
         * @returns {sap.ui.model.odata.v4.ODataModel}
         */
        createODataModel: function (sServiceUrl, sUserId) {
            var mHeaders = sUserId ? { "Authorization": "Basic " + window.btoa(sUserId + ":" + sUserId) } : {};
            return new ODataModel({
                serviceUrl: sServiceUrl,
                synchronizationMode: "None",
                operationMode: "Server",
                autoExpandSelect: true,
                earlyRequests: false,
                groupId: "$auto",
                httpHeaders: mHeaders
            });
        }
    };

});
