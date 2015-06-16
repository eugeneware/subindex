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
  var db, sub, dbPath = path.join(__dirname, '..', 'data', 'test-db');

  beforeEach(function(done) {
    rimraf.sync(dbPath);
    db = levelup(dbPath, { valueEncoding: 'json' }, done);
  });

  afterEach(function(done) {
    db.close(done);
  });

  it('should be able to create an index', function(done) {
    sub = subindex(db);

    sub.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    sub.batch(testData(), doQuery);

    function doQuery(err) {
      if (err) return done(err);
      sub.getBy('name', 'name 42', function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        done();
      });
    }
  });

  it('should be able to create an index and return multiple hits', function(done) {
    sub = subindex(db);

    sub.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    sub.batch([
      {type: 'put', key: 0, value: {name: 'foo', feature: 'awesome'}},
      {type: 'put', key: 1, value: {name: 'foo', feature: 'shy'}}
    ], doQuery);

    function doQuery(err) {
      if (err) return done(err);
      sub.getBy('name', 'foo', {limit: 2}, function (err, data) {
        if (err) return done(err);
        expect(data.length).to.equal(2);
        done();
      });
    }
  });

  it('should be able to create an index on existing data', function(done) {
    sub = subindex(db);

    sub.batch(testData(), function (err) {
      if (err) return done(err);
      sub.ensureIndex('name', function (key, value, emit) {
        if (value.name !== undefined) emit(value.name);
      }, doQuery);
    });

    function doQuery(err) {
      if (err) return done(err);
      sub.getBy('name', 'name 42', function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal('42');
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        done();
      });
    }
  });

  it('should be able to drop an index', function(done) {
    sub = subindex(db);

    sub.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    sub.batch(testData(), doQuery);

    function doQuery(err) {
      if (err) return done(err);
      sub.getBy('name', 'name 42', function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);

        sub.dropIndex('name', doQuery2);
      });
    }

    function doQuery2(err) {
      if (err) return done(err);
      sub.getBy('name', 'name 42', function (err, data) {
        expect(err.name).to.equal('NotFoundError');
        done();
      });
    }
  });

  it('should be able to create a property index with no idx function', function(done) {
    sub = subindex(db);
    sub.ensureIndex('name');
    sub.batch(testData(), doQuery);

    function doQuery() {
      sub.getBy('name', 'name 42', function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        done();
      });
    }
  });

  it('should be able to index arrays', function(done) {
    sub = subindex(db);

    sub.ensureIndex('tags', function (key, value, emit) {
      if (value.tags !== undefined) {
        if (Array.isArray(value.tags)) {
          value.tags.forEach(function (tag) {
            emit(tag);
          });
        } else
          emit(value.tags);
      }
    });

    sub.batch(testData(), doQuery);

    function doQuery() {
      sub.getBy('tags', 'tag4', function (err, data) {
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
    sub = subindex(db);

    sub.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    sub.batch(testData(), doQuery);

    function doQuery() {
      sub.getBy('name', 'name 42', function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        doDelete();
      });
    }

    function doDelete() {
      sub.del(42, function (err) {
        if (err) return done(err);
        sub.getBy('name', 'name 42', function (err, data) {
          expect(err.name).to.equal('NotFoundError');
          checkIndex();
        });
      });
    }

    function checkIndex() {
      sub.indexDb.get(encode(['name', 'name 42', 42]), function (err, data) {
        expect(err.name).to.equal('NotFoundError');
        done();
      });
    }
  });

  it('should be able to have multiple indexes', function(done) {
    sub = subindex(db);

    sub.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    sub.ensureIndex('num', function (key, value, emit) {
      if (value.num !== undefined) emit(value.num);
    });

    sub.batch(testData(), doQuery);

    function doQuery(err) {
      if (err) return done(err);
      sub.getBy('name', 'name 42', function (err, data) {
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        doQuery2();
      });
    }

    function doQuery2(err) {
      if (err) return done(err);
      sub.getBy('num', 60, function (err, data) {
        expect(data.key).to.equal(6);
        expect(data.value.name).to.equal('name 6');
        expect(data.value.num).to.equal(60);
        done();
      });
    }
  });

  it('should be able to create an indexStream', function(done) {
    sub = subindex(db);

    sub.ensureIndex('name', function (key, value, emit) {
      if (value.name !== undefined) emit(value.name);
    });

    sub.batch(testData(), doStream);

    function doStream(err) {
      if (err) return done(err);
      var num = 0;
      var is = sub.indexes['name'].createIndexStream()
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
    sub = subindex(db);

    sub.ensureIndex('*', 'pairs', function (key, value, emit) {
      if (value && typeof value === 'object' && Object.keys(value).length > 0) {
        pairs(value).forEach(function (pair) {
          emit(pair);
        });
      }
    });

    sub.batch(testData());

    process.nextTick(function () {
      sub.getBy('*', ['name', 'name 42'], function (err, data) {
        if (err) return done(err);
        expect(data.key).to.equal(42);
        expect(data.value.name).to.equal('name 42');
        expect(data.value.num).to.equal(420);
        done();
      });
    });
  });

  it('should be able to create an indexStream from pairs', function(done) {
    sub = subindex(db);

    sub.ensureIndex('*', function (key, value, emit) {
      if (value && typeof value === 'object' && Object.keys(value).length > 0) {
        pairs(value).forEach(function (pair) {
          emit(pair);
        });
      }
    });

    sub.batch(testData(), doStream);

    function doStream(err) {
      if (err) return done(err);
      var num = 0;
      var is = sub.createIndexStream('*', {
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
    sub = subindex(db);

    sub.ensureIndex('*', function (key, value, emit) {
      if (value && typeof value === 'object' && Object.keys(value).length > 0) {
        pairs(value).forEach(function (pair) {
          emit(pair);
        });
      }
    });

    sub.batch(testData(), doStream);

    function doStream(err) {
      if (err) return done(err);
      var num = 0;
      var is = sub.createIndexStream('*', {
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
