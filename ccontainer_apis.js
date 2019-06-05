/**
 * Created by Ramy Eldesoky on 12/21/2015.
 * Last update by Ramy Eldesoky: 10/24/2018
 */
(function(){

    var notConntected = {
        message: "io-bus not connected"
    };

    var LocalhostStub = {
        communicator:{
            invoke:function(reqId, payload, onResponse, onError){
                (function retry(num){
                    if(window.communicator!=LocalhostStub.communicator){
                        communicator.invoke(reqId, payload, onResponse, onError);
                        return;
                    }
    
                    if(num < 10){
                        setTimeout(function(){
                            retry(num+1);
                        },500);
                    }else{
                        onError && onError(notConntected);
                    }
                })(0);
            },
            publish:function(topic, payload, onSuccess, onError){
                (function retry(num){
                    if(window.communicator!=LocalhostStub.communicator){
                        communicator.publish(topic, payload, onSuccess, onError);
                        return;
                    }
    
                    if(num < 10){
                        setTimeout(function(){
                            retry(num+1);
                        },500);
                    }else{
                        onError && onError(notConntected);
                    }
                })(0);
            },
            subscribe:function(topic, onSuccess, onMsgReceived, onError){
                (function retry(num){
                    if(window.communicator!=LocalhostStub.communicator){
                        communicator.subscribe(topic, onSuccess, onMsgReceived, onError);
                        return;
                    }
    
                    if(num < 10){
                        setTimeout(function(){
                            retry(num+1);
                        },500);
                    }else{
                        onError && onError(notConntected);
                    }
                })(0);
            },
            setValues:function(id, values, onSuccess, onError){
                (function retry(num){
                    if(window.communicator!=LocalhostStub.communicator){
                        communicator.setValues(id, values, onSuccess, onError);
                        return;
                    }
    
                    if(num < 10){
                        setTimeout(function(){
                            retry(num+1);
                        },500);
                    }else{
                        onError && onError(notConntected);
                    }
                })(0);
            },
            getValues:function(id, onValueReceived, onError){
                (function retry(num){
                    if(window.communicator!=LocalhostStub.communicator){
                        communicator.getValues(id, onValueReceived, onError);
                        return;
                    }
    
                    if(num < 10){
                        setTimeout(function(){
                            retry(num+1);
                        },500);
                    }else{
                        onError && onError(notConntected);
                    }
                })(0);
            },
            get_initial_state:function(onStateReceived, onError){
                (function retry(num){
                    if(window.communicator!=LocalhostStub.communicator){
                        communicator.get_initial_state(onStateReceived, onError);
                        return;
                    }
    
                    if(num < 10){
                        setTimeout(function(){
                            retry(num+1);
                        },500);
                    }else{
                        onError && onError(notConntected);
                    }
                })(0);
            },
            set_properties:function(onStateReceived, onError){
                (function retry(num){
                    if(window.communicator!=LocalhostStub.communicator){
                        communicator.set_properties(onStateReceived, onError);
                        return;
                    }
    
                    if(num < 10){
                        setTimeout(function(){
                            retry(num+1);
                        },500);
                    }else{
                        onError && onError(notConntected);
                    }
                })(0);
            }
        },
        makeSubscribeRequest:function(channelName, callback, onSuccess, onError){
            (function retry(num){
                if(window.makeSubscribeRequest!=LocalhostStub.makeSubscribeRequest){
                    //iobus is connected
                    window.makeSubscribeRequest(channelName, callback, onSuccess, onError);
                    return;
                }
                //not connected yet, try again later
                if(num < 10){
                    setTimeout(function(){
                        retry(num+1);
                    },500);
                }else{
                    onError && onError(notConntected);
                }
            })(0);

            return true;
        },
        makeUnsubscribeRequest:function(subscribeID, onSuccess, onError){
            (function retry(num){
                if(window.makeUnsubscribeRequest!=LocalhostStub.makeUnsubscribeRequest){
                    window.makeUnsubscribeRequest(subscribeID, onSuccess, onError);
                    return;
                }

                if(num < 10){
                    setTimeout(function(){
                        retry(num+1);
                    },500);
                }else{
                    onError && onError(notConntected);
                }
            })(0);

            return true;
        },

        makePublishMessageRequest: function(channelName, msgData, onSuccess, onError){
            (function retry(num){
                if(window.makePublishMessageRequest!=LocalhostStub.makePublishMessageRequest){
                    window.makePublishMessageRequest(channelName, msgData, onSuccess, onError);
                    return;
                }

                if(num < 10){
                    setTimeout(function(){
                        retry(num+1);
                    },500);
                }else{
                    onError && onError(notConntected);
                }
            })(0);

            return true;
        },

        makePublishRequestRequest:function(requestName, requestParams, timeout, onResponse, onError ){
            (function retry(num){
                if(window.makePublishRequestRequest!=LocalhostStub.makePublishRequestRequest){
                    window.makePublishRequestRequest(requestName, requestParams, timeout, onResponse, onError );
                    return;
                }

                if(num < 10){
                    setTimeout(function(){
                        retry(num+1);
                    },500);
                }else{
                    onError && onError(notConntected);
                }
            })(0);

            return true;
        }
    };

    //called initially, and upon iobus disconnection
    function useLocalhostStubMethods(){
        for(var item in LocalhostStub){
            if(LocalhostStub.hasOwnProperty(item)) {
                window[item] = LocalhostStub[item];
            }
        }
    }

    useLocalhostStubMethods();

    function createIoBusForwards(ioBus){
        return window.__ioBus = {
            communicator:{
                invoke:function(reqId, payload, onResponse, onError){
                    return window.__ioBus.makePublishRequestRequest('cmn-' + reqId, payload, 10000, onResponse, onError);
                },
                publish:function(topic, payload, onSuccess, onError){
                    return window.__ioBus.makePublishMessageRequest('cmn-' + topic, payload, onSuccess, onError);
                },
                subscribe:function(topic, onSuccess, onMsgReceived, onError){
                    return window.__ioBus.makeSubscribeRequest('cmn-' + topic, onMsgReceived, onSuccess, onError);
                },
                unsubscribe:function(subscriptionID){
                    return window.__ioBus.makeUnsubscribeRequest(subscriptionID, function dummyOnSuccess(){});
                },
                setValues:function(id, values, onSuccess, onError){
                    return this.publish('cmn-set-values', {id:id, values:values}, onSuccess, onError);
                },
                getValues:function(id, onValueReceived, onError){
                    return this.invoke('cmn-get-values',{id:id}, onValueReceived, onError);
                },
                get_initial_state:function(onStateReceived, onError){
                    return this.invoke('get_initial_state',{}, onStateReceived, onError);
                },
                set_properties:function(payload, onSuccess){
                    return this.invoke('set_properties', payload, onSuccess);
                }
            },
            //subscribe
            makeSubscribeRequest:function(channelName, callback, onSuccess, onError){
                var id = ioBus.on(channelName, function(msg){
                    callback(msg.data);
                });
                onSuccess && onSuccess({id:id});
                return true;
            },
            //unsubscribe
            makeUnsubscribeRequest: function(subscribeID, onSuccess, onError){
                ioBus.off(subscribeID);
                onSuccess(subscribeID);
                return true;
            },
            //publish
            makePublishMessageRequest: function (channelName, msgData, onSuccess, onError) {
                if(typeof msgData == 'string'){
                    msgData = JSON.parse(msgData);
                }
                ioBus.publish(channelName, msgData);
                return true;
            },
            //request
            makePublishRequestRequest: function(requestName, requestParams, timeout, onResponse, onError ){
                if(typeof requestParams == 'string'){
                    try{
                        requestParams = JSON.parse(requestParams);
                    }catch(e){
                        //params not in JSON format
                        //send as is
                    }
                }
                ioBus.request(requestName,requestParams,timeout || 10000).then(
                    function(response){
                        onResponse(response.data);
                    },
                    onError
                );
                return true;
            }
        }
    }

    //Called upon successfull iobus connection
    function useIoBusForwards(ioBus){
        var forwards = createIoBusForwards(ioBus);
        for(var item in forwards){
            if(LocalhostStub.hasOwnProperty(item) && window[item] == LocalhostStub[item] ) { //replace stub methods with iobus
                window[item] = forwards[item];
            }
        }
    }

    window.addEventListener("DOMContentLoaded",function(){
        var ioBus = MsgBus("LocalhostUI",function(connected){//connection callback
            if(connected){
                useIoBusForwards(ioBus);
            }else{//disconnected, revert to Stub methods
                useLocalhostStubMethods();
            }
        });
    });

})();