#!/usr/bin/env node
var fuse = require('fuse-bindings');
var options = {};  // See parseArgs()
var udManager = require('./helper/udManager');
var logger = require('./helper/log');
var Settings = require('./helper/Settings');
var FUSE_IOSIZE = Settings.get('fuse_iosize');
require('./helper/ObjectExtend');

var udm;

function getattr(path, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  udm.getFileMeta(path, function (error, response){
    var stat = {};
    var err = 0; // assume success
    if( !response.data || !response.data.list){
      err = fuse.ENOENT;
    }else if( response.data.list[0].isdir == 1 ){
      stat.size = 4096;   // standard size of a directory
      stat.mode = 040770; // directory with 770 permissions
      stat.mtime = new Date(response.data.list[0].mtime);
      stat.atime = new Date(response.data.list[0].mtime);
      stat.ctime = new Date(response.data.list[0].ctime);
      stat.uid = process.getuid();
      stat.gid = process.getgid();
    }else{
      stat.size = response.data.list[0].size;
      stat.mode = 0100660; // file with 660 permissions
      stat.mtime = new Date(response.data.list[0].mtime);
      stat.atime = new Date(response.data.list[0].mtime);
      stat.ctime = new Date(response.data.list[0].ctime);
      stat.uid = process.getuid();
      stat.gid = process.getgid();
    }
    cb( err, stat );
  });
}

function readdir(path, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  udm.getFileList(path, function(error, response){
    var names = [];
    var err = 0; // assume success
    if( !response.data ){
      err = fuse.ENOENT;
    }else{
      for(var fp in response.data.list){
        var filePathSplited = response.data.list[fp].path.split('/');
        var fileName = filePathSplited[filePathSplited.length - 1];
        names.push(fileName);
      }
    }
    cb( err, names );
  });
}

var toFlag = function(flags) {
  flags = flags & 3
  if (flags === 0) return 'r'
  if (flags === 1) return 'w'
  return 'r+'
}

function open(path, flags, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  udm.getFileMeta(path, function (error, response){
    var f = toFlag(flags);
    var stat = {};
    var fd = 0;
    var err = 0; // assume success
    if (f === 'r') {
      if( !response.data || !response.data.list){
        err = fuse.ENOENT;
      }else if( response.data.list[0].isdir === 1 ){
        err = fuse.EISDIR;
      }
    } else if (f === 'r+') {
      if( !response.data || !response.data.list){
        err = fuse.ENOENT;
      }else if( response.data.list[0].isdir === 1 ){
        err = fuse.EISDIR;
      }
    } else if (f === 'w') {
      //err = fuse.EPERM;
    } else {
      logger.error('Unkown flags:', flags, path);
      err = fuse.EPERM;
    }
    if (err) {
      cb(err);
    } else {
      udm.openFile(path, f, function (error, response) {
        if (error) {
          logger.error('open, openFile:', path, flags);
          logger.error('open, openFile:', error);
          cb(fuse.EPERM);
        } else {
          cb(error, response.fd);
        }
      });
    }
  });
}

function read(path, fd, buf, len, offset, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path + ' ' + len);
  udm.getFileMeta(path, function (error, response){
    var err = 0; // assume success
    if( !response.data || !response.data.list){
      err = fuse.ENOENT;
      cb( err );
    }else if( response.data.list[0].isdir == 1 ){
      // directory
      logger.error('read, is directory', path);
      err = fuse.EPERM;
      cb( err );
    }else{
      udm.downloadFileInRangeByCache(path, buf, offset, len, function(error){
        cb(len);
      });
    }
  });
}

function write(path, fd, buffer, length, position, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path + ' ' + position + ' ' + length);
  if (length !== FUSE_IOSIZE) {
    logger.error('length !== ' + FUSE_IOSIZE, length);
  }
  udm.write(path, fd, buffer, position, length, function (error, response) {
    if (error) {
      logger.error('write error:', error);
      cb(fuse.EPERM);
    } else {
      cb(response.data.length);
    }
  });
}

function release(path, fd, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path + ' ' + fd);
  udm.closeFile(path, fd, function (error, response) {
    if (error) {
      logger.error('release error:', error);
      cb(fuse.EPERM);
    } else {
      cb(0);
    }
  });
}

function create (path, mode, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  var f = toFlag(mode);
  var fd;
  udm.openFile(path, f, function (error, response) {
    if (error) {
      logger.error('open error:', error);
      cb(fuse.EPERM);
    } else {
      fd = response.fd;
      udm.createEmptyFile(path, function (error, response) {
        if (error) {
          logger.error('create error:', error);
          cb(fuse.EPERM);
        } else {
          cb(0, fd);
        }
      });
    }
  });
}

function unlink(path, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  udm.deleteFile(path, function (error, response) {
    if (error) {
      logger.error(error);
      cb(fuse.ENOENT);
    } else {
      cb(0);
    }
  });
}

function rename(src, dst, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + src + ' ' + dst);
  udm.move(src, dst, function (error, response) {
    if (error) {
      logger.error(error);
      cb(fuse.ENOENT);
    } else {
      cb(0);
    }
  });
}

function mkdir(path, mode, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path + ' ' + mode);
  udm.createFolder(path, function (error, response) {
    if (error) {
      logger.error(error);
      cb(fuse.ENOENT);
    } else {
      cb(0);
    }
  });
}

