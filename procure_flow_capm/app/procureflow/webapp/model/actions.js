sap.ui.define([], function () {
    "use strict";

    var SERVICE_NS = "ProcureFlowService";

    return {
        /**
         * Invokes a bound OData V4 action on the given context and returns a promise
         * that resolves once the action has completed on the server.
         * @param {sap.ui.model.odata.v4.Context} oContext bound entity context
         * @param {string} sAction unqualified action name, e.g. "approve"
         * @param {object} [mParameters] action parameters
         * @returns {Promise<sap.ui.model.odata.v4.Context>}
         */
        invoke: function (oContext, sAction, mParameters) {
            var oModel = oContext.getModel();
            var oActionBinding = oModel.bindContext(SERVICE_NS + "." + sAction + "(...)", oContext);

            if (mParameters) {
                Object.keys(mParameters).forEach(function (sKey) {
                    oActionBinding.setParameter(sKey, mParameters[sKey]);
                });
            }

            return oActionBinding.execute().then(function () {
                return oContext.refresh();
            });
        }
    };
});
