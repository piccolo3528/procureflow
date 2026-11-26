sap.ui.define([], function () {
    "use strict";

    var SERVICE_NS = "ProcureFlowService";

    function run(oOperationBinding) {
        // invoke() supersedes execute() as of UI5 1.123
        return typeof oOperationBinding.invoke === "function" ? oOperationBinding.invoke() : oOperationBinding.execute();
    }

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
            return this.invokeWithResult(oContext, sAction, mParameters).then(function () {
                return oContext.refresh();
            });
        },

        /**
         * Like invoke(), but resolves with the action's return value (e.g. a generated document ID)
         * and does not refresh the context.
         * @returns {Promise<any>}
         */
        invokeWithResult: function (oContext, sAction, mParameters) {
            var oModel = oContext.getModel();
            var oActionBinding = oModel.bindContext(SERVICE_NS + "." + sAction + "(...)", oContext);
            Object.keys(mParameters || {}).forEach(function (sKey) {
                oActionBinding.setParameter(sKey, mParameters[sKey]);
            });
            return run(oActionBinding).then(function () {
                var oResult = oActionBinding.getBoundContext();
                var oValue = oResult && oResult.getObject();
                return oValue && Object.prototype.hasOwnProperty.call(oValue, "value") ? oValue.value : oValue;
            });
        },

        /**
         * Calls an unbound function or action, e.g. callOperation(oModel, "/analytics").
         * @param {sap.ui.model.odata.v4.ODataModel} oModel
         * @param {string} sPath absolute operation path without "(...)"
         * @param {object} [mParameters]
         * @returns {Promise<object>} the operation result
         */
        callOperation: function (oModel, sPath, mParameters) {
            var oBinding = oModel.bindContext(sPath + "(...)");
            Object.keys(mParameters || {}).forEach(function (sKey) {
                oBinding.setParameter(sKey, mParameters[sKey]);
            });
            return run(oBinding).then(function () {
                var oCtx = oBinding.getBoundContext();
                return oCtx ? oCtx.getObject() : null;
            });
        }
    };
});
