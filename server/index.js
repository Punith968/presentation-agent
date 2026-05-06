require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const uploadRoutes = require('./routes/upload');
const narrateRoutes = require('./routes/narrate');
const qaRoutes = require('./routes/qa');

const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure necessary directories exist
['../uploads', '../audio', '../slides'].forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));
app.use('/audio', express.static(path.join(__dirname, '../audio')));
app.use('/slides', express.static(path.join(__dirname, '../slides')));

app.use('/api/upload', uploadRoutes);
app.use('/api/narrate', narrateRoutes);
app.use('/api/qa', qaRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});