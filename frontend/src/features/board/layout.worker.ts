/// <reference lib="webworker" />
// ELK's GWT worker registers its own `self.onmessage` when loaded in a worker scope.
// The main thread talks to it through elkjs/lib/elk-api (NFR-004: layout off the main thread).
import "elkjs/lib/elk-worker.min.js";
