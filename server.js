#!/usr/bin/env node

/**
 * Created by ramy on 12/15/2015.
 * Last update: 6/5/2019
 */

var fs = require("fs");
var path = require("path");

console.log("Connecting to port 9666...");

require("./io-bus")(9666)
	.injectJS(fs.readFileSync(path.resolve("ccontainer_apis.js"), "utf8"))
	.connect("BackendServices", function(msgBus) {
		console.log("*** io-bus is now routing messages on port 9666 ***");
		console.log(
			"Utilize MsgBus(.publish|.on|.off|.once|.request)",
			"\nand communicator(.publish|.subscribe|.unsubscribe|.invoke)",
			"\nthrough http://{this-host}:9666/io-bus/web-client.js"
		);
		console.log("Press Ctrl+c to terminate it.");
	});
