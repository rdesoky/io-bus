/**
 * Created by ramy on 9/2/2015.
 */
(function(){

	var MsgBus = function(client_id, connection_callback){
		var socket = io(/*{host}*/);
		var listeners = {};
		var isConnected = false;

		var exports = {
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
			request:function(api, query, timeout, to){
                if(!isConnected){
                    return CPromise.error({disconnected:true});
                }
				var pr = new CPromise();
				var callback_id = "Request_" + api + "_" + create_uuid();
				socket.on(callback_id,function(results){
					if(results.error){
						pr.reject(results.error)
					}else {
						pr.resolve(results);
					}
				});
				socket.emit("mb_request",{api:api, query:query, callback:callback_id, to:to, timeout: timeout});
				return pr;
			}
		};

		socket.on("connect",function(){
			isConnected = true;
			socket.emit("mb_connect",{client_id:client_id});
			connection_callback(true);
			//for(var uuid in listeners){// reconnect listeners
			//	var info = listeners[uuid];
			//	exports.on(info.topic,info.callback,info.from,uuid);
			//}
		});
		socket.on("disconnect",function() {
			isConnected = false;
			connection_callback(false);
		});
		return exports;
	};

	if(typeof define === "function" && define.amd ){//AMD RequireJS
		define("web-client",function(){
			return MsgBus
		});
	}
	else if(typeof module !== "undefined") {//CommonJS
		module.exports = MsgBus;
	}else if(window !== undefined){
		window.MsgBus = MsgBus;
	}

	function create_uuid(){
		var d = new Date().getTime();
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			var r = (d + Math.random()*16)%16 | 0;
			d = Math.floor(d/16);
			return (c=='x' ? r : (r&0x7|0x8)).toString(16);
		});
	}


})();
