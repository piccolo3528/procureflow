/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["procureflow/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
