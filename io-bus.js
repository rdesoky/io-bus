/**
 * Created by Ramy Eldesoky on 8/14/2015.
 */
var socket_io = require('socket.io');
var socket_io_client = require("socket.io-client");
var mb_server = require("./message_bus");
var Promise = require("js-promise");
var request_handlers = {};
var subscribers = {};
var client_version = "1.0.3";
var debug = require("debug")("io-bus");
var connect_inject = require('connect-inject');

module.exports = function(server,express_app){
	var ret = new Promise();

	if(server == undefined){
		server = 9666;
	}
	var io, httpServer;

	if(typeof server == "number"){
		httpServer = require("http").Server(httpServerHandler);
		httpServer.listen(server);
		io = new socket_io(httpServer);
		httpServer.on('error',function(msg){
			if(msg.code == 'EADDRINUSE') {
				console.log("Another server is running on the same port");
				debug("Server failure.. stopping");
				// connect to that server
				io = socket_io_client("http://localhost:" + server);
				io.on("connect",function(){
					debug("Successfully connected to the other server");
					connectAsClient(io);
				});
			}
		});
	}else{
		io = new socket_io(server);// attach to existing server
		if(express_app){
			express_app.use("/io-bus/web-client.js",function(req,res,next){
				serveClient(req,res);
			});
			express_app.use(connect_inject({
				snippet:'<script src="/io-bus/web-client.js"></script>'
			}));
		}else{
			server.on("request",httpServerHandler);
		}
	}

	function httpServerHandler(req,res){
		if (req.url == "/io-bus/web-client.js") {
			debug("Requested " + req.url);
			serveClient(req, res, "http://localhost:" + server);// pass url to pass to client connection
		}else {
			res.writeHead(404);
			res.end();
		}
	}

	httpServer = io.httpServer;

	function serveClient(req,res,url){
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
		var webClient = read(require.resolve("./web-client.js"), 'utf-8');
		if(url){//replace io(/*{host}*/) if not served by express app
			webClient = webClient.replace("/*{host}*/",'"' + url + '"');
		}
		var scriptContent =read(require.resolve("./resources/socket.io.js"), 'utf-8') +
			read(require.resolve("./resources/js-promise.js"), 'utf-8') +
			webClient;
		res.end(scriptContent);

	}

	io.on("connect", connectAsHost);

	function connectAsHost(socket){// client connection

		// authorization should be added before
		debug("io: A client has connected to socket.io");
		var socket_owner, msg_bus;

		socket.on("mb_connect",function(auth){// mb_connect should be { app_id:<app_id>, client_id:<client_id> }

			if(!auth){
				return;
			}
			socket_owner = auth.client_id;
			mb_server.connect(socket_owner,function(mb){
				msg_bus = mb;
			});
			debug("io: Client (" + socket_owner + ") connected to Message Bus via:" + JSON.stringify(auth));

			socket.on("mb_send",function(payload){// payload should be in the form {topic:"<topic>", msg:{},to:"<optional>"}
				debug("io: Received mb_send from(" + socket_owner + "), payload(" + JSON.stringify(payload) + ")");
				if(!msg_bus) {
					return;
				}
				msg_bus.send(payload.topic, payload.msg, payload.to);
			});
			socket.on("mb_request",function(request){// request should be in the form {topic:"<topic>", callback:"<unique_id>",query:{},to:"<optional>",timeout:<optional>}
				debug("io: Received mb_request from(" + socket_owner + "), request(" + JSON.stringify(request) + ")");
				if(!msg_bus) {
					return;
				}
				msg_bus.request(request.api, request.query, request.timeout, request.to).then(function(response){
					response.topic = request.api + "_response";
					socket.emit(request.callback || "mb_response", response);// response would be sent back to msg.callback
				}, function(err){
					socket.emit(request.callback || "mb_response", {error:err});// response would be sent back to socket with id = msg.callback
				});
			});
			socket.on("mb_subscribe",function(payload){// payload should be {callback:"<unique_id>",topic:"<topic>",from:"<optional>"}
				debug( "io: Received mb_subscribe from(" + socket_owner + "), payload(" + JSON.stringify(payload) + ")" );
				if(!msg_bus) {
					return;
				}
				subscribers[payload.callback] = msg_bus.on(payload.topic, function(msg){
					socket.emit(payload.callback || "mb_broadcast", msg)
				}, payload.from)
			});
			socket.on("mb_unsubscribe",function(payload){// payload should be {callback:"<unique_id>""}
				if(!msg_bus) {
					return;
				}
				msg_bus.off(subscribers[payload.callback]);
			});
			socket.on("mb_add_request_handler",function(request_handler){//request_handler format {api:<api>, callback:<unique_id>,limit_from:<optional>}

				debug( "io: IoRegRouter received mb_add_request_handler from(" + socket_owner + "), handler_info(" + JSON.stringify(request_handler) + ")" );

				if(!msg_bus) {
					return;
				}

				request_handlers[request_handler.callback] = msg_bus.addRequestHandler(request_handler.api, function(query, from){//request format {topic:<topic>, query:{..},callback:<unique_id>}
					debug( "io: IoRegRouter received Request from(" + from + "), query(" + JSON.stringify(query) + ")" );
					var callback = mb_server.uuid();
					var ret = new Promise();
					// wait for socket response
					socket.once(callback, function (response) {
						debug( "io: IoReqRouter received a response from(" + socket_owner + "), payload(" + JSON.stringify(response) + ")" );
						ret.resolve(response);
					});
					// send request to socket
					var payload = {api:request_handler.api, query:query, from: from, callback: callback};
					debug( "io: IoReqRouter Emits request to (" + socket_owner + ":" + request_handler.callback + "), payload(" + JSON.stringify(payload) + ")" );
					socket.emit(request_handler.callback, payload);
					return ret;

				}, request_handler.limit_from);
			});

			socket.on("mb_remove_request_handler",function(params){//params format {id:<socket_callback_uuid>}
				if(!msg_bus) {
					return;
				}
				msg_bus.off(request_handlers[params.id]);
				delete(request_handlers[params.id]);
			});

		});
		socket.on("disconnect",function(){
			if(msg_bus && socket_owner){
				msg_bus.disconnect();
			}
		});

		ret.resolve(mb_server);
	}

	function connectAsClient(socket){
		var isConnected = true;

		socket.on("disconnect",function(){
			isConnected = false;
		});

		socket.on("connected",function(){
			isConnected = true;
		});

		function create_uuid(){
			return mb_server.uuid();
		}

		ret.resolve({
			uuid:mb_server.uuid,

			connect:function(my_id, callback){
				if(!my_id){
					my_id = this.uuid();
				}

				socket.emit("mb_connect",{client_id:my_id});

				callback(			{
					is_connected:function(){
						return isConnected;
					},
					publish:function(topic, msg, to){
						if(!isConnected){
							return false;
						}
						socket.emit("mb_send",{topic:topic, msg:msg, to:to});
						return true;
					},
					on:function(topic, callback, from, uuid){
						if(!isConnected){
							return false;
						}
						var callback_id = uuid || create_uuid();
						socket.on(callback_id,function(msg){
							callback(msg);
						});
						socket.emit("mb_subscribe",{topic:topic,callback: callback_id,from:from});
						listeners[callback_id] = {
							topic:topic,
							callback:callback,
							from:from
						};
						return callback_id;
					},
					once:function(topic, callback, from){
						var self;
						var uuid = this.on(topic,function(msg){
							self.off(uuid);
							callback(msg);
						},from);
					},
					off:function(callback_id){
						if(!callback_id || !isConnected){
							return false;
						}
						socket.emit("mb_unsubscribe",{callback:callback_id});
						socket.off(callback_id);
						delete listeners[callback_id];
						return true;
					},
					request:function(api, query, to){
						if(!isConnected){
							return Promise.error({disconnected:true});
						}
						var pr = new Promise();
						var callback_id = create_uuid();
						socket.on(callback_id,function(results){
							if(results.error){
								pr.reject(results.error)
							}else {
								pr.resolve(results);
							}
						});
						socket.emit("mb_request",{api:api, query:query, callback:callback_id, to:to});
						return pr;
					},
					addRequestHandler:function(api, callback, limit_from){
						var callback_id = create_uuid();
						socket.on(callback_id,function(payload){
							var results = callback(payload.query,payload.from);
							if(Promise.is(results)){
								results.then(function(data){
									socket.emit(payload.callback, data);// return the response
								})
							}else{
								socket.emit(payload.callback, results);// return the response
							}

						});
						socket.emit("mb_add_request_handler",{api:api,callback:callback_id,limit_from:limit_from});
						return callback_id;
					}
				});

			}
		});
	}

	return ret;
	//return mb_server;
};

module.exports.inject = connect_inject;