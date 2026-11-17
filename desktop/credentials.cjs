const fs = require("node:fs");
const allowed = new Set(["gemini", "groq", "openrouter"]);
class Credentials {
  constructor(file, safeStorage) {
    this.file = file;
    this.storage = safeStorage;
  }
  available() {
    return (
      this.storage.isEncryptionAvailable() &&
      this.storage.getSelectedStorageBackend?.() !== "basic_text"
    );
  }
  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      return {};
    }
  }
  get(provider) {
    if (!allowed.has(provider) || !this.available()) return "";
    try {
      const encrypted = this.read()[provider];
      return encrypted
        ? this.storage.decryptString(Buffer.from(encrypted, "base64"))
        : "";
    } catch {
      return "";
    }
  }
  set(provider, key) {
    if (
      !allowed.has(provider) ||
      typeof key !== "string" ||
      key.length > 4096 ||
      /[\r\n]/.test(key)
    )
      throw new Error("Invalid provider key.");
    if (!this.available())
      throw new Error(
        "OS encryption is unavailable. Keys cannot be saved on this computer.",
      );
    const data = this.read();
    if (key)
      data[provider] = this.storage.encryptString(key).toString("base64");
    else delete data[provider];
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(this.file + ".tmp", this.file);
    return { hasKey: Boolean(key) };
  }
}
module.exports = { Credentials };
