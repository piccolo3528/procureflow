sap.ui.define([
    "sap/m/MessageToast"
], function (MessageToast) {
    "use strict";

    function resolve(oRow, sPath) {
        return sPath.split("/").reduce(function (o, k) { return o == null ? o : o[k]; }, oRow);
    }

    function escape(v) {
        if (v == null) return "";
        var s = String(v);
        // guard against CSV/formula injection when opened in Excel
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        return /[",;\n\r]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
    }

    return {
        /**
         * Downloads rows as a CSV file (Excel-compatible, UTF-8 with BOM).
         * @param {string} sFileName e.g. "purchase-requests.csv"
         * @param {Array<{label:string,path:string}>} aColumns
         * @param {object[]} aRows plain objects; paths may use "a/b" navigation
         */
        download: function (sFileName, aColumns, aRows) {
            var aLines = [aColumns.map(function (c) { return escape(c.label); }).join(",")];
            aRows.forEach(function (oRow) {
                aLines.push(aColumns.map(function (c) { return escape(resolve(oRow, c.path)); }).join(","));
            });
            var oBlob = new Blob(["﻿" + aLines.join("\r\n")], { type: "text/csv;charset=utf-8" });
            var sUrl = URL.createObjectURL(oBlob);
            var oLink = document.createElement("a");
            oLink.href = sUrl;
            oLink.download = sFileName;
            document.body.appendChild(oLink);
            oLink.click();
            document.body.removeChild(oLink);
            setTimeout(function () { URL.revokeObjectURL(sUrl); }, 1000);
            MessageToast.show(aRows.length + " rows exported to " + sFileName);
        },

        /**
         * Exports everything an OData V4 list binding currently matches (respecting its filters/sorters).
         * @param {sap.ui.model.odata.v4.ODataListBinding} oBinding
         */
        downloadBinding: function (oBinding, sFileName, aColumns) {
            var that = this;
            return oBinding.requestContexts(0, 5000).then(function (aContexts) {
                that.download(sFileName, aColumns, aContexts.map(function (c) { return c.getObject(); }));
            });
        }
    };
});
