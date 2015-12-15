# io-bus 

Add io-bus middleware to your express application to provide MsgBus interface between all Apps hosted in this server


### Server side code
```javascript
var io_bus = require('io-bus');
var express = require('express');
var app = express();
var httpServer = app.listen( 3000, function(){} );
var msgBusServer = io_bus(httpServer, app);

app.use( '/', express.static('./static/',{index:"index.html"}) );

var sample_data = {
    users:1000
};
var msgBus = msgBusServer.connect("BackendServices");
msgBus.addRequestHandler("GetData",function(params, from){
    return sample_data;
});
msgBus.addRequestHandler("AddUser",function(params,from){
    sample_data.users += params.users;
    msgBus.publish("DataUpdated",sample_data);
    return sample_data;
});


```

### client side usage
```
<button id="UpdateUsers">Update</button>
<script>
    window.addEventListener("DOMContentLoaded",function(){

        var ioBus = MsgBus("MyClientID",function(connected){//connection callback
            if(connected){
                ioBus.on("DataUpdated",function(msg){
                   console.log(msg.data);
                   //Do something
                });

                ioBus.request("GetData").then(function(response){
                   //Refresh UI
                   console.log(response.data);
                   ioBus.send("UIUpdated",{users:response.data.users});
                })
            }
        });
        
        document.getElementById("UpdateUsers").addEventListener("click",function(){
            ioBus.request("AddUser",{users:1}).then(
                function(response){
                    console.log("AddUser Succeeded");
                    console.log(response.data);
                },
                function(err){// mostly from disconnected socket
                    console.error(err);
                }
            );
        });
    })
</script>

```