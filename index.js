
const express = require("express");
const bodyParser = require('body-parser');
const Saver = require('./Saver');
const path = require('path');
const fs = require('fs');
const { default: constants } = require('echojs-lib');
const { Echo, PrivateKey, Contract } = require('echojs-lib');

const mysql = require('mysql');
const util = require('util');
require('util.promisify').shim();

const con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "password",
  insecureAuth: true
});

const dbQuery = util.promisify(con.query).bind(con);

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

/**
 * For API availability
 */
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

/**
 * [GET] Get photo by its hash
 * @param hash (in path)
 */
app.get('/photo/*', function (req, res) {
  const hash = req.path.toString().split('/').pop()
  const imagePath = path.join(__dirname, '/public/images');
  const fullpath = path.resolve(`${imagePath}/${hash + '.png'}`)
  fs.exists(fullpath, function (exists) {
    if (exists) {
      res.download(fullpath)
    } else {
      res.status(404).json({ status: 'fail', error: 'Photo Not Found' })
    }
  });

});

/**
 * [POST] Creates precedent for a car
 * @param photo [File]
 * @param id [String]
 * @param vin_hash [String]
 * @param data_hash [String]
 * @param reg_number [String]
 * @param pass_number [String]
 * @param distance_km [Int]
 * @param timestamp [Long]
 * @param description [String]
 */
app.post('/precedent', upload.single('photo'), async function (req, res) {
  try {
    const car = await dbQuery('SELECT * FROM db.car WHERE vin_hash LIKE ?', req.body.vin_hash)
    if (car.length == 0) {
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
        const result = await dbQuery('INSERT INTO db.precedent SET ?', precedent)
        res.status(200).json({ status: 'ok' })
      } else {
        res.status(400).json({ status: 'fail', error: 'Wrong Hash. your ' + req.body.data_hash + ' server ' + byteHash })
      }
    }
  } catch (error) {
    res.status(500).json({ status: 'fail', error: error })
  }
});

/**
 * [POST] Add car to service with car photo
 * @param photo [File]
 * @param vin_hash [String]
 * @param model [String]
 * @param year [Int]
 * @param color [String]
 * @param type [String]
 */
app.post('/car', upload.single('photo'), async function (req, res) {
  try {
    const imagePath = path.join(__dirname, '/public/images');
    const fileUpload = new Saver(imagePath);
    var byteHash = ''
    if (req.file) {
      byteHash = await fileUpload.save(req.file.buffer);
    }
    const car = new Car(req.body.vin_hash, req.body.model, req.body.year, req.body.color, req.body.type, byteHash)
    const result = await dbQuery('INSERT INTO db.car SET ?', car)
    res.status(200).json({ status: 'ok' })
  } catch (error) {
    res.status(500).json({ status: 'fail', error: error })
  }
});

/**
 * [GET] Getting list of cars in service
 */
app.get('/cars', async function (req, res) {
  try {
    const cars = await dbQuery('SELECT * FROM db.car', req.query.vin_hash);
    res.status(200).send(cars)
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 'fail', error: error })
  }
});

/**
 * [GET] Gets car with precedents
 * @param vin_hash [String]
 */
app.get('/car', async function (req, res) {
  try {
    const car = await dbQuery('SELECT * FROM db.car WHERE vin_hash LIKE ?', req.query.vin_hash)
    if (car.length == 0) {
      res.status(404).json({ status: 'fail', error: 'Car not found' })
    } else {
      const precedents = await dbQuery('SELECT * FROM db.precedent WHERE vin_hash LIKE ?', req.query.vin_hash)
      res.status(200).json({ car: car[0], precedents: precedents })
    }
  } catch (error) {
    res.status(500).json({ status: 'fail', error: error })
  }
});

/**
 * [GET] Gets precedents by car's vin_hash
 * @param vin_hash [String]
 */
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
  console.log("+ Server Started");
});

async function connectEcho() {
  await echo.connect('wss://testnet.echo-dev.io');
}

function initDatabase() {
  con.connect(function (err) {
    if (err) throw err;
    console.log("+ Database Connected!");
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
