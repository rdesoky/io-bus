/**
 * Created by ramy on 8/13/2015.
 */
var Promise = require("js-promise");
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
			//console.log("Found Listener with handle=" + handle );

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
					console.log("mbus: Delivering a Msg to subscriber(" + listener_info.listener_id + "):" + JSON.stringify(msg) );
					listener_info.callback({from: msg.from, topic:msg.topic, data:msg.data});
				//}.bind(listener_info),1);
			}else{
				//console.log("Unqualified Message");
			}
		}
	}
	//console.log("Check these listeners:" + JSON.stringify(listeners ));
	if(listeners[msg.topic]){
		//console.log("Finding listeners for " + msg.topic + " message in " + JSON.stringify(listeners[msg.topic]) );
		callListeners(listeners[msg.topic]);
	}

	if(listeners["*"]){
		callListeners(listeners["*"]);
	}

	console.log("mbus: The msg: " + JSON.stringify(msg) + " has been delivered to (" + listeners_count + ") subscribers");
}

var MsgBusManager = {
	uuid:uuid,

	connect:function(my_id){
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
				console.log("mbus: Publishing to topic(" + topic + "), content(" + info_str + ") to(" + (to ? to : " all") + ")");

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
                return this.send.call(this,arguments);
            },
			request:function(api, params, timeout, to){
				var callback = uuid();
				console.log( "mbus: ReqRouter received request(" + api + "), with query(" + JSON.stringify(params) + ") from(" + my_id + ")");
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
				console.log("mbus: ReqRouter registers request(" + api + ") handler for (" + (limit_from || "all" ) + ")" );
				var self = this;
				return this.on("request",function(request){
					console.log("mbus: ReqRouter received request(" + request.api + "), data(" + JSON.stringify(request.data) + "), from(" + request.from + ")");
					if(request.data.api == api){
						var response = callback(request.data.params,request.from);
						Promise.as(response).then(function(return_val){
							self.send(request.data.callback,return_val,request.from);//emit the results
						});
					}
				},limit_from);
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
						return true;
					}

				}else if(typeof arg1 === "function"){
					callback = arg1;
					for(topic in listeners){//( slow ) linear search for this callback
						for(handle in listeners[topic]){
							if(listeners[topic][handle].callback == callback){
								delete handle2topic[handle];
								delete listeners[topic][handle];
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
							return true;
						}
					}
				}
			},
			disconnect:function(){
				//free all listeners and request handlers
				this.off(usedHandles);
			}
		}

        return MsgBusConnection;
	}
};

module.exports = MsgBusManager;
