/**
 * Created by Ramy Eldesoky on 8/14/2015.
 */
var socket_io = require('socket.io');
var mb_server = require("./message_bus");
var Promise = require("js-promise");
var request_handlers = {};
var subscribers = {};
var client_version = "1.0.3";
module.exports = function(param,express_app){
	var io,server;
	if(param == undefined){
		param = 9666;
	}
	io = socket_io(param,{serveClient:false});// start web sockets server
	server = io.httpServer;

	if(express_app){
		express_app.use("/io-bus/web-client.js",function(req,res,next){
			serveClient(req,res);
		});
        express_app.use(require('connect-inject')({
            snippet:'<script src="/io-bus/web-client.js"></script>'
        }));
	}
	else {
		server.on("request", function (req, res) {
			console.log("Request " + req.url);
			if (req.url == "/io-bus/web-client.js") {
				serveClient(res);
			} else if (typeof param == "number") {
				res.writeHead(404);
				res.end();
			}
		});
	}

	function serveClient(req,res){
		var etag = req.headers['if-none-match'];
		if (etag) {
			if (client_version == etag) {
				res.writeHead(304);
				res.end();
				return;
			}
		}
		var read = require('fs').readFileSync;
		res.setHeader('Content-Type', 'application/javascript');
		res.setHeader('ETag', client_version);
		res.writeHead(200);
		var scriptContent =read(require.resolve("./resources/socket.io.js"), 'utf-8') +
			read(require.resolve("./resources/js-promise.js"), 'utf-8') +
			read(require.resolve("./web-client.js"), 'utf-8');
		res.end(scriptContent);

	}

	io.on("connect",function(socket){// client connection

		// authorization should be added before
		console.log("io: A client has connected to socket.io");
		var socket_owner, msg_bus;

		socket.on("mb_connect",function(auth){// mb_connect should be { app_id:<app_id>, client_id:<client_id> }

			if(!auth){
				return;
			}
			socket_owner = auth.client_id;
			msg_bus = mb_server.connect(socket_owner);
			console.log("io: Client (" + socket_owner + ") connected to Message Bus via:" + JSON.stringify(auth));

			socket.on("mb_send",function(payload){// payload should be in the form {topic:"<topic>", msg:{},to:"<optional>"}
				console.log("io: Received mb_send from(" + socket_owner + "), payload(" + JSON.stringify(payload) + ")");
				msg_bus.send(payload.topic, payload.msg, payload.to);
			});
			socket.on("mb_request",function(request){// request should be in the form {topic:"<topic>", callback:"<unique_id>",query:{},to:"<optional>",timeout:<optional>}
				console.log("io: Received mb_request from(" + socket_owner + "), request(" + JSON.stringify(request) + ")");
				msg_bus.request(request.api, request.query, request.timeout, request.to).then(function(response){
					response.topic = request.api + "_response";
					socket.emit(request.callback || "mb_response", response);// response would be sent back to msg.callback
				}, function(err){
					socket.emit(request.callback || "mb_response", {error:err});// response would be sent back to socket with id = msg.callback
				});
			});
			socket.on("mb_subscribe",function(payload){// payload should be {callback:"<unique_id>",topic:"<topic>",from:"<optional>"}
				console.log( "io: Received mb_subscribe from(" + socket_owner + "), payload(" + JSON.stringify(payload) + ")" );
				subscribers[payload.callback] = msg_bus.on(payload.topic, function(msg){
					socket.emit(payload.callback || "mb_broadcast", msg)
				}, payload.from)
			});
			socket.on("mb_unsubscribe",function(payload){// payload should be {callback:"<unique_id>""}
				msg_bus.off(subscribers[payload.callback]);
			});
			socket.on("mb_add_request_handler",function(request_handler){//request_handler format {api:<api>, callback:<unique_id>,limit_from:<optional>}

				console.log( "io: IoRegRouter received mb_add_request_handler from(" + socket_owner + "), handler_info(" + JSON.stringify(request_handler) + ")" );

				request_handlers[request_handler.callback] = msg_bus.addRequestHandler(request_handler.api, function(query, from){//request format {topic:<topic>, query:{..},callback:<unique_id>}
					console.log( "io: IoRegRouter received Request from(" + from + "), query(" + JSON.stringify(query) + ")" );
					var callback = mb_server.uuid();
					var ret = new Promise();
					// wait for socket response
					socket.once(callback, function (response) {
						console.log( "io: IoReqRouter received a response from(" + socket_owner + "), payload(" + JSON.stringify(payload) + ")" );
						ret.resolve(response);
					});
					// send request to socket
					var payload = {api:request_handler.api, query:query, from: from, callback: callback};
					console.log( "io: IoReqRouter Emits request to (" + socket_owner + ":" + request_handler.callback + "), payload(" + JSON.stringify(payload) + ")" );
					socket.emit(request_handler.callback, payload);
					return ret;

				}, request_handler.limit_from);
			});

			socket.on("mb_remove_request_handler",function(params){//params format {id:<socket_callback_uuid>}
				msg_bus.off(request_handlers[params.id]);
				delete(request_handlers[params.id]);
			});

		});
		socket.on("disconnect",function(){
			if(msg_bus && socket_owner){
				msg_bus.disconnect();
			}
		})
	});

	return mb_server;
};
