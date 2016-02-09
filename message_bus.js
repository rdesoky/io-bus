/**
 * Created by ramy on 8/13/2015.
 */
var Promise = require("js-promise");
var debug = require("debug")("msg-bus");

var listeners = {
// {topic}:{
//      "{unique_handle}":{
//          only_from:"{unique_id}",//optional
//          listener_id:"{unique_id}",
//          callback:function(){}
//      },
//	    "{unique_handle}":{..}
// }
};
var handle2topic = {};
var free_handle = 0;

var reqHandlers = {
//"{unique_handle}": "{api}"
};

function uuid(){
	var d = new Date().getTime();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		var r = (d + Math.random()*16)%16 | 0;
		d = Math.floor(d/16);
		return (c=='x' ? r : (r&0x7|0x8)).toString(16);
	});
}

function deliverMessage(msg){
	var listeners_count = 0;

	function callListeners(event_listeners){
		for( var handle in event_listeners ){
			//debug("Found Listener with handle=" + handle );

			if(!event_listeners.hasOwnProperty(handle)){
				continue;
			}
			var listener_info = event_listeners[handle];

			if(    ( !msg.to || msg.to==listener_info.listener_id )// filter receiver
				&& ( !listener_info.only_from || listener_info.only_from==msg.from )// filter sender
			){
				listeners_count ++;
				//setTimeout(function(){
				//	var listener_info = this;
				debug("Delivering a Msg to subscriber(" + listener_info.listener_id + "):" + JSON.stringify(msg) );
				listener_info.callback({from: msg.from, topic:msg.topic, data:msg.data});
				//}.bind(listener_info),1);
			}else{
				//debug("Unqualified Message");
			}
		}
	}
	//debug("Check these listeners:" + JSON.stringify(listeners ));
	if(listeners[msg.topic]){
		//debug("Finding listeners for " + msg.topic + " message in " + JSON.stringify(listeners[msg.topic]) );
		callListeners(listeners[msg.topic]);
	}

	if(listeners["*"]){
		callListeners(listeners["*"]);
	}

	debug("The msg: " + JSON.stringify(msg) + " has been delivered to (" + listeners_count + ") subscribers");
}

var MsgBusManager = {
	uuid:uuid,

	connect:function(my_id, callback){
		if(!my_id){
			my_id = uuid();
		}

		var usedHandles = [];

		var MsgBusConnection = {
			my_id:my_id,
			//listeners:listeners,// for debugging purpose

			on:function(topic, callback, from/*optional*/){
				if(Array.isArray(topic)){
					var self = this;
					var ret =[];
					topic.forEach(function(t){
						ret.push(self.on(t, function(info){
							callback(t, info);
						}, from));
					});
					return ret;
				}

				// create or reference an event_listeners array
				var event_listeners = listeners[topic] === undefined ? ( listeners[topic] = {} ) : listeners[topic];

				free_handle ++;

				event_listeners[free_handle] = {
					callback: callback,
					only_from: from,
					listener_id: my_id
				};

				handle2topic[free_handle] = topic;
				usedHandles.push(free_handle);
				return free_handle;
			},
			once:function(topic, time_out, from/*optional*/){
				var ret = new Promise();
				var self = this;
				var hTimeout;
				var hListener = this.on(topic, function(info){
					if(hListener) {
						ret.resolve(info);
						self.off(hListener);
					}
					if(hTimeout){
						clearTimeout(hTimeout);
					}
				}, from);

				hTimeout = setTimeout(function () {
					if (hListener) {
						self.off(hListener);
						hListener = 0;
						ret.reject({error: "timeout"});
					}
				}, time_out || 15000);

				return ret;
			},
			send:function(topic, data, to /* optional */){
				var info_str;
				try {
					info_str = JSON.stringify(data);
				}catch(e){
					info_str = data;
				}
				debug("Publishing to topic(" + topic + "), content(" + info_str + ") to(" + (to ? to : "all") + ")");

				setTimeout(function(){
					deliverMessage({
						topic:topic,
						from:my_id,
						to:to,
						data:data
					})
				},1);
			},
			publish:function(){
				return this.send.apply(this,arguments);
			},
			request:function(api, params, timeout, to){
				var callback = "response_" + api + "_" + uuid();
				debug( "ReqRouter received request(" + api + "), with query(" + JSON.stringify(params) + ") from(" + my_id + ")");

				var foundHandler = false;
				for(var handle in reqHandlers){
					if(reqHandlers.hasOwnProperty(handle)){
						if(reqHandlers[handle] == api){
							foundHandler=true;
							break;
						}
					}
				}

				if(!foundHandler){
					debug( "No handler found for request(" + api + ")");
					return Promise.reject({error:"no handlers found"});
				}

				var retPromise = this.once(callback, timeout, to);

				this.send("request",{
					api: api,
					callback: callback,
					params: params,
					from: my_id
				}, to);

				return retPromise;
			},
			//addRequestHandler callback should return data as a Promise to request caller
			addRequestHandler:function(api, callback, limit_from/*optional*/){
				debug("ReqRouter registers request(" + api + ") handler for (" + (limit_from || "all" ) + ")" );
				var self = this;
				var handle = this.on("request",function(request){
					debug("ReqRouter received request(" + request.data.api + "), params(" + JSON.stringify(request.data.params) + "), from(" + request.from + ")");
					if(request.data.api == api){
						var response = callback(request.data.params,request.from);
						Promise.as(response).then(function(return_val){
							self.send(request.data.callback,return_val,request.from);//emit the results
						});
					}
				},limit_from);

				reqHandlers[handle] = api;

				return handle;
			},
			/*
			 Usage:
			 .off( (number) handle )
			 .off( (array) handles )
			 .off( (function) callback(str) )
			 .off( (string) topic, (function) callback )
			 */
			off:function(arg1, arg2){
				var handle, callback, topic;
				if(Array.isArray(arg1)){
					for(var i=0; i<arg1.length;i++){
						this.off(arg1[i]);
					}
					return this;
				}
				if(typeof arg1 === 'number'){
					handle = arg1;
					topic = handle2topic[handle];
					if(topic && listeners[topic]){
						delete handle2topic[handle];
						delete listeners[topic][handle];
						delete reqHandlers[handle];
						return true;
					}

				}else if(typeof arg1 === "function"){
					callback = arg1;
					for(topic in listeners){//( slow ) linear search for this callback
						for(handle in listeners[topic]){
							if(listeners[topic][handle].callback == callback){
								delete handle2topic[handle];
								delete listeners[topic][handle];
								delete reqHandlers[handle];
								return true;
							}
						}
					}

				}else if(typeof arg1 === "string"){
					topic = arg1;
					callback = arg2;
					for(handle in listeners[topic]){
						if(listeners[topic][handle].callback == callback){
							delete handle2topic[handle];
							delete listeners[topic][handle];
							delete reqHandlers[handle];
							return true;
						}
					}
				}
			},
			disconnect:function(){
				//free all listeners and request handlers
				this.off(usedHandles);
			}
		};

		return setTimeout(function(){
			callback(MsgBusConnection);
		},1);
	}
};

module.exports = MsgBusManager;
