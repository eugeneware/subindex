var expect = require('chai').expect,
    bytewise = require('bytewise'),
    levelup = require('levelup'),
    path = require('path'),
    subindex = require('../index'),
    pairs = require('pairs'),
    rimraf = require('rimraf');

function encode(key) {
  return bytewise.encode(key).toString('hex');
}

function decode(key) {
  return bytewise.decode(new Buffer(key, 'hex'));
}

function log() {
  console.error.apply(console, [].slice.apply(arguments));
}

describe('level-index', function() {
  var db, dbPath = path.join(__dirname, '..', 'data', 'test-db');

  beforeEach(function(done) {
    rimraf.sync(dbPath);
    db = levelup(dbPath, { valueEncoding: 'json' }, done);
  });

  afterEach(function(done) {
    db.close(done);
  });

  it('should be able to create an index', function(done) {
    db = subindex(db);

    db.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    db.batch(testData(), doQuery);

    function doQuery(err) {
      if (err) return done(err);
      db.getBy('name', 'name 42', function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        done();
      });
    }
  });

  it('should be able to create an index and return multiple hits', function(done) {
    db = subindex(db);

    db.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    db.batch([
      {type: 'put', key: 0, value: {name: 'foo', feature: 'awesome'}},
      {type: 'put', key: 1, value: {name: 'foo', feature: 'shy'}}
    ], doQuery);

    function doQuery(err) {
      if (err) return done(err);
      db.getBy('name', 'foo', {limit: 2}, function (err, data) {
        if (err) return done(err);
        expect(data.length).to.equal(2);
        done();
      });
    }
  });

  it('should be able to create an index on existing data', function(done) {
    db = subindex(db);

    db.batch(testData(), function (err) {
      if (err) return done(err);
      db.ensureIndex('name', function (key, value, emit) {
        if (value.name !== undefined) emit(value.name);
      }, doQuery);
    });

    function doQuery(err) {
      if (err) return done(err);
      db.getBy('name', 'name 42', function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal('42');
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        done();
      });
    }
  });

  it('should be able to drop an index', function(done) {
    db = subindex(db);

    db.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    db.batch(testData(), doQuery);

    function doQuery(err) {
      if (err) return done(err);
      db.getBy('name', 'name 42', function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);

        db.dropIndex('name', doQuery2);
      });
    }

    function doQuery2(err) {
      if (err) return done(err);
      db.getBy('name', 'name 42', function (err, data) {
        expect(err.name).to.equal('NotFoundError');
        done();
      });
    }
  });

  it('should be able to create a property index with no idx function', function(done) {
    db = subindex(db);
    db.ensureIndex('name');
    db.batch(testData(), doQuery);

    function doQuery() {
      db.getBy('name', 'name 42', function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        done();
      });
    }
  });

  it('should be able to index arrays', function(done) {
    db = subindex(db);

    db.ensureIndex('tags', function (key, value, emit) {
      if (value.tags !== undefined) {
        if (Array.isArray(value.tags)) {
          value.tags.forEach(function (tag) {
            emit(tag);
          });
        } else
          emit(value.tags);
      }
    });

    db.batch(testData(), doQuery);

    function doQuery() {
      db.getBy('tags', 'tag4', function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        expect(data.value.tags).to.include('tag4');
        done();
      });
    }
  });

  it('should be able to handle index deletions', function(done) {
    db = subindex(db);

    db.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    db.batch(testData(), doQuery);

    function doQuery() {
      db.getBy('name', 'name 42', function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        doDelete();
      });
    }

    function doDelete() {
      db.del(42, function (err) {
        if (err) return done(err);
        db.getBy('name', 'name 42', function (err, data) {
          expect(err.name).to.equal('NotFoundError');
          checkIndex();
        });
      });
    }

    function checkIndex() {
      db.indexDb.get(encode(['name', 'name 42', 42]), function (err, data) {
        expect(err.name).to.equal('NotFoundError');
        done();
      });
    }
  });

  it('should be able to have multiple indexes', function(done) {
    db = subindex(db);

    db.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    db.ensureIndex('num', function (key, value, emit) {
      if (value.num !== undefined) emit(value.num);
    });

    db.batch(testData(), doQuery);

    function doQuery(err) {
      if (err) return done(err);
      db.getBy('name', 'name 42', function (err, data) {
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        doQuery2();
      });
    }

    function doQuery2(err) {
      if (err) return done(err);
      db.getBy('num', 60, function (err, data) {
        expect(data.key).to.equal(6);
        expect(data.value.name).to.equal('name 6');
        expect(data.value.num).to.equal(60);
        done();
      });
    }
  });

  it('should be able to create an indexStream', function(done) {
    db = subindex(db);

    db.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    db.batch(testData(), doStream);

    function doStream(err) {
      if (err) return done(err);
      var num = 0;
      var is = db.indexes['name'].createIndexStream()
        .on('data', function (data) {
          expect(data.key[0]).to.equal('name');
          expect(data.key[1]).to.equal('name ' + data.value);
          num++;
        })
        .on('end', function () {
          expect(num).to.equal(99);
          done();
        });
    }
  });

  it('should be able to index pairs', function(done) {
    db = subindex(db);

    db.ensureIndex('*', 'pairs', function (key, value, emit) {
      if (value && typeof value === 'object' && Object.keys(value).length > 0) {
        pairs(value).forEach(function (pair) {
          emit(pair);
        });
      }
    });

    db.batch(testData());

    process.nextTick(function () {
      db.getBy('*', ['name', 'name 42'], function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        done();
      });
    });
  });

  it('should be able to create an indexStream from pairs', function(done) {
    db = subindex(db);

    db.ensureIndex('*', function (key, value, emit) {
      if (value && typeof value === 'object' && Object.keys(value).length > 0) {
        pairs(value).forEach(function (pair) {
          emit(pair);
        });
      }
    });

    db.batch(testData(), doStream);

    function doStream(err) {
      if (err) return done(err);
      var num = 0;
      var is = db.createIndexStream('*', {
          start: ['name', 'name 42', null],
          end: ['name', 'name 42', undefined]
        })
        .on('data', function (data) {
          expect(data).to.deep.equals(
            { key: [ '*', 'name', 'name 42', 42 ], value: 42 });
          num++;
        })
        .on('end', function () {
          expect(num).to.equal(1);
          done();
        });
    }
  });

  it('should be able to find array items', function(done) {
    db = subindex(db);

    db.ensureIndex('*', function (key, value, emit) {
      if (value && typeof value === 'object' && Object.keys(value).length > 0) {
        pairs(value).forEach(function (pair) {
          emit(pair);
        });
      }
    });

    db.batch(testData(), doStream);

    function doStream(err) {
      if (err) return done(err);
      var num = 0;
      var is = db.createIndexStream('*', {
          start: ['tags', 'tag1', null],
          end: ['tags', 'tag1', undefined]
        })
        .on('data', function (data) {
          expect(data.key[1]).to.equal('tags');
          expect(data.key[2]).to.equal('tag1');
          num++;
        })
        .on('end', function () {
          expect(num).to.equal(100);
          done();
        });
    }
  });
});

function testData() {
  var batch = [];
  for (var i = 0; i < 100; i++) {
    var obj = {
      name: 'name ' + i,
      car: {
        make: 'Toyota',
        model: i % 2 ? 'Camry' : 'Corolla',
        year: 1993 + i
      },
      pets: [
        { species: 'Cat', breed: i == 50 ? 'Saimese' : 'Burmese' },
        { species: 'Cat', breed: 'DSH' },
        { species: 'Dog', breed: 'Dalmation' }
      ],
      tags: [
        'tag1', 'tag2', 'tag3'
      ],
      num: 10*i
    };
    if (i === 42) {
      obj.tags.push('tag4');
    }
    if (i === 84) {
      delete obj.name;
    }
    batch.push({ type: 'put', key: i, value: obj });
  }

  return batch;
}
