const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/bartender/drink/220d2833-b2d2-4aff-8822-aff5d672e4ae',
  method: 'POST',
  headers: {
    'x-auth-token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3MjQ5MjU2NCwiZXhwIjoxNzcyNDk2MTY0fQ.ZoqutpVZc6fBOfwAtVdLxY5xZfQNlfRNatQj5RuaDeQ'
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);

  let data = '';
  res.on('data', d => {
    data += d;
  });
  res.on('end', () => {
    console.log(JSON.parse(data));
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
