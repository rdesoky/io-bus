/**
 * Created by Ramy Eldesoky on 6/13/2014.
 */

(function(){
	var states = {
		pending: 0,
		success: 1,
		failed: 2,
		cancelled: 3
	};

	function CPromise( init ) {
		this._callbacklist = [];
		this._state = states.pending; //0: pending, 1:success, 2: failed, 3: cancelled

		if(init){
			init(this.resolve.bind(this), this.reject.bind(this));
		}
	}

	var noSuccessHandler = function(result){
		console.error( "Default js-promise Success Handler." + ( (result !== undefined ) ? " result=" + JSON.stringify(result) : "" ) );
		return result;
	};
	var noErrorHandler = function(err){
		console.error( "Default js-promise Error Handler." + ( (err !== undefined ) ? " error=" + JSON.stringify(err) : "" ) );
		return err;
	};

	CPromise.prototype = {
		then: function (onSuccess, onFailure) {
			var thenPromise = new CPromise();//then of
			this._callbacklist.push({
				onSuccess: onSuccess||noSuccessHandler,
				onFailure: onFailure||noErrorHandler,
				thenPromise: thenPromise
			});
			this._notifyListeners();
			return thenPromise;
		},
		done: function (onSuccess, onFailure) {
			this._callbacklist.push({
				onSuccess: onSuccess||noSuccessHandler,
				onFailure: onFailure||noErrorHandler
			});
			this._notifyListeners();
			// doesn't return a new promise
		},
		_notifyListeners: function () {// notify onSuccess callbacks if promise is resolved
			if(CPromise.is(this._value)){
				return;//wait for new promise to be resolved
			}

			if( this._state == states.success || this._state == states.failed ){
				while( this._callbacklist.length ){
					var cb = this._callbacklist[0];
					this._callbacklist.splice(0, 1);//remove the callback node

					var then_ret = (this._state == states.success) ?
						cb.onSuccess(this._value) :
						cb.onFailure(this._value) ;

					if (cb.thenPromise) {
						//chain to returned promise
						(this._state == states.success)?
							cb.thenPromise.resolve(then_ret):
							cb.thenPromise.reject(then_ret);
					}
				}
			}
		},
		cancel:function(){
			this._state = states.cancelled;
			this._callbacklist.length = 0;
			return this;
		},
		reject:function(err_val){
			this._value = err_val;
			this._state = states.failed;
			this._notifyListeners();
			return this;
		},
		resolve: function (val) {
			if(this._state == states.success){
				return this;// already resolved
			}
			if( CPromise.is( val ) ) {
				//if value is a promise, wait for the resolve
				val.done(this.resolve.bind(this), this.reject.bind(this));
				return this;
			}
			this._state = states.success;
			this._value = val;
			this._notifyListeners();
			return this;
		}
	};

	CPromise.prototype.fulfill = CPromise.prototype.resolve;

	CPromise.wrap = CPromise.resolve = CPromise.as = function(val){
		return CPromise.is(val) ? val : (new CPromise()).resolve(val);
	};

	CPromise.is = function(val){
		//return( val && (val.constructor == CPromise) );
		return( (val !== null) && (val !== undefined) && (typeof val.then === "function") && (typeof val.done === "function") );
	};

	CPromise.all = CPromise.join = function(list){
		var ret = new CPromise();
		var doneCount = 0;
		var doneHandler = function(){
			if(++doneCount >= list.length){
				ret.resolve();
			}
		};

		if(list && list.length) {
			list.forEach(function (pr) {
				pr.done(doneHandler, doneHandler);
			});
		}else{
			setTimeout(function(){
				ret.resolve();
			},1);
		}

		return ret;
	};

	CPromise.timeout = function(ms){
		return new CPromise(function(onSuccess){
			setTimeout(onSuccess,ms);
		});
	};

	CPromise.wrapError = CPromise.reject = CPromise.error = function(err){
		return new CPromise(function(onSuccess,onError){
			onError(err);
		});
	};

	CPromise.series = function(fncList, options){
		var ret = new CPromise();
		var ret_vals = {success:{},errors:{}};

		(function runProcess(ndx, options){
			if(ndx>=fncList.length){
				ret.resolve(ret_vals);
				return;
			}
			var process = fncList[ndx];
			var prVal = process(options);
			if(CPromise.is(prVal)){
				prVal.done(
					function(results){
						ret_vals.success[ndx] = results;
						runProcess(ndx+1,results);
					},
					function(err){
						ret_vals.errors[ndx] = err;
						ret.reject(ret_vals);
					}
				);
			}else{
				ret_vals.success[ndx] = prVal;
				runProcess(ndx+1,prVal);
			}
		})(0,options);

		return ret;
	};

	CPromise.any = CPromise.race = function(list){
		var ret = new CPromise();
		var doneHandler = function(){
			ret.resolve();
		};
		list.forEach(function(pr){
			pr.done(doneHandler, doneHandler);
		});
		return ret;
	};

	if(typeof module !== "undefined") {//CommonJS
		module.exports = CPromise;
	}
	else if(typeof define === "function" && define.amd ){//AMD RequireJS
		define("js-promise",function(){
			return CPromise;
		});
	}else if(typeof window !== "undefined"){
		window.CPromise = CPromise;
	}

})();
