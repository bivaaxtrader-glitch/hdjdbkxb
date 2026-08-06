const http = require('http');
const server = http.createServer((req, res) => {
  res.end('ok');
});
server.listen(3000, '0.0.0.0', () => {
  console.log('Listening on 3000');
});
