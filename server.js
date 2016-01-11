/**
 * Created by ramy on 12/15/2015.
 */

var io = require("./io-bus");
var debug = require("debug")("io-bus");

var port = process.argv[2] || 9666;
//try{
	io(port);
//}catch(e){
//	console.log("Server Already running on port %s", port);
//	return;
//}

debug("Started io-bus server on http://localhost:%s", port);
