var unirest = require('unirest');
var logger = require('../helper/log');
const EventEmitter = require('events');
const util = require('util');

//var XFR_ESTIMATING_MIN_SPEED = 20 * 1024; // n bytes/sec
//var XFR_ESTIMATING_MIN_TIME = 20; // secs
var XFR_CONNECTION_TIMEOUT = 10; // secs

var PCS_HOSTNAME = 'pcs.baidu.com';
var PCS_HOSTNAME_D = 'pcs.baidu.com'; // 'd.pcs.baidu.com';
//var PCS_HOSTNAME_C = 'c.pcs.baidu.com';
var PCSURI = '/rest/2.0/pcs';
var UD_ROOTPATH = '/apps/APP_ROOT'

var pcs = function (){
  EventEmitter.call(this);
};
util.inherits(pcs, EventEmitter);

pcs.prototype.init = function (options){
  this.USERTOKEN = options.token;
  this.PROXY = options.proxy;
};

pcs.prototype.isIllegalFileName = function (path) {
  var list = path.split('/');
  for (var i = 0; i < list.length; i++) {
    if (list[i].indexOf('.') === 0) {
      return true;
    }
  }
  return false;
};

pcs.prototype._trimRootPath = function (fileMeta){
  if (fileMeta.list) {
    for (var i in fileMeta.list) {
      var path = fileMeta.list[i].path;
      var mtime = fileMeta.list[i].mtime;
      var ctime = fileMeta.list[i].ctime;
      if (0 === path.indexOf(UD_ROOTPATH)) {
        fileMeta.list[i].path = path.replace(UD_ROOTPATH, '');
      }
      fileMeta.list[i].mtime = mtime * 1000;
      fileMeta.list[i].ctime = ctime * 1000;
    }
  }
  return fileMeta;
}

pcs.prototype._generatePath = function (options){
  var path = '';
  path += PCSURI + '/' + encodeURIComponent(options.cmd);
  path += '?access_token=' + encodeURIComponent(this.USERTOKEN);

  if (options.method) {
    path += '&method=' + encodeURIComponent(options.method);
  }
  if (options.path) {
    path += '&path=' + encodeURIComponent(options.path);
  }
  if (options.param) {
    path += '&param=' + encodeURIComponent(options.param);
  }

  return path;
}

pcs.prototype._execute = function (options, cb){
  var that = this;
  var link = 'https://' + PCS_HOSTNAME + this._generatePath(options);
  unirest.get(link)
    .proxy(this.PROXY)
    .timeout(XFR_CONNECTION_TIMEOUT * 1000)
    .end(function (httpResponse) {
      var errorOutput = null;
      var response = {
        queryPara: options,
        uri: link,
        data: null
      };
      if (httpResponse.error && httpResponse.error.code) {
        errorOutput = httpResponse.error;
        logger.error({
          code: httpResponse.code,
          status: httpResponse.status,
          error: httpResponse.error,
          statusType: httpResponse.statusType
        });
      } else if (httpResponse.serverError) {
        errorOutput = httpResponse.body;
        logger.error({
          code: httpResponse.code,
          status: httpResponse.status,
          statusType: httpResponse.statusType
        });
      } else {
        try {
          var responseJson = JSON.parse(httpResponse.body);
          if ( responseJson.error_code && responseJson.error_code !== 31066 ) { // file does not exist
            //{ error_code: 31326, error_msg: 'anti hotlinking' }
            errorOutput = responseJson;
            logger.error(errorOutput);
          } else {
            response.data = that._trimRootPath(responseJson);
          }
        } catch (e) {
          errorOutput = httpResponse.body;
        }
      }
      cb(errorOutput, response);
    });
}

pcs.prototype._download = function (options, cb){
  var link = 'https://' + PCS_HOSTNAME_D + this._generatePath(options);
  //var estimationTime = (options.size / XFR_ESTIMATING_MIN_SPEED);
  unirest.get(link)
    .proxy(this.PROXY)
    .timeout(XFR_CONNECTION_TIMEOUT * 1000)
    .encoding(null)
    .headers({
      'Range': 'bytes=' + options.offset + '-' + ( options.offset + options.size - 1 )
    })
    .end(function (httpResponse){
      var errorOutput = null;
      var response = {
        queryPara: options,
        uri: link,
        data: null
      };
      if (httpResponse.error) {
        errorOutput = {
          code: httpResponse.code,
          error: httpResponse.error,
          status: httpResponse.status,
          statusType: httpResponse.statusType
        };
      } else {
        try {
          // XXX: this is a workaround for unstable issue.
          response.data = httpResponse.raw_body;
          response.length = httpResponse.raw_body.length;
        } catch (e) {
          logger.error(e);
          errorOutput = httpResponse.body;
        }
      }
      cb(errorOutput, response);
    });
}

