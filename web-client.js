/**
 * web-client.js
 * Created by Ramy Eldesoky on 9/2/2015.
 * Last update 6/12/2020
 */
(function() {
	var MsgBus = function(client_id, connection_callback, host) {
	  var detectedHost = String(/*{host}*/);
	  var socket = io(host || detectedHost);
	  var listeners = {};
	  var requestHandlers = {};
	  var isConnected = false;
  
	  var bus = {
		is_connected: function() {
		  return isConnected;
		},
  
		publish: function(topic, msg, to) {
		  if (!isConnected) {
			return false;
		  }
		  socket.emit("mb_send", { topic: topic, msg: msg, to: to });
		  return true;
		},
  
		on: function(topic, callback, from, uuid) {
		  if (!isConnected) {
			return false;
		  }
		  var callback_id = uuid || create_uuid();
		  socket.on(callback_id, function(msg) {
			callback(msg);
		  });
		  socket.emit("mb_subscribe", {
			topic: topic,
			callback: callback_id,
			from: from,
		  });
		  listeners[callback_id] = {
			topic: topic,
			callback: callback,
			from: from,
		  };
		  return callback_id;
		},
		once: function(topic, callback, from) {
		  var self;
		  var uuid = this.on(
			topic,
			function(msg) {
			  self.off(uuid);
			  callback(msg);
			},
			from
		  );
		},
  
		off: function(callback_id) {
		  if (!callback_id || !isConnected) {
			return false;
		  }
		  socket.emit("mb_unsubscribe", { callback: callback_id });
		  socket.off(callback_id);
		  delete listeners[callback_id];
		  return true;
		},
  
		request: function(api, query, timeout, to) {
		  if (!isConnected) {
			return Promise.reject({ disconnected: true });
		  }
		  return new Promise((resolve, reject) => {
			var callback_id = "Request_" + api + "_" + create_uuid();
			socket.on(callback_id, function(results) {
			  if (results.error) {
				reject(results.error);
			  } else {
				resolve(results);
			  }
			});
			socket.emit("mb_request", {
			  api: api,
			  query: query,
			  callback: callback_id,
			  to: to,
			  timeout: timeout,
			});
		  });
		},
  
		addRequestHandler: function(api, callback, limit_from) {
		  var callback_id = create_uuid();
		  socket.on(callback_id, function(payload) {
			var results = Promise.resolve(callback(payload.query, payload.from));
  
			results.then(function(data) {
			  socket.emit(payload.callback, data); // return the response
			});
		  });
		  socket.emit("mb_add_request_handler", {
			api: api,
			callback: callback_id,
			limit_from: limit_from,
		  });
		  requestHandlers[callback_id] = callback;
		  return callback_id;
		},
  
		removeRequestHandler: function(id) {
		  socket.emit("mb_remove_request_handler", { id: id });
		  socket.off(id);
		  delete requestHandlers[id];
		},
  
		disconnect: function() {
		  socket.disconnect();
		},
	  };
  
	  socket.on("connect", function() {
		isConnected = true;
		socket.emit("mb_connect", { client_id: client_id });
		connection_callback(true);
		//for(var uuid in listeners){// reconnect listeners
		//	var info = listeners[uuid];
		//	exports.on(info.topic,info.callback,info.from,uuid);
		//}
	  });
	  socket.on("disconnect", function() {
		isConnected = false;
		connection_callback(false);
	  });
	  return bus;
	};
  
	if (typeof define === "function" && define.amd) {
	  //AMD RequireJS
	  define("web-client", function() {
		return MsgBus;
	  });
	} else if (typeof module !== "undefined") {
	  //CommonJS
	  module.exports = MsgBus;
	} else if (window !== undefined) {
	  window.MsgBus = MsgBus;
	}
  
	function create_uuid() {
	  var d = new Date().getTime();
	  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
		var r = (d + Math.random() * 16) % 16 | 0;
		d = Math.floor(d / 16);
		return (c == "x" ? r : (r & 0x7) | 0x8).toString(16);
	  });
	}
  })();
  