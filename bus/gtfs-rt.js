/*
 * Minimal GTFS-Realtime (protobuf) decoder for the browser / Node.
 * Decodes only the fields this app needs from FeedMessage:
 *   - VehiclePosition (trip, position, timestamp, stop_id, current_status, vehicle)
 *   - TripUpdate (trip, stop_time_update delays, timestamp, delay)
 * No external dependencies.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GtfsRt = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function Reader(u8) {
    this.buf = u8;
    this.pos = 0;
    this.len = u8.length;
    this.view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  }

  Reader.prototype.varint = function () {
    // 64-bit varints do not fit in 32-bit shifts; accumulate with multiplication.
    var start = this.pos;
    var result = 0;
    var shift = 1;
    for (;;) {
      if (this.pos >= this.len) throw new Error("varint past end of buffer");
      var b = this.buf[this.pos++];
      result += (b & 0x7f) * shift;
      shift *= 128;
      if ((b & 0x80) === 0) break;
    }
    if (this.pos - start > 7) {
      // Long varints exceed Number precision and encode negative int32/int64
      // (e.g. a negative delay) as 64-bit two's complement: redo exactly.
      var big = 0n;
      var bshift = 0n;
      for (var i = start; i < this.pos; i++) {
        big |= BigInt(this.buf[i] & 0x7f) << bshift;
        bshift += 7n;
      }
      return Number(BigInt.asIntN(64, big));
    }
    return result;
  };

  Reader.prototype.skip = function (wireType) {
    switch (wireType) {
      case 0: this.varint(); break;
      case 1: this.pos += 8; break;
      case 2: { var n = this.varint(); this.pos += n; break; }
      case 5: this.pos += 4; break;
      default: throw new Error("unsupported wire type " + wireType);
    }
    if (this.pos > this.len) throw new Error("skip past end of buffer");
  };

  Reader.prototype.bytes = function () {
    var n = this.varint();
    if (this.pos + n > this.len) throw new Error("bytes past end of buffer");
    var out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  };

  var utf8 = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;
  Reader.prototype.string = function () {
    var b = this.bytes();
    if (utf8) return utf8.decode(b);
    return Buffer.from(b).toString("utf8");
  };

  Reader.prototype.float = function () {
    var v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  };

  Reader.prototype.double = function () {
    var v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  };

  // Walks one message's fields, dispatching on field number.
  // handler(fieldNo, wireType, reader) returns true if it consumed the value.
  function eachField(u8, handler) {
    var r = new Reader(u8);
    while (r.pos < r.len) {
      var tag = r.varint();
      var fieldNo = Math.floor(tag / 8);
      var wireType = tag & 7;
      if (!handler(fieldNo, wireType, r)) r.skip(wireType);
    }
  }

  function decodeTripDescriptor(u8) {
    var trip = {};
    eachField(u8, function (f, w, r) {
      switch (f) {
        case 1: trip.tripId = r.string(); return true;
        case 2: trip.startTime = r.string(); return true;
        case 3: trip.startDate = r.string(); return true;
        case 4: trip.scheduleRelationship = r.varint(); return true;
        case 5: trip.routeId = r.string(); return true;
        case 6: trip.directionId = r.varint(); return true;
        default: return false;
      }
    });
    return trip;
  }

  function decodePosition(u8) {
    var p = {};
    eachField(u8, function (f, w, r) {
      switch (f) {
        case 1: p.latitude = r.float(); return true;
        case 2: p.longitude = r.float(); return true;
        case 3: p.bearing = r.float(); return true;
        case 4: p.odometer = r.double(); return true;
        case 5: p.speed = r.float(); return true;
        default: return false;
      }
    });
    return p;
  }

  function decodeVehicleDescriptor(u8) {
    var v = {};
    eachField(u8, function (f, w, r) {
      switch (f) {
        case 1: v.id = r.string(); return true;
        case 2: v.label = r.string(); return true;
        case 3: v.licensePlate = r.string(); return true;
        default: return false;
      }
    });
    return v;
  }

  function decodeVehiclePosition(u8) {
    var vp = {};
    eachField(u8, function (f, w, r) {
      switch (f) {
        case 1: vp.trip = decodeTripDescriptor(r.bytes()); return true;
        case 2: vp.position = decodePosition(r.bytes()); return true;
        case 3: vp.currentStopSequence = r.varint(); return true;
        case 4: vp.currentStatus = r.varint(); return true;
        case 5: vp.timestamp = r.varint(); return true;
        case 6: vp.congestionLevel = r.varint(); return true;
        case 7: vp.stopId = r.string(); return true;
        case 8: vp.vehicle = decodeVehicleDescriptor(r.bytes()); return true;
        case 9: vp.occupancyStatus = r.varint(); return true;
        default: return false;
      }
    });
    return vp;
  }

  function decodeStopTimeEvent(u8) {
    var e = {};
    eachField(u8, function (f, w, r) {
      switch (f) {
        case 1: e.delay = r.varint(); return true;
        case 2: e.time = r.varint(); return true;
        case 3: e.uncertainty = r.varint(); return true;
        default: return false;
      }
    });
    return e;
  }

  function decodeStopTimeUpdate(u8) {
    var s = {};
    eachField(u8, function (f, w, r) {
      switch (f) {
        case 1: s.stopSequence = r.varint(); return true;
        case 2: s.arrival = decodeStopTimeEvent(r.bytes()); return true;
        case 3: s.departure = decodeStopTimeEvent(r.bytes()); return true;
        case 4: s.stopId = r.string(); return true;
        case 5: s.scheduleRelationship = r.varint(); return true;
        default: return false;
      }
    });
    return s;
  }

  function decodeTripUpdate(u8) {
    var t = { stopTimeUpdates: [] };
    eachField(u8, function (f, w, r) {
      switch (f) {
        case 1: t.trip = decodeTripDescriptor(r.bytes()); return true;
        case 2: t.stopTimeUpdates.push(decodeStopTimeUpdate(r.bytes())); return true;
        case 3: t.vehicle = decodeVehicleDescriptor(r.bytes()); return true;
        case 4: t.timestamp = r.varint(); return true;
        case 5: t.delay = r.varint(); return true;
        default: return false;
      }
    });
    return t;
  }

  function decodeEntity(u8) {
    var e = {};
    eachField(u8, function (f, w, r) {
      switch (f) {
        case 1: e.id = r.string(); return true;
        case 2: e.isDeleted = r.varint() !== 0; return true;
        case 3: e.tripUpdate = decodeTripUpdate(r.bytes()); return true;
        case 4: e.vehicle = decodeVehiclePosition(r.bytes()); return true;
        default: return false; // alerts (5) are skipped
      }
    });
    return e;
  }

  function decodeHeader(u8) {
    var h = {};
    eachField(u8, function (f, w, r) {
      switch (f) {
        case 1: h.gtfsRealtimeVersion = r.string(); return true;
        case 2: h.incrementality = r.varint(); return true;
        case 3: h.timestamp = r.varint(); return true;
        default: return false;
      }
    });
    return h;
  }

  function decodeFeedMessage(arrayBufferOrU8) {
    var u8 = arrayBufferOrU8 instanceof Uint8Array
      ? arrayBufferOrU8
      : new Uint8Array(arrayBufferOrU8);
    var feed = { header: null, entities: [] };
    eachField(u8, function (f, w, r) {
      switch (f) {
        case 1: feed.header = decodeHeader(r.bytes()); return true;
        case 2: feed.entities.push(decodeEntity(r.bytes())); return true;
        default: return false;
      }
    });
    return feed;
  }

  return { decodeFeedMessage: decodeFeedMessage };
});
