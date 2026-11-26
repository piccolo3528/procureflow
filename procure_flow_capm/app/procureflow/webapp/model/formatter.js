sap.ui.define([
    "sap/ui/core/format/DateFormat",
    "sap/ui/core/format/NumberFormat"
], function (DateFormat, NumberFormat) {
    "use strict";

    var STAGE_LABELS = { Manager: "Manager", Finance: "Finance Controller", Head: "Procurement Head" };
    var oCurrencyFormat = NumberFormat.getFloatInstance({ maxFractionDigits: 2, minFractionDigits: 0, groupingEnabled: true });
    var oShortFormat = NumberFormat.getFloatInstance({ style: "short", maxFractionDigits: 1 });

    return {
        relativeDateTime: function (vValue) {
            if (!vValue) return "";
            var oDate = vValue instanceof Date ? vValue : new Date(vValue);
            if (isNaN(oDate.getTime())) return "";
            return DateFormat.getDateTimeInstance({ relative: true }).format(oDate);
        },

        /** Purchase Request lifecycle status -> ValueState */
        prStatusState: function (sStatus) {
            switch (sStatus) {
                case "Completed":
                case "Goods Received":
                case "PO Created":
                    return "Success";
                case "Rejected":
                case "Cancelled":
                    return "Error";
                case "Draft":
                    return "None";
                case "Pending Procurement":
                case "Vendor Selected":
                case "Partially Received":
                    return "Information";
                default:
                    return "Warning"; // pending approvals, changes requested
            }
        },

        poStatusState: function (sStatus) {
            if (sStatus === "Closed") return "Success";
            if (sStatus === "Cancelled") return "Error";
            if (sStatus === "Issued") return "Information";
            return "Warning";
        },

        invoiceStatusState: function (sStatus) {
            if (sStatus === "Paid") return "Success";
            if (sStatus === "Blocked" || sStatus === "Rejected") return "Error";
            return "Warning";
        },

        matchState: function (sMatch) {
            if (sMatch === "Matched") return "Success";
            if (sMatch === "Price Variance") return "Warning";
            return "Error";
        },

        /** "Manager>Finance>Head" -> "Manager → Finance Controller → Procurement Head" */
        approvalRoute: function (sRoute) {
            if (!sRoute) return "Determined on submit";
            return sRoute.split(">").map(function (s) { return STAGE_LABELS[s] || s; }).join(" → ");
        },

        amount: function (vValue) {
            return oCurrencyFormat.format(Number(vValue || 0));
        },

        shortAmount: function (vValue) {
            return oShortFormat.format(Number(vValue || 0));
        }
    };
});
