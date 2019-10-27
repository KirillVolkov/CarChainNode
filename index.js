const express = require("express");
const bodyParser = require('body-parser');
const Saver = require('./Saver');
const path = require('path');
const fs = require('fs');
const hasha = require('hasha');

const { default: constants } = require('echojs-lib');
const { Echo, PrivateKey, Contract, aes, ED25519, encode } = require('echojs-lib');

const clc = require('cli-color');

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

const privateKey = PrivateKey.fromWif(WIF)

const PORT = 3000
const app = express();

const DEFAULT = 0;
const SUBSCRIBER = 1;
const TRUSTED = 2

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

/**
 * Check user role in SmartContract
 * @param req [Request]
 * @param expectedRole [DEFAULT, SUBSCRIBER, TRUSTED]
 */
async function checkRole(req, expectedRole) {
  const id = req.get('X-PR-ID-AUTH')
  if (id === undefined) {
    return false
  }
  const contract = new Contract(require("./abi.json"), { echo, contractId: '1.10.219' });
  const result = await contract.methods.getRole(id).call();
  console.log('YOUR ROLE IS ' + result)
  console.log('EXPECTED ROLE IS ' + expectedRole)
  return result >= expectedRole
}

async function getCarInfo(car_id) {
  if (car_id == undefined) {
    return false
  }
  const contract = new Contract(require("./abi.json"), { echo, contractId: '1.10.219' });
  const result = await contract.methods.getCarInfo(car_id).call({ accountId: '1.2.16' });
  return result;
}

async function getPrecedentInfo(car_id, precedent_id) {
  if (precedent_id == undefined) {
    return false
  }
  const contract = new Contract(require("./abi.json"), { echo, contractId: '1.10.219' });

  const result = await contract.methods.getCarPrecendent(car_id, precedent_id).call({ accountId: '1.2.16' });
  return result;
}

/**
 * [GET] Get photo by its hash
 * @param hash (in path)
 */
app.get('/photo/*', function (req, res) {
  try {
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
  } catch (error) {
    res.status(500).json({ status: 'fail', error: error.message })
  }
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
    authOrError(req)

    if (await checkRole(req, TRUSTED)) {

      console.log('user trust checked')
      console.log('PRECEDENT_ID: ' + req.body.precedent_id)

      const _precedent = new _Precedent(
        req.body.vin_hash, req.body.reg_number, req.body.pass_number, req.body.distance_km, req.body.timestamp, req.body.description)

      const precedentCheckSum = await getObjectCheckSum(_precedent)
      console.log('PRECEDENT CHECKSUM ' + precedentCheckSum)
      const blockchainCheckSum = await getPrecedentInfo(req.body.vin_hash, req.body.precedent_id)
      console.log('BLOCKCHAIN CHECKSUM ' + blockchainCheckSum)
      if (blockchainCheckSum == precedentCheckSum) {
        console.log('checksum matched')
        const car = await dbQuery('SELECT * FROM db.car WHERE vin_hash LIKE ?', req.body.vin_hash)
        if (car.length == 0) {
          res.status(404).json({ status: 'fail', error: 'Car Not Found' })
        } else {
          const imagePath = path.join(__dirname, '/public/images');
          var precedent = new Precedent(
            req.body.id,
            req.body.vin_hash, 
            req.body.reg_number, 
            req.body.pass_number, 
            req.body.distance_km, 
            req.body.timestamp, 
            req.body.description, 
            req.body.data_hash,
            req.body.precedent_id
          )
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
      } else {
        res.status(404).json({ status: 'fail', error: 'Precedent info not matched with Blockchain' })
      }
    } else {
      res.status(403).json({ status: 'fail', error: 'You don\'t have access to this query' })
    }
  } catch (error) {
    console.log(error)
    res.status(500).json({ status: 'fail', error: error.message })
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
    authOrError(req)

    if (await checkRole(req, TRUSTED)) {
      const _car = new _Car(req.body.vin_hash, req.body.model, req.body.year, req.body.color, req.body.type)
      const carCheckSum = await getObjectCheckSum(_car)
      const blockchainCheckSum = await getCarInfo(req.body.vin_hash)
      if (blockchainCheckSum == carCheckSum) {
        const imagePath = path.join(__dirname, '/public/images');
        const fileUpload = new Saver(imagePath, _car);
        var byteHash = ''
        if (req.file) {
          byteHash = await fileUpload.save(req.file.buffer);
        }
        const car = new Car(req.body.vin_hash, req.body.model, req.body.year, req.body.color, req.body.type, byteHash)
        if (byteHash == req.body.data_hash) {
          const result = await dbQuery('INSERT INTO db.car SET ?', car)
          res.status(200).json({ status: 'ok' })
        } else {
          res.status(400).json({ status: 'fail', error: 'Wrong Hash. your ' + req.body.data_hash + ' server ' + byteHash })
        }
      } else {
        res.status(404).json({ status: 'fail', error: 'Car info not matched with Blockchain. Server CheckSum:' + carCheckSum + ' Blockchain CheckSum: ' + blockchainCheckSum })
      }
    } else {
      res.status(403).json({ status: 'fail', error: 'You don\'t have access to this query' })
    }
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 'fail',  error: error.message })
  }
});

