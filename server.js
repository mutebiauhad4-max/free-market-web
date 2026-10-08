const express = require('express');
const path = require('path');
const app = express();
const aiRouter = require('./server/ai');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));
app.use('/api/ai', aiRouter);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CAMPUS MARKET running on port ${PORT}`));
