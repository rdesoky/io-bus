# io-bus 

Add io-bus middleware to your express application to provide MsgBus interface between all Apps hosted in this server


### Server side code
```javascript
var io_bus = require('io-bus');
var express = require('express');
var app = express();
var httpServer = app.listen( 3000, function(){} );
var msgBusServer = io_bus(httpServer, app);
var msgBus = msgBusServer.connect("BackendServices");

var data = {
    users:1000
};
msgBus.addRequestHandler("GetData",function(params, from){
    return data;
});
msgBus.addRequestHandler("AddUser",function(params,from){
    data.users += params.users;
    msgBus.publish("DataUpdated",data);
    return data;
});




```

### client side usage
```
<button id="UpdateUsers">Update</button>
<script>
    var ioBus = MsgBus("MyClientID",function(connected){//connection callback
        if(connected){
            ioBus.on("DataUpdated",function(data){
               console.log(data);
               //Do something
            });

            ioBus.request("GetData").then(function(data){
               //Refresh UI
               console.log(data);
               ioBus.publish("UIUpdated",{users:data.users});
            })
        }
    });
    document.getElementById("UpdateUsers").addEventListener("click",function(){
        ioBus.request("AddUser",{users:1})
    });
</script>

```