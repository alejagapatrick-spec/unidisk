var curl = require('node-curl');
var http = require('https');

var XFR_ESTIMATING_MIN_SPEED = 20 * 1024; // n bytes/sec
var XFR_ESTIMATING_MIN_TIME = 20; // secs
var XFR_CONNECTION_TIMEOUT = 3; // secs

var PCS_HOSTNAME = "pcs.baidu.com";
var PCS_HOSTNAME_D = "d.pcs.baidu.com";
var PCS_HOSTNAME_C = "c.pcs.baidu.com";
var PCSURI = "/rest/2.0/pcs";
var USERTOKEN = require('fs').readFileSync( process.env.HOME + '/.baidu_pcs_token' );

exports._generatePath = function (options){
	var path = "";
	path += PCSURI + "/" + encodeURIComponent(options.cmd);
	path += "?access_token=" + encodeURIComponent(USERTOKEN);

	if( options.method ) path += "&method=" + encodeURIComponent(options.method);
	if( options.path ) path += "&path=" + encodeURIComponent(options.path);
	if( options.param ) path += "&param=" + encodeURIComponent(options.param);

	return path;
}

exports._execute = function (options, cb){
	var link = "https://" + PCS_HOSTNAME + this._generatePath(options);
	var handle = curl.create();
	handle(link, {
		RAW: 0,
		CONNECTTIMEOUT: XFR_CONNECTION_TIMEOUT,
		POST: ( options.httpMethod === "POST" ? 1 : 0 ),
		SSL_VERIFYPEER: 0
	}, function(err){
		var errorOutput = null;
		var response = {
			queryPara: options,
			uri: link,
			data: null
		};
		if(err){
			errorOutput = err;
		}else{
			try {
				response.data = JSON.parse(this.body);
			} catch (e) {
				errorOutput = this.body;
			}
		}
		cb(errorOutput, response);
	});
}

exports._download = function (options, cb){
	var link = "https://" + PCS_HOSTNAME_D + this._generatePath(options);
	var handle = curl.create();
	var estimationTime = (options.size / XFR_ESTIMATING_MIN_SPEED);
	handle(link, {
		RAW: 1,
		CONNECTTIMEOUT: XFR_CONNECTION_TIMEOUT,
		FOLLOWLOCATION: 1,
		TIMEOUT: ( estimationTime > XFR_ESTIMATING_MIN_TIME ? estimationTime : XFR_ESTIMATING_MIN_TIME ),
		SSL_VERIFYPEER: 0,
		RANGE: '' + options.offset + '-' + ( options.offset + options.size - 1 )
	}, function(err){
		var errorOutput = null;
		var response = {
			queryPara: options,
			uri: link,
			data: null
		};
		if(err){
			errorOutput = err;
		}else{
			response.data = this.body;
		}
		cb(errorOutput, response);
	});
}

exports.quota = function (cb){
	this._execute({
		cmd: "quota",
		method: "info",
		httpMethod: "GET"
	}, cb);
}

exports.getFileMeta = function (path, cb){
	this._execute({
		cmd: "file",
		method: "meta",
		httpMethod: "GET",
		path: path
	}, cb);
}

exports.getFileMetaBatch = function (param, cb){
	this._execute({
		cmd: "file",
		method: "meta",
		httpMethod: "GET",
		param: ( typeof(param) === 'string' ? param : JSON.stringify(param) )
	}, cb);
}

exports.getFileDownload = function (path, offset, size, cb){
	this._download({
		cmd: "file",
		method: "download",
		httpMethod: "GET",
		offset: offset,
		size: size,
		path: path
	}, cb);
}

exports.getFileList = function (path, cb){
	this._execute({
		cmd: "file",
		method: "list",
		httpMethod: "GET",
		path: path
	}, cb);
}

exports.getFileListRecycle = function (cb){
	this._execute({
		cmd: "file",
		method: "listrecycle"
	}, cb);
}
