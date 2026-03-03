const http = require('http');

const data = JSON.stringify({
  name: 'Juan Perez'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/guests',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'x-auth-token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3MjQ5MjU2NCwiZXhwIjoxNzcyNDk2MTY0fQ.ZoqutpVZc6fBOfwAtVdLxY5xZfQNlfRNatQj5RuaDeQ'
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);

  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