function rmdir(path, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  udm.deleteFolder(path, function (error, response) {
    if (error) {
      logger.error(error);
      cb(fuse.ENOENT);
    } else {
      cb(0);
    }
  });
}

function truncate(path, size, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  logger.info(path, size);
  if (size !== 0) {
    logger.error('truncate error: size !== 0');
    cb(fuse.EPERM);
  } else {
    cb(0);
  }
}

function utimens(path, atime, mtime, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  logger.info(path, atime, mtime);
  cb(0);
}

function chown(path, uid, gid, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  logger.info(path, uid, gid);
  cb(0);
}

function chmod(path, mode, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  logger.info(path, mode);
  cb(0);
}

function init(cb) {
  logger.info('[' + __function + ',' + __line + '] ');
  logger.info('File system started at ' + options.mountPoint);
  udm = new udManager();
  udm.init({
    moduleOpt: options.moduleOpt,
    metaCacheModule: require('./helper/MetaCache'),
    dataCacheModule: require('./helper/DataCache'),
    webStorageModule: require('./clouddrive/' + options.module)
  });
  cb();
}

function setxattr(path, name, buffer, length, offset, flags, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  logger.info('Setxattr called:', path, name, buffer, length, offset, flags);
  cb(0);
}

function statfs(path, cb) {
  logger.info('[' + __function + ',' + __line + '] ');
  udm.showStat(function(error, response){
    var block_size = 4096;
    //f_bsize = block_size;
    //f_blocks = (fsblkcnt_t) (quota/block_size);
    //f_bfree = (fsblkcnt_t) ( baidu_data->statistic_cache->f_blocks - ( used / block_size ));
    //f_bavail = baidu_data->statistic_cache->f_bfree;     // normal user should has no different

    cb(0, {
        bsize: block_size,
        //frsize: 1000000,
        blocks: (response.data.quota / block_size),
        bfree: ((response.data.quota / block_size) - (response.data.used / block_size) ),
        bavail: ((response.data.quota / block_size) - (response.data.used / block_size) ),
        //files: 1000000,
        //ffree: 1000000,
        //favail: 1000000,
        //fsid: 1000000,
        //flag: 1000000,
        namemax: 1000
    });
  });
}

function flush(path, fd, cb) {
  logger.info('[' + __function + ',' + __line + '] ' + path);
  logger.info(path, fd);
  cb(0);
}

function destroy(cb) {
  logger.info('[' + __function + ',' + __line + '] ');
  logger.info('File system stopped');
  cb();
}

var rwHandlers = {
  options: [],

  getattr: getattr,
  readdir: readdir,
  open: open,
  read: read,
  write: write,
  release: release,
  create: create,
  unlink: unlink,
  rename: rename,
  mkdir: mkdir,
  rmdir: rmdir,
  init: init,
  truncate: truncate,
  utimens: utimens,
  chown: chown,
  chmod: chmod,
  flush: flush,
  destroy: destroy,
  setxattr: setxattr,
  statfs: statfs
};

var roHandlers = {
  options: [],

  getattr: getattr,
  readdir: readdir,
  open: open,
  read: read,
  release: release,
  init: init,
  destroy: destroy,
  statfs: statfs
};

function usage() {
  console.log(
    'Usage: node udFuse.js [options] mountPoint\n' +
    '\n' +
    'Options:\n' +
    '-d                 : make FUSE print debug statements.\n' +
    '-m <module>        : specify web storage module.\n' +
    '-w                 : file writeable support.\n' +
    '-o <options>       : options for the module.\n' +
    '\n' +
    'Example:\n' +
    'node udFuse.fs -m Sample -d /tmp/mnt\n'
  );
}

function parseArgs() {
  var i, remaining;
  var args = process.argv;
  if (args.length < 3) {
    return false;
  }
  options.mountPoint = args.pop();
  options.moduleOpt = {};

  function createModuleOpt(item, index){
    var pair = item.split('=');
    var key = pair[0];
    var val = pair[1];
    options.moduleOpt[key] = val;
  }

  for( i = 2; i < args.length; i++) {
    if (args[i] === '-d') {
      options.debugFuse = true;
    } else if (args[i] === '-w') {
      options.writeable = true;
    } else if (args[i] === '-m') {
      options.module = args[++i];
    } else if (args[i] === '-o') {
      var mOpts = args[++i].split(',');
      mOpts.forEach(createModuleOpt);
    } else {
      return false;
    }
  }
  return true;
}

(function main() {
  if (parseArgs()) {
    logger.info('Mount point: ' + options.mountPoint);
    var handlers;
    if (options.writeable) {
      logger.info('Read-write File System mounted');
      handlers = rwHandlers;
      handlers.options.push('daemon_timeout=1200');
    } else {
      logger.info('Read-only File System mounted');
      handlers = roHandlers;
    }
    if (options.debugFuse) {
      logger.info('FUSE debugging enabled');
      handlers.options.push('debug');
    }
    handlers.options.push('iosize=' + FUSE_IOSIZE);
    try {
      handlers.force = true;
      fuse.mount(options.mountPoint, handlers);
    } catch (e) {
      logger.info('Exception when starting file system: ' + e);
    }
  } else {
    usage();
  }
})();

process.on('SIGINT', function () {
  fuse.unmount(options.mountPoint, function () {
    process.exit();
  });
});
