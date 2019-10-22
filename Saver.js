const sharp = require('sharp');
const uuidv4 = require('uuid/v4');
const path = require('path');
const hasha = require('hasha');

class Saver {
  constructor(folder) {
    this.folder = folder;
  }
  async save(buffer) {
    const filename = Saver.filename();
    const filepath = this.filepath(filename);

    console.log(buffer)

    await sharp(buffer)
      .toFile(filepath);
    
      const hash = await hasha.fromFile(filepath, {algorithm: 'md5'})

    return hash;
  }
  static filename() {
    return `${uuidv4()}.png`;
  }
  filepath(filename) {
    return path.resolve(`${this.folder}/${filename}`)
  }
}
module.exports = Saver;