async function getObjectCheckSum(obj) {
  const jsonStr = JSON.stringify(obj)
  const stringHash = await hasha(jsonStr, { algorithm: 'sha256' })
  return stringHash
}

/**
 * [GET] Getting list of cars in service
 */
app.get('/cars', async function (req, res) {
  try {
    authOrError(req)
    if (await checkRole(req, DEFAULT)) {
      const cars = await dbQuery('SELECT * FROM db.car', req.query.vin_hash);
      res.status(200).send(cars)
    } else {
      res.status(403).json({ status: 'fail', error: 'You don\'t have access to this query' })
    }
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 'fail', error: error.message })
  }
});

/**
 * [GET] Gets car with precedents
 * @param vin_hash [String]
 */
app.get('/car', async function (req, res) {
  try {
    authOrError(req)
    if (await checkRole(req, SUBSCRIBER)) {
      const car = await dbQuery('SELECT * FROM db.car WHERE vin_hash LIKE ?', req.query.vin_hash)
      if (car.length == 0) {
        res.status(404).json({ status: 'fail', error: 'Car not found' })
      } else {
        const precedents = await dbQuery('SELECT * FROM db.precedent WHERE vin_hash LIKE ?', req.query.vin_hash)
        res.status(200).json({ car: car[0], precedents: precedents })
      }
    } else {
      res.status(403).json({ status: 'fail', error: 'You don\'t have access to this query' })
    }
  } catch (error) {
    console.error(error)
    res.status(500).json({ status: 'fail', error: error.message })
  }
});

/**
 * [GET] Gets precedents by car's vin_hash
 * @param vin_hash [String]
 */
app.get('/precedents', async function (req, res) {
  try {
    authOrError(req)

    if (await checkRole(req, SUBSCRIBER)) {
      con.query('SELECT * FROM db.precedent', function (error, results, fields) {
        if (error) {
          res.status(500).json({ status: 'fail', error: error.message })
        } else {
          res.status(200).send(results)
        }
      });
    } else {
      res.status(403).json({ status: 'fail', error: 'You don\'t have access to this query' })
    }
  } catch (error) {
    res.status(500).json({ status: 'fail', error: error.message })
  }
});

app.listen(PORT, async function () {
  await connectEcho();
  console.log(clc.magenta(clc.redBright('CarChain') + ' Server Started...'));
  initDatabase()
});

async function connectEcho() {
  await echo.connect('wss://testnet.echo-dev.io');
}

function initDatabase() {
  con.connect(function (err) {
    if (err) throw err;
    console.log(clc.magenta(clc.redBright('CarChain') + ' Database Connected!'));
  });
}

function authOrError(req) {
  const key = req.get('X-PR-KEY-AUTH')
  const signature = req.get('X-PR-MESS-AUTH')
  const id = req.get('X-PR-ID-AUTH')
  console.log(clc.blue('Attempt to request ' + clc.green(req.path) + ' with key: ' + clc.green(key)))
  if (key == undefined || signature == undefined) {
    throw error('Key Not Found')
  }
  const validationResult = validateSignature(signature, key, id)
  if (validationResult) {
    console.log('Signature ' + clc.green(signature) + ' validated');
  } else {
    throw error('Signature are not validated')
  }
}

function validateSignature(signature, pubAddr, id) {
  const bufferSignature = Buffer.from(signature, 'hex')
  const bufferPublicKey = Buffer.from(pubAddr, 'hex')
  const bufferId = Buffer.from(id)
  const status = ED25519.verifyMessage(bufferSignature, bufferId, bufferPublicKey)
  return status
}

String.prototype.hexDecode = function () {
  var j;
  var hexes = this.match(/.{1,4}/g) || [];
  var back = "";
  for (j = 0; j < hexes.length; j++) {
    back += String.fromCharCode(parseInt(hexes[j], 16));
  }
  return back
}



class Precedent {
  constructor(id, vin_hash, reg_number, pass_number, distance_km, timestamp, description, data_hash, precedent_id) {
    this.id = id
    this.vin_hash = vin_hash;
    this.reg_number = reg_number;
    this.pass_number = pass_number;
    this.distance_km = distance_km;
    this.timestamp = timestamp;
    this.description = description;
    this.data_hash = data_hash
    this.precedent_id = precedent_id
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

class _Car {
  constructor(vin_hash, model, year, color, type) {
    this.vin_hash = vin_hash;
    this.model = model;
    this.year = year;
    this.color = color;
    this.type = type;
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