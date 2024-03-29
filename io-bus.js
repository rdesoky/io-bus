/**
 * Created by Ramy Eldesoky on 8/14/2015.
 */
 var socket_io = require('socket.io');
 var socket_io_client = require("socket.io-client");
 var mb_server = require("./message_bus");
 var request_handlers = {};
 var subscribers = {};
 var client_version = "1.0.7";
 var debug = require("debug")("io-bus");
 var connect_inject = require('connect-inject');
 var listeners = {};
 
 
 var ioBus = function(server,express_app){
	 var io, httpServer;
	 var isConnected = false;
	 var isHost = false;
	 var injectedJS = "";
 
	 if(server == undefined){
		 server = 9666;
	 }
	 debug("Starting io-bus..");
 
	 if(typeof server == "number"){// bind to port number
		 debug("Creating http server on port %s", server);
 
		 httpServer = require("http").Server(httpServerHandler);
		 httpServer.listen(server);
 
		 debug("Adding socket.io listener", server);
		 io = new socket_io(httpServer, {origins: "*:*"});
		 io.on("connect", onClientConnect);// install host socket interface
 
		 var hDelaySuccess = setTimeout(function(){
			 isHost = true;
			 isConnected = true;// connected to local message bus
		 },3000);
 
 
		 // handle error
		 httpServer.on('error',function(msg){
			 debug("io Error %s", JSON.stringify(msg));
 
			 if(msg.code == 'EADDRINUSE') {
				 //debug("Another server is running on the port %s", server);
				 // debug("Server failure.. stopping");
				 // connect to the remote server
				 connectAsClient("http://localhost:" + server);
			 }
 
			 clearTimeout(hDelaySuccess);
		 });
 
	 }
	 else{ // bind to existing http server
		 debug("Binding to http server");
		 io = new socket_io(server, {origins: "*:*"});// attach to passed http server
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
 
	 //httpServer = io.httpServer;
 
	 function httpServerHandler(req,res){
		 if (req.url == "/io-bus/web-client.js") {
			 debug("Requested " + req.url);
			 serveClient(req, res, req.headers ? req.headers.host : null);// pass url to pass to client connection
		 }else {
			 res.writeHead(404);
			 res.end();
		 }
	 }
 
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
			 webClient = webClient.replace("/*{host}*/",'"//' + url + '"');
		 }
		 var scriptContent =
			 webClient + 
			 "\n" + 
			 read(require.resolve("./resources/socket.io.js"), 'utf-8');
 
		 if(injectedJS){
			 scriptContent += injectedJS;
		 }
		 res.end(scriptContent);
 
	 }
 
	 // install host socket interface
	 function onClientConnect(socket){// client connection
 
		 // authorization should be added before
		 debug("A client has connected to socket.io");
		 var socket_owner,
			 msg_bus;// connected client message bus
 
		 socket.on("mb_connect",function(auth){// mb_connect should be { app_id:<app_id>, client_id:<client_id> }
 
			 if(!auth){
				 return;
			 }
			 socket.emit("mb_accepted",auth);
			 socket_owner = auth.client_id;
			 mb_server.connect(socket_owner,function(mb){
				 msg_bus = mb;
			 });
			 debug("Client (" + socket_owner + ") connected to Message Bus via:" + JSON.stringify(auth));
 
			 socket.on("mb_send",function(payload){// payload should be in the form {topic:"<topic>", msg:{},to:"<optional>"}
				 debug("Received mb_send from(" + socket_owner + "), payload(" + JSON.stringify(payload) + ")");
				 if(!msg_bus) {
					 return;
				 }
				 msg_bus.send(payload.topic, payload.msg, payload.to);
			 });
			 socket.on("mb_request",function(request){// request should be in the form {topic:"<topic>", callback:"<unique_id>",query:{},to:"<optional>",timeout:<optional>}
				 debug("Received mb_request from(" + socket_owner + "), request(" + JSON.stringify(request) + ")");
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
				 debug( "Received mb_subscribe from(" + socket_owner + "), payload(" + JSON.stringify(payload) + ")" );
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
 
				 debug( "IoRegRouter received mb_add_request_handler from(" + socket_owner + "), handler_info(" + JSON.stringify(request_handler) + ")" );
 
				 if(!msg_bus) {
					 return;
				 }
 
				 request_handlers[request_handler.callback] = msg_bus.addRequestHandler(request_handler.api, function(query, from){//request format {topic:<topic>, query:{..},callback:<unique_id>}
					 debug( "IoRegRouter received Request from(" + from + "), query(" + JSON.stringify(query) + ")" );
					 var callback = "response_" + request_handler.api + "_" + mb_server.uuid();
					 const {promise, resolve, reject} = createPromise();
					 // wait for socket response
					 socket.once(callback, function (response) {
						 debug( "IoReqRouter received a response from(" + socket_owner + "), payload(" + JSON.stringify(response) + ")" );
						 resolve(response);
					 });
					 // send request to socket
					 var payload = {api:request_handler.api, query:query, from: from, callback: callback};
					 debug( "IoReqRouter Emits request to (" + socket_owner + ":" + request_handler.callback + "), payload(" + JSON.stringify(payload) + ")" );
					 socket.emit(request_handler.callback, payload);
					 return promise;
 
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
	 }
 
	 // install client socket interface
	 function connectAsClient(url){
		 isHost = false;
		 isConnected = false;
		 io = socket_io_client(url);
 
		 io.on("disconnect",function(){
			 debug("Disconnected from the server on port %s", server);
			 //connectToServer();//try reconnecting
			 isConnected = false;
		 });
 
		 io.on("connect",function(){
			 debug("Successfully connected to the %s", url);
			 isConnected = true;
		 });
 
	 }
 
	 function create_uuid(){
		 return mb_server.uuid();
	 }
 
	 return {
		 injectJS:function(js){
			 injectedJS += ";" + js;
			 return this;//for chaining
		 },
		 connected: false,
		 ssn: create_uuid(),
		 connect:function(id, callback){
			 var self = this;
 
			 if(!isConnected) {
				 debug("Trying to connect");
				 setTimeout(function(){
					 self.connect(id,callback);
				 },500);
				 return;
			 }
 
			 debug("Connected as %s", isHost ? 'host':'client');
 
			 if(!id){
				 id = this.uuid();
			 }
 
			 if(isHost){
				 mb_server.connect(id, function(mBus){
					 callback(mBus);
				 });
				 return;
			 }
 
			 if(isConnected) {
				 io.emit("mb_connect", {client_id: id, ssn:this.ssn});
			 }
 
			 var bus = {
				 is_connected:function(){
					 return isConnected;
				 },
				 publish:function(topic, msg, to){
					 if(!isConnected){
						 return false;
					 }
					 io.emit("mb_send",{topic:topic, msg:msg, to:to});
					 return true;
				 },
				 send:function(){
					 return this.publish.apply(this, arguments);
				 },
				 on:function(topic, callback, from, uuid){
					 if(!isConnected){
						 return false;
					 }
					 var callback_id = uuid || create_uuid();
					 io.on(callback_id,function(msg){
						 callback(msg);
					 });
					 io.emit("mb_subscribe",{topic:topic,callback: callback_id,from:from});
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
					 io.emit("mb_unsubscribe",{callback:callback_id});
					 io.off(callback_id);
					 delete listeners[callback_id];
					 return true;
				 },
				 request:function(api, query, timeout, to){
					 if(!isConnected){
						 return Promise.reject({disconnected:true});
					 }
					 const {promise, resolve, reject} = createPromise();
					 var callback_id = create_uuid();
					 io.on(callback_id,function(results){
						 if(results.error){
							 reject(results.error)
						 }else {
							 resolve(results);
						 }
					 });
					 io.emit("mb_request",{api:api, query:query, callback:callback_id, to:to, timeout:timeout});
					 return promise;
				 },
				 addRequestHandler:function(api, callback, limit_from){
					 var callback_id = create_uuid();
					 io.on(callback_id,function(payload){
						 var results = callback(payload.query,payload.from);
						 if(isPromise(results)){
							 results.then(function(data){
								 io.emit(payload.callback, data);// return the response
							 })
						 }else{
							 io.emit(payload.callback, results);// return the response
						 }
 
					 });
					 io.emit("mb_add_request_handler",{api:api,callback:callback_id,limit_from:limit_from});
					 return callback_id;
				 }
			 };
 
			 io.on("mb_accepted", function (auth) {
				 debug("Recieved mb_accepted");
				 self.connected = true;
				 if(auth.ssn == self.ssn) {
					 callback(bus);
				 }
			 });
 
			 io.on("connect",function(){// reconnected after disconnection
				 io.emit("mb_connect", {client_id: id, ssn:self.ssn});
				 isConnected = true;
			 });
 
			 io.on("disconnect",function(){
				 self.connected = isConnected = false;
			 });
			 
			 return this;//For chaining
		 }
	 };
	 //return mb_server;
 };
 

 function createPromise(){
	var resolve, reject;
	const promise = new Promise((res,rej)=>{
		resolve = res;
		reject = rej;
	});
	return {promise, resolve, reject};
}

function isPromise(object){
	if(Promise && Promise.resolve){
		return Promise.resolve(object) == object;
	}
	return false;
}


 ioBus.inject = connect_inject;
 
 module.exports = ioBus;
 
 