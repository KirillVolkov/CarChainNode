
const express = require("express");
const bodyParser = require('body-parser');
const Saver = require('./Saver');
const path = require('path');
const { default: constants } = require('echojs-lib');
const { Echo, PrivateKey, Contract } = require('echojs-lib');

const mysql = require('mysql');

const con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "password",
  insecureAuth: true
});

const echo = new Echo()

const WIF = '5J3UbadSyzzcQQ7HEfTr2brhJJpHhx3NsMzrvgzfysBesutNRCm'
const ACCOUNT_NAME = 'dima'

const PORT = 3000
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const multer = require('multer');

const upload = multer({
  limits: {
    fileSize: 4 * 1024 * 1024,
  }
});

module.exports = upload

app.get("/ping", (req, res) => {
  res.status(200).send("pong");
})

// app.post('/call', async function (req, res) {
//   try {

//     const r = await callContract('1.10.187');
//     res.status(200).send(r);
//   } catch (e) {
//     res.status(500).send(e);
//   }
// })

app.post('/precedent', upload.single('photo'), async function (req, res) {
  try {

    con.query('SELECT * FROM db.car WHERE vin_hash LIKE ?', req.body.vin_hash, async function (error, car, fields) {

      console.log(car)

      if (error) {
        res.status(400).json({ status: 'fail', error: error })
      } else if (car.length == 0) {
        res.status(404).json({ status: 'fail', error: 'Car Not Found' })
      } else {
        const imagePath = path.join(__dirname, '/public/images');
        var precedent = new Precedent(req.body.id,
          req.body.vin_hash, req.body.reg_number, req.body.pass_number, req.body.distance_km, req.body.timestamp, req.body.description, req.body.data_hash
        )

        var _precedent = new _Precedent(
          req.body.vin_hash, req.body.reg_number, req.body.pass_number, req.body.distance_km, req.body.timestamp, req.body.description)

        const fileUpload = new Saver(imagePath, _precedent);
        var byteHash = ''

        if (req.file) {
          byteHash = await fileUpload.save(req.file.buffer);
        }

        if (byteHash == req.body.data_hash) {

          con.query('INSERT INTO db.precedent SET ?', precedent, function (error, results, fields) {
            if (error) {
              console.error(error)
            }
          });

          res.status(200).json({ status: 'ok' })
        } else {
          res.status(400).json({ status: 'fail', error: 'Wrong Hash. your ' + req.body.data_hash + ' server ' + byteHash })
        }
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'fail', error: error })
  }

});

app.post('/car', upload.single('photo'), async function (req, res) {
  try {

    const imagePath = path.join(__dirname, '/public/images');

    const fileUpload = new Saver(imagePath);

    var byteHash = ''

        if (req.file) {
          byteHash = await fileUpload.save(req.file.buffer);
        }

    const car = new Car(req.body.vin_hash, req.body.model, req.body.year, req.body.color, req.body.type, byteHash)
    con.query('INSERT INTO db.car SET ?', car, function (error, results, fields) {
      if (error) {
        res.status(500).json({ status: 'fail', error: error })
      } else {
        res.status(200).json({ status: 'ok' })
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'fail', error: error })
  }
});

app.get('/cars', function (req, res) {

  con.query('SELECT * FROM db.car', req.query.vin_hash, function (error, cars, fields) {
      if(error){
        res.status(500).json({ status: 'fail', error: error })
      } else {
        res.status(200).send(cars)
      }
  });
});

app.get('/car', function (req, res) {

  con.query('SELECT * FROM db.car WHERE vin_hash LIKE ?', req.query.vin_hash, function (error, car, fields) {

    if (error) {
      res.status(500).json({ status: 'fail', error: error })
    } else {
      con.query('SELECT * FROM db.precedent WHERE vin_hash LIKE ?', req.query.vin_hash, function (error, results, fields) {
        if (error) {
          res.status(500).json({ status: 'fail', error: error })
        } else {
          res.status(200).json({ car: car[0], precedents: results })
          console.log(results)
        }
      });
    }

  });
});

app.get('/precedents', function (req, res) {
  con.query('SELECT * FROM db.precedent', function (error, results, fields) {
    if (error) {
      res.status(500).json({ status: 'fail', error: error })
    } else {
      res.status(200).send(results)
      console.log(results)
    }
  });
});

app.listen(PORT, () => {
  initDatabase()
  connectEcho();
  console.log("Blockchain Server Started");
});

async function connectEcho() {
  await echo.connect('wss://testnet.echo-dev.io');
}

function initDatabase() {
  con.connect(function (err) {
    if (err) throw err;
    console.log("Connected!");
  });
}

async function callContract(contractId) {
  try {
    const contract = new Contract(require("./abi.json"), { echo, contractId: contractId });
    console.log(contract.methods)
    const result = await contract.methods.totalSupply().call();
    return result
  } catch (e) {
    console.error(e)
    return e
  }
}

class Precedent {
  constructor(id, vin_hash, reg_number, pass_number, distance_km, timestamp, description, data_hash) {
    this.id = id
    this.vin_hash = vin_hash;
    this.reg_number = reg_number;
    this.pass_number = pass_number;
    this.distance_km = distance_km;
    this.timestamp = timestamp;
    this.description = description;
    this.data_hash = data_hash
  }
}

class _Precedent {
  constructor(vin_hash, reg_number, pass_number, distance_km, timestamp, description) {
    this.vin_hash = vin_hash;
    this.reg_number = reg_number;
    this.pass_number = pass_number;
    this.distance_km = distance_km;
    this.timestamp = timestamp;
    this.description = description;
  }
}

class Car {
  constructor(vin_hash, model, year, color, type, photo_hash) {
    this.vin_hash = vin_hash;
    this.model = model;
    this.year = year;
    this.color = color;
    this.type = type;
    this.photo_hash = photo_hash
  }
}
