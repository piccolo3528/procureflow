sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, Fragment, JSONModel, Filter, FilterOperator, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("procureflow.controller.Vendors", {
        onInit: function () {
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue");
            var oBinding = this.byId("vendorGrid").getBinding("items");
            var aFilters = [];
            if (sQuery) {
                aFilters.push(new Filter([
                    new Filter("name", FilterOperator.Contains, sQuery),
                    new Filter("category", FilterOperator.Contains, sQuery)
                ], false));
            }
            oBinding.filter(aFilters);
        },

        _canManageVendors: function () {
            var sRole = this.getOwnerComponent().getModel("ui").getProperty("/currentUser/role");
            return sRole === "Procurement" || sRole === "Admin";
        },

        onOnboardPress: function () {
            if (!this._pCreateVendorDialog) {
                this._pCreateVendorDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "procureflow.view.CreateVendorDialog",
                    controller: this
                }).then(function (oDialog) {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }
            this._pCreateVendorDialog.then(function (oDialog) {
                oDialog.setModel(new JSONModel({
                    name: "", category: "", type: "", status: "Active",
                    contactPerson: "", email: "", phone: "", paymentTerms: "", taxId: "", address: ""
                }), "newVendor");
                oDialog.open();
            });
        },

        onCreateVendorConfirm: function () {
            var oDialog = this.byId("createVendorDialog");
            var oData = oDialog.getModel("newVendor").getData();
            if (!oData.name) {
                MessageToast.show("Vendor name is required.");
                return;
            }
            var sId = "V-" + Date.now().toString().slice(-6);
            var oModel = this.getOwnerComponent().getModel();
            var oListBinding = oModel.bindList("/Vendors");
            var oContext = oListBinding.create({
                ID: sId,
                name: oData.name,
                category: oData.category || null,
                type: oData.type || null,
                status: oData.status || "Active",
                contactPerson: oData.contactPerson || null,
                email: oData.email || null,
                phone: oData.phone || null,
                paymentTerms: oData.paymentTerms || null,
                taxId: oData.taxId || null,
                address: oData.address || null,
                rating: 0,
                performanceScore: 0,
                spend: 0
            });

            oContext.created().then(function () {
                MessageToast.show("Vendor " + oData.name + " onboarded.");
                oDialog.close();
                this.byId("vendorGrid").getBinding("items").refresh();
            }.bind(this)).catch(function (oError) {
                MessageBox.error("Could not create vendor: " + (oError.message || "unknown error"));
            });
        },

        onCreateVendorCancel: function () {
            this.byId("createVendorDialog").close();
        },

        onVendorPress: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext();
            var bEditable = this._canManageVendors();

            if (!this._pVendorPopover) {
                this._pVendorPopover = Fragment.load({
                    id: this.getView().getId(),
                    name: "procureflow.view.VendorDetailPopover",
                    controller: this
                }).then(function (oPopover) {
                    this.getView().addDependent(oPopover);
                    return oPopover;
                }.bind(this));
            }
            this._pVendorPopover.then(function (oPopover) {
                oPopover.setModel(new JSONModel({ editable: bEditable }), "vpop");
                oPopover.setBindingContext(oContext);
                oPopover.openBy(oSource);
            });
        }
    });
});
