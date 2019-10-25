const uuidv4 = require('uuid/v4');
const hasha = require('hasha');
const path = require('path');
const fs = require('fs');
const util = require('util');
require('util.promisify').shim();

const rename = util.promisify(fs.rename);

class Saver {
  constructor(folder, precedent) {
    this.precedent = precedent;
    this.folder = folder;
  }
  async save(buffer) {
    const filename = Saver.filename();
    const filepath = this.filepath(filename);
    fs.writeFileSync(filepath, buffer)
    const hash = await hasha.fromFile(filepath, { algorithm: 'sha256' })
    var result = ''
    if (this.precedent != undefined) {
      const jsonStr = JSON.stringify(this.precedent)

      const stringHash = await hasha(jsonStr, { algorithm: 'sha256' })

      result = await hasha(stringHash + hash, { algorithm: 'sha256' })

    } else {
      result = hash
    }

    await rename(filepath, this.filepath(result + '.png'));

    return result;

  }

  static filename() {
    return `${uuidv4()}.png`;
  }
  filepath(filename) {
    return path.resolve(`${this.folder}/${filename}`)
  }
}
module.exports = Saver;
