const uuidv4 = require('uuid/v4');
const hasha = require('hasha');

const fs = require('fs');

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

    if (this.precedent != undefined) {
      const jsonStr = JSON.stringify(this.precedent)

      const stringHash = await hasha(jsonStr, { algorithm: 'sha256' })

      const result = await hasha(stringHash + hash, { algorithm: 'sha256' })

      return result;
    } else {
      return hash
    }
  }

  static filename() {
    return `${uuidv4()}.png`;
  }
  filepath(filename) {
    return path.resolve(`${this.folder}/${filename}`)
  }
}
module.exports = Saver;
