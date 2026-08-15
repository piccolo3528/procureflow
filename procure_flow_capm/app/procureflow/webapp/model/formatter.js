sap.ui.define([
    "sap/ui/core/format/DateFormat"
], function (DateFormat) {
    "use strict";

    return {
        relativeDateTime: function (vValue) {
            if (!vValue) return "";
            var oDate = vValue instanceof Date ? vValue : new Date(vValue);
            if (isNaN(oDate.getTime())) return "";
            return DateFormat.getDateTimeInstance({ relative: true }).format(oDate);
        }
    };
});
