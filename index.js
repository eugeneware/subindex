var bytewise = require('byteup')(),
    sublevel = require('level-sublevel'),
    hooks = require('level-hooks'),
    through = require('through'),
    deleteRange = require('level-delete-range');

function encode(key) {
  return bytewise.encode(key).toString('hex');
}

function decode(key) {
  return bytewise.decode(new Buffer(key, 'hex'));
}

module.exports = levelIndex;
function levelIndex(db) {
  db = sublevel(db);
  hooks(db);

  if (!db.ensureIndex) {
    db.ensureIndex = ensureIndex.bind(db);
  }

  if (!db.dropIndex) {
    db.dropIndex = dropIndex.bind(db);
  }

  if (!db.getBy) {
    db.getBy = getBy.bind(db);
  }

  if (!db.createIndexStream) {
    db.createIndexStream = createIndexStream.bind(db);
  }

  if (!db.indexes && !db.indexDb) {
    db.indexDb = db.sublevel('indexes');
    db.indexes = {};
  }

  return db;
}

function createIndexStream(idxName, options) {
  var db = this;

  options = options || {};
  options.start = options.start || [ null ];
  options.end = options.end || [ undefined ];
  options.start = encode([idxName].concat(options.start));
  options.end = encode([idxName].concat(options.end));

  return db.indexDb.createReadStream(options).pipe(through(function (data) {
    this.queue({ key: decode(data.key), value: data.value });
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

function ensureIndex(idxName) {
  var idxType, emit, cb;
  var db = this;
  var args = [].slice.call(arguments).slice(1);
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
    createIndexStream: createIndexStream.bind(db, idxName)
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
      db.indexDb.put(encode([idxName].concat(valueToIndex).concat(dataToIndex.key)), dataToIndex.key, function (err) {
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

function dropIndex(idxName, cb) {
  cb = cb || function () {};
  var db = this;
  deleteRange(db.indexDb, {
    start: encode([idxName, null]),
    end: encode([idxName, undefined])
  }, cb);
}

function getBy(index, key, cb) {
  var db = this;
  if (!Array.isArray(key)) key = [key];
  var hits = 0;
  db.createIndexStream(index, { start: key.concat(null), end: key.concat(undefined), limit: 1 })
    .on('data', function (data) {
      hits++;
      db.get(data.value, function (err, value) {
        cb(err, { key: data.value, value: value });
      });
    })
    .on('error', function (err) {
      cb(err);
    })
    .on('end', function () {
      if (hits === 0) cb({name: 'NotFoundError', message: 'Could not find value based on key: ' + key.toString()});
    });
}

function noop() {}
