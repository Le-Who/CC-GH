import express from 'express';

const app = express();

const mockRes = {
  statusCode: 200,
  _headers: {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  setHeader(name, val) {
    this._headers[name] = val;
  },
  getHeader(name) {
    return this._headers[name];
  },
  json(data) {
    console.log("json called with data:", data);
    console.log("mockRes.statusCode is currently:", this.statusCode);
  },
  send(data) {
    console.log("send called with:", data);
    console.log("mockRes.statusCode is currently:", this.statusCode);
  }
};

app.post('/test', (req, res) => {
  res.json({ success: true });
});

app.handle({ url: '/test', method: 'POST', query: {} }, mockRes, (err) => {
  console.log("app.handle completed with err:", err);
});
