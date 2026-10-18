'use strict';

function createMemoryExporter() {
  const spans = [];
  return {
    export(exportedSpans, callback) {
      spans.push(...exportedSpans);
      callback({ code: 0 });
    },
    shutdown() {
      return Promise.resolve();
    },
    getFinishedSpans() {
      return spans;
    },
  };
}

module.exports = { createMemoryExporter };