pcs.prototype.openFile = function (path, flags, fd, cb) {
  cb(null, null);
};

pcs.prototype.commitFileData = function (path, fd, cb){
  cb(null, null);
};

pcs.prototype.quota = function (cb){
  this._execute({
    cmd: 'quota',
    method: 'info',
    httpMethod: 'GET'
  }, cb);
}

pcs.prototype.getFileMeta = function (path, cb){
  this._execute({
    cmd: 'file',
    method: 'meta',
    httpMethod: 'GET',
    path: UD_ROOTPATH + path
  }, cb);
}

pcs.prototype.getFileMetaBatch = function (param, cb){
  for (var i = 0; i < param.list.length; i++) {
    param.list[i].path = UD_ROOTPATH + param.list[i].path;
  }
  this._execute({
    cmd: 'file',
    method: 'meta',
    httpMethod: 'GET',
    param: ( typeof(param) === 'string' ? param : JSON.stringify(param) )
  }, function (errorOutput, response) {
    if (response && response.data) {
      for (var i = 0; i < response.data.list.length; i++) {
        response.data.list[i] =  pcs._trimRootPath(response.data.list[i]);
      }
    }
    cb(errorOutput, response);
  });
}

pcs.prototype.getFileDownload = function (path, offset, size, cb){
  this._download({
    cmd: 'file',
    method: 'download',
    httpMethod: 'GET',
    offset: offset,
    size: size,
    path: UD_ROOTPATH + path
  }, cb);
}

pcs.prototype.getFileList = function (path, cb){
  this._execute({
    cmd: 'file',
    method: 'list',
    httpMethod: 'GET',
    path: UD_ROOTPATH + path
  }, cb);
}

pcs.prototype.getFileListRecycle = function (cb){
  this._execute({
    cmd: 'file',
    method: 'listrecycle'
  }, cb);
}

pcs.prototype._tokenRequest = function (link, cb){
  unirest.get(link)
    .header('Accept', 'application/json')
    .proxy(this.PROXY)
    .timeout(XFR_CONNECTION_TIMEOUT * 1000)
    .end(function (httpResponse) {
      var errorOutput = null;
      var response = {
        data: null
      };
      if (httpResponse.serverError) {
        errorOutput = httpResponse.body;
        logger.error({
          code: httpResponse.code,
          status: httpResponse.status,
          statusType: httpResponse.statusType
        });
      } else {
        response.data = httpResponse.body;
      }
      cb(errorOutput, response);
    });
};

pcs.prototype.getAccessToken = function (apiKey, apiSecret, cb){
  var self = this;
  var deviceCode = null;
  var interval = 10;

  function request1st (){
    var link = 'https://openapi.baidu.com/oauth/2.0/device/code?' +
      'client_id=' + apiKey + '&' +
      'response_type=device_code&scope=basic,netdisk';
    self._tokenRequest(link, request2nd);
  }

  function request2nd (error, response){
    var msg = response ? response.data : {};
    if (msg.verification_url && msg.user_code) {

      /* eslint-disable no-console */
      console.log(msg.verification_url);
      console.log(msg.user_code);
      /* eslint-enable no-console */
    }
    if (msg.interval) {
      interval = msg.interval;
    }
    if (msg.device_code) {
      deviceCode = msg.device_code;
    }
    var link = 'https://openapi.baidu.com/oauth/2.0/token?' +
      'grant_type=device_token&' +
      'code=' + deviceCode + '&' +
      'client_id=' + apiKey + '&' +
      'client_secret=' + apiSecret;

    self._tokenRequest(link, requestEnd);
  }

  function requestEnd (error, response){
    if (response.data.error === 'authorization_pending') {
      /* eslint-disable no-console */
      console.log('waiting for verification...');
      /* eslint-enable no-console */
      setTimeout(request2nd, interval * 1000);
    } else if (response.data.access_token) {
      cb(error, {
        data: {accessToken: response.data.access_token}
      });
    } else {
      cb({errorMsg: 'Unknown Error'}, {data: null});
    }
  }

  request1st();
};

module.exports = pcs;
