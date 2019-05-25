#!/usr/bin/env node

/**
 * Created by ramy on 12/15/2015.
 * Last update: 5/23/2019
 */

console.log("Connecting to port 9666...");

require("./io-bus")(9666).connect("BackendServices", function(msgBus) {
	console.log("*** io-bus is now routing messages on port 9666 ***");
	console.log(
		"Utilize MsgBus(.publish|.on|.off|.once|.request)",
		"through http://{this-host}:9666/io-bus/web-client.js"
	);
	console.log("Press Ctrl+c to terminate it.");
});
