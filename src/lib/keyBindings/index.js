import KeyBindingsList from "./list.js";
import fsOperation from "fileSystem";
import Url from "utils/Url";
import helpers from "utils/helpers";

/**
 * Manages key bindings for the editor, including initialization, updates, and persistence
 * @class KeyBindings
 */
class KeyBindings {
  #initialized = false;
  #on = {
    update: [],
    "update:after": [],
    reset: []
  };

  #defaultKeyBindings = structuredClone(KeyBindingsList);
  value = structuredClone(this.#defaultKeyBindings);
  #oldKeyBindings;
  #editor;

  /**
   * Initializes the key bindings system
   * @param {Object} editor - The editor instance to bind keys to
   * @returns {Promise<void>}
   */
  async init(editor) {
    if (this.#initialized) return;
    this.#editor = editor;
    this.#initialized = true;
    const fs = fsOperation(window.KEYBINDING_FILE);

    if (!(await fs.exists())) {
      await this.#save();
      this.value = structuredClone(this.#defaultKeyBindings);
      this.#oldKeyBindings = structuredClone(this.#defaultKeyBindings);
      return;
    }

    const keyBindings = await fs.readFile("json");
    if (!keyBindings) return;

    Object.entries(this.#defaultKeyBindings).forEach(([key, value]) => {
      if (
        value === undefined ||
        typeof value !== typeof this.#defaultKeyBindings[key]
      ) {
        keyBindings[key] = this.#defaultKeyBindings[key];
      }
    });

    await this.reset();
  }

  /**
   * Updates key bindings with new values
   * @param {Object | boolean} [keyBindings] - New key bindings to apply
   * @param {boolean} [showToast=true] - Whether to show a toast notification
   * @param {boolean} [saveFile=true] - Whether to persist changes to file
   * @returns {Promise<void>}
   */
  async update(keyBindings, showToast = true, saveFile = true) {
    if (typeof keyBindings === "boolean") {
      showToast = keyBindings;
      keyBindings = undefined;
    }

    const onupdate = [...this.#on.update];
    const onupdateAfter = [...this.#on["update:after"]];

    if (keyBindings) {
      Object.keys(keyBindings).forEach(key => {
        if (key in this.value) this.value[key] = keyBindings[key];
      });
    }

    const changedKeyBindings = this.#getChangedKeys();
    changedKeyBindings.forEach(key => {
      const listeners = this.#on[`update:${key}`];
      if (Array.isArray(listeners)) {
        onupdate.push(...listeners);
      }

      onupdate.forEach(listener => listener(this.value[key]));
    });

    this.applyBindings(...changedKeyBindings);

    if (saveFile) await this.#save();
    if (showToast) toast(strings["key bindings updated"]);

    changedKeyBindings.forEach(key => {
      const listeners = this.#on[`update:${key}:after`];
      if (Array.isArray(listeners)) {
        onupdateAfter.push(...listeners);
      }

      onupdateAfter.forEach(listener => listener(this.value[key]));
    });
  }

  /**
   * Resets key bindings to their default values
   * @param {...string} keyBindings - Specific key bindings to reset. If none provided, resets all
   * @returns {Promise<void>}
   */
  async reset(...keyBindings) {
    if (keyBindings.length === 0) {
      this.value = structuredClone(this.#defaultKeyBindings);
      await this.update(false);
    } else {
      keyBindings.forEach(key => {
        if (!this.#defaultKeyBindings.hasOwnProperty(key)) return;
        this.value[key] = this.#defaultKeyBindings[key];
      });
      await this.update(false);
    }

    this.#on.reset.forEach(onreset => onreset(this.value));
  }

  /**
   * Adds a listener for the given event
   * @param {'update:<key>' | 'update:<key>:after' | 'reset'} event - Event name to listen for
   * @param {function(any):void} callback - Callback function to execute when event occurs
   */
  on(event, callback) {
    if (!this.#on[event]) this.#on[event] = [];
    this.#on[event].push(callback);
  }

  /**
   * Removes the given callback from the given event
   * @param {'update' | 'reset'} event - Event name to remove listener from
   * @param {function(any):void} callback - Callback function to remove
   */
  off(event, callback) {
    if (!this.#on[event]) this.#on[event] = [];
    const index = this.#on[event].indexOf(callback);
    index !== -1 && this.#on[event].splice(index, 1);
  }

  /**
   * Gets a keyBinding with the given key
   * @param {string} key - Key to retrieve binding for
   * @returns {*} The key binding value
   */
  get(key) {
    return this.value[key];
  }

  /**
   * Checks if keyBinding exists with the given key
   * @param {string} key - Key to check existence of
   * @returns {boolean} True if key binding exists
   */
  has(key) {
    return key in this.value;
  }

  /**
   * Saves current key bindings to file system
   * @private
   * @returns {Promise<void>}
   */
  async #save() {
    const fs = fsOperation(window.KEYBINDING_FILE);
    const keyBindingsText = JSON.stringify(this.value, undefined, 4);

    if (!(await fs.exists())) {
      const dirFs = fsOperation(DATA_STORAGE);
      await dirFs.createFile(".key-bindings.json");
    }

    await fs.writeFile(keyBindingsText);
    this.#oldKeyBindings = structuredClone(this.value);
  }

  /**
   * Gets list of keys that have changed from previous state
   * @private
   * @returns {string[]} Array of changed key names
   */
  #getChangedKeys() {
    if (!this.#oldKeyBindings) return [];
    const keys = [];
    Object.keys(this.#oldKeyBindings).forEach(key => {
      const value = this.#oldKeyBindings[key];
      if (typeof value === "object") {
        if (!helpers.areEqual(value, this.value[key])) keys.push(key);
        return;
      }

      if (value !== this.value[key]) keys.push(key);
    });

    return keys;
  }

  /**
   * Applies key bindings to the editor
   * @param {...string} keys - Keys to apply bindings for
   */
  applyBindings(...keys) {
    const {
      commands
    } = this.#editor;
    keys.forEach(key => {
      const shortcut = this.value[key];
      const command = commands.byName[key];
      if (!command || !shortcut) return;

      if (shortcut?.key) {
        shortcut.bindKey = {
          win: shortcut.key
        };

        delete shortcut.key;
      }

      const newCmd = Object.assign({}, command, shortcut);
      commands.addCommand(newCmd);
    });
  }
}

export default new KeyBindings();