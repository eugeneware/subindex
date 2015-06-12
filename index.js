var bytewise = require('bytewise'),
    sublevel = require('level-sublevel'),
    hooks = require('level-hooks'),
    through2 = require('through2'),
    deleteRange = require('level-delete-range');

var defaults = require('lodash.defaults');

function encode(key) {
  return Buffer.prototype.toString.call(bytewise.encode(key), 'hex');
}

function decode(key) {
  return bytewise.decode(new Buffer(key, 'hex'));
}

module.exports = levelIndex;
function levelIndex(db) {
  db = sublevel(db);
  hooks(db);

  if (!db.ensureIndex) {
    db.ensureIndex = ensureIndex.bind(null, db);
  }

  if (!db.dropIndex) {
    db.dropIndex = dropIndex.bind(null, db);
  }

  if (!db.getBy) {
    db.getBy = getBy.bind(null, db);
  }

  if (!db.createIndexStream) {
    db.createIndexStream = createIndexStream.bind(null, db);
  }

  if (!db.indexes && !db.indexDb) {
    db.indexDb = db.sublevel('indexes');
    db.indexes = {};
  }

  return db;
}

function createIndexStream(db, idxName, options) {
  options = options || {};
  options.start = options.start || [ null ];
  options.end = options.end || [ undefined ];
  options.start = encode([idxName].concat(options.start));
  options.end = encode([idxName].concat(options.end));

  return db.indexDb.createReadStream(options)
  .pipe(through2.obj(function (data, enc, callback) {
    callback(null, { key: decode(data.key), value: data.value });
  }));
}

function fetchProp(obj, path) {
  while (path.length > 0) {
    var prop = path.shift();
    if (obj[prop] !== undefined) {
      obj = obj[prop];
    } else {
      return;
    }
  }
  return obj;
}

function propertyIndex(prop) {
  return function (key, value, emit) {
    var val;
    if (value && prop && (val = fetchProp(value, prop.split('.'))) !== undefined) {
      if (Array.isArray(val)) {
        val.forEach(function (item) {
          emit(item);
        });
      } else {
        emit(val);
      }
    }
  };
}

function ensureIndex(db, idxName) {
  var idxType, emit, cb;
  var args = [].slice.call(arguments).slice(2);
  var arg = args.shift();
  if (arg !== undefined && typeof arg === 'string') {
    idxType = arg;
    arg = args.shift();
  }

  if (arg !== undefined && (arg.length > 1 || args.length)) {
    emit = arg;
    arg = args.shift();
  } else {
    emit = undefined;
  }

  if (arg !== undefined) {
    cb = arg;
  }

  if (emit === undefined) {
    emit = propertyIndex(idxName);
    idxType = 'property';
  }
  idxType = idxType || 'unspecified';
  cb = cb || noop;

  var options = {
    name: idxName,
    type: idxType,
    createIndexStream: createIndexStream.bind(null, db, idxName)
  };
  db.indexes[idxName] = options;
  db.hooks.pre(
    { start: '\x00', end: '\xFF' },
    function (change, add, batch) {
      if (change.type === 'put') {
        addToIndex(change);
      } else if (change.type === 'del') {
        db.get(change.key, function (err, value) {
          emit.call(db, change.key, value, function (valueToIndex) {
            db.indexDb.del(encode([idxName].concat(valueToIndex).concat(change.key)));
          }, options);
        });
      }
    });

  var ended = false;
  var count = 0;

  function addToIndex(dataToIndex, cb) {
    cb = cb || noop;
    emit.call(db, dataToIndex.key, dataToIndex.value, function (valueToIndex) {
      count++;
      db.indexDb.put(encode([idxName].concat(valueToIndex).concat(dataToIndex.key)),
          dataToIndex.key,
        function (err) {
          count--;
          cb(err);
        });
    }, options);
  }

  db.createReadStream()
    .on('data', function write(dataToIndex) {
        addToIndex(dataToIndex, function (err) {
          if (count === 0 && ended) cb();
        });
      })
    .on('end', function end() {
        ended = true;
        if (count === 0) cb();
    });
}

function dropIndex(db, idxName, cb) {
  cb = cb || function () {};
  deleteRange(db.indexDb, {
    start: encode([idxName, null]),
    end: encode([idxName, undefined])
  }, cb);
}

function getBy(db, index, key, options, cb) {
  if ('function' == typeof options) {
    cb = options;
    options = {};
  }

  if (!Array.isArray(key)) key = [key];
  var hits = 0;
  var all = [];
  var streamOpts = defaults(options, { start: key.concat(null), end: key.concat(undefined), limit: 1 });
  db.createIndexStream(index, streamOpts)
  .pipe(through2.obj(function (data, enc, callback) {
    db.get(data.value, function (err, value) {
      callback(null, { key: data.value, value: value });
    });
  }))
  .on('data', function (data) {
      hits++;
      all.push(data);
    })
    .on('error', function (err) {
      cb(err);
    })
    .on('end', function () {
      if (hits === 0) {
        return cb({name: 'NotFoundError', message: 'Could not find value based on key: ' + key.toString()});
      }
      return cb(null, all.length > 1 ? all : all[0]);
    });
}

function noop() {}
