const express = require("express");
const bodyParser = require('body-parser');
const Saver = require('./Saver');
const path = require('path');

const PORT = 3000
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

const multer = require('multer');

const upload = multer({
  limits: {
    fileSize: 4 * 1024 * 1024,
  }
});

module.exports = upload

app.get("/ping", (req, res)=> {
  res.send("pong")
})

app.post('/photo', upload.single('photo'), async function (req, res) {
  const imagePath = path.join(__dirname, '/public/images');
  const fileUpload = new Saver(imagePath);
  if (!req.file) {
    res.status(401).json({error: 'Please provide an image'});
  }
  const byteHash = await fileUpload.save(req.file.buffer);
  return res.status(200).json({ hash: byteHash });
});

app.listen(PORT, () => {
  console.log("Blockchain Server Started");
});
