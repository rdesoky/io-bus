# io-bus 

Add io-bus middleware to your express application to provide MsgBus interface between all Apps hosted in this server


### Server side code
```javascript
var ioBus = require('io-bus');
var express = require('express');
var app = express();
var httpServer = app.listen( 3000, function(){} );

var sample_data = {
    users:1000
};

ioBus(9666).connect("BackendServices",function(msgBus){
	msgBus.addRequestHandler("GetData",function(params, from){
	    return sample_data;
	});
	msgBus.addRequestHandler("AddUser",function(params,from){
	    sample_data.users += params.users;
	    msgBus.publish("DataUpdated",sample_data);
	    return sample_data;
	});
});

app.use(ioBus.inject({
	snippet:'<script src="http://localhost:9666/io-bus/web-client.js"></script>'
}));

app.use( '/', express.static('./static/',{index:"index.html"}) );


```

### client side usage
```
<button id="UpdateUsers">Update</button>
<script>
    window.addEventListener("DOMContentLoaded",function(){

        var ioBus = MsgBus("MyClientID",function(connected){//connection callback
            if(connected){
                ioBus.on('DataUpdated',function(msg){
                   console.log('Data has been updated');
                   console.log(msg.data);
                });

                ioBus.request('GetData').then(function(response){
                   //Refresh UI
                   console.log('GetData responded');
                   console.log(response.data);
                   ioBus.publish("UIUpdated",{users:response.data.users});
                })
            }
        });
        
        document.getElementById('UpdateUsers').addEventListener('click',function(){
            ioBus.request('AddUser',{users:1}).then(
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