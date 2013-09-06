# subindex

Generic pluggable indexing system for leveldb/levelup.

API inspired by [node-level-mapped-index](https://github.com/rvagg/node-level-mapped-index)

Designed to be used with [level-queryengine](https://github.com/eugeneware/level-queryengine)
to create efficient searches on levelup with pluggable query languages/systems,
that require specialized indexing strategies.

Some examples of query engines that use this are:

* [jsonquery-engine](https://github.com/eugeneware/jsonquery-engine) - MongoDB query langauge implemented for levelup **WITH** indexing!
* [path-engine](https://github.com/eugeneware/path-engine) - Simple javascript object "path" syntax query langauge implemented for levelup **WITH** indexing.
* [fulltext-engine](https://github.com/eugeneware/fulltext-engine) - Query your levelup/leveldb engine using full text search phrases with INDEXES.

[![build status](https://secure.travis-ci.org/eugeneware/subindex.png)](http://travis-ci.org/eugeneware/subindex)

## Installation

Install via npm:

```
$ npm install subindex
```

## Usage

Basic usage:

``` js
var levelup = require('levelup'),
    db = levelup('my-database'),
    subindex = require('subindex');

// Add indexing functionality
db = subindex(db);

// index the name field
db.ensureIndex('name', function (key, value, emit) {
  if (value.name !== undefined) emit(value.name);
});

db.batch(insertSomeData(), function (err) {
  // search for any object that has a 'name' field with a value of 'name 42'
  // will use the index 'name', to do the lookup instead of a full levelup db scan
  db.getBy('name', 'name 42', function (err, data) {
    // drop the index
    db.dropIndex('name');
  });
});
```

Generate a stream of all the index values given search parameters:
``` js
var levelup = require('levelup'),
    db = levelup('my-database'),
    subindex = require('subindex');

// Add indexing functionality
db = subindex(db);

// index the name field
db.ensureIndex('name', function (key, value, emit) {
  if (value.name !== undefined) emit(value.name);
});

db.batch(insertSomeData(), function (err) {
  db.indexes['name'].createIndexStream()
    .on('data', console.log);
  // prints out the full stream of keys in the format:
  // { key: [indexName, indexValues..., keyOfIndexedObject], value: keyOfIndexedObject }
  // for the example above this would be:
  // { key: ['name', 'name 42', 42], value: 42 }
});
```

## API

### db.ensureIndex(indexName, [indexType], [emitFunction], [cb])

Creates an index for all newly inserted data, as well as any existing data

* `indexName` (string) - the name of the index to create
* `indexType` (string) - the 'type' of the index. Built-in types are:
    * `'property'` (default) - index the property defined by the `indexName`.
      If you don't pass in any `emitFunction` (or `indexType`) then this indexing
      strategy will be used by default.
    * `'pairs'` - used by the [pairs](https://github.com/eugeneware/pairs) module
       and [jsonquery-engine](https://github.com/eugeneware/jsonquery-engine) to
       index "pairs" of object properties to allow arbitrary object queries with
       a reasonable tradeoff between index size and query performance.
* `emitFunction(key, value, emit)` (function) - a function which is used to translate each written
  (or existing object) into an index. The function takes 3 parameters:
    * `key` - the key of the written object to be indexed
    * `value` - the value of the written object to be indexed
    * `emit(valueOrArray)` - this function is called once or multiple times with the the
      value(s) (need not be a string), that will be indexed together to reference
      the object to be indexed. The argument of the function can be a primitive
      javascript type, or an array of values. If passed an array, then these values
      will be concatenated to the index key to allow for efficient range querying using
      the excellent [bytewise](https://github.com/deanlandolt/bytewise) key codec.
* `cb` fn - a callback that gets called once all the existing data in the database has
  been completely indexed.

As the default indexing strategy is to use `'property'` which indexes javascript
object properties as defined by the index name, you can do this:

``` js
// indexes the name field of objects. eg: { name: 'bob', num: 1234 }
db.ensureIndex('name');

// indexes the address.address1 field: eg: { address: { address1: 'line 1', address2: 'line 2' } }
db.ensureIndex('address.address1');
```

It will also search for values in arrays too:

``` js
db.ensureIndex('tags');
db.batch({
  type: 'put', key: 1, values: { name: 'bob', tags: ['tag1', 'tag2', 'tag3'] },
  type: 'put', key: 2, values: { name: 'jane', tags: ['tag2', 'tag3'] },
  type: 'put', key: 3, values: { name: 't-mart', tags: ['tag1', 'tag3'] }
}, function (err) {
  // do an index lookup of all tags which have the 'tag1' tag
  db.indexes['tags'].createIndexStream({
    start: ['tag1', null],
    end: ['tag1', undefined]
  }).on('data', console.log);
  // will match the 1st and 3rd indexes
});
```

### db.dropIndex(idxName, cb)

Drops the index `idxName` and calls `cb` when finished.

## Todo

This is a work in progress, some things to be added soon:

* Don't rebuild the whole index every time the `ensureIndex` is run or make it a parameter.
* Don't store the object key in the value. Just store null or 0.
