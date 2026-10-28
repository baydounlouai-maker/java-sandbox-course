// Runs and marks exam code off the main thread, so an endless loop can't freeze the page.
import { questionById } from './questions.js';
import { gradeCode, runForStudent } from './grade.js';

self.onmessage = (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'run') self.postMessage({ reqId: msg.reqId, ...runForStudent(msg.code) });
    else if (msg.type === 'grade') self.postMessage({ reqId: msg.reqId, ...gradeCode(questionById(msg.id), msg.code) });
  } catch (e) {
    self.postMessage({ reqId: msg.reqId, type: 'crash', message: String(e && e.stack || e) });
  }
};
