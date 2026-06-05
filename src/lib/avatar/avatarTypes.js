/**
 * Generic Avatar configuration structure
 * @typedef {Object} AvatarData
 * @property {string} provider - The provider ID (e.g. 'readyplayerme', 'custom')
 * @property {string} avatarUrl - The direct GLB model link
 * @property {Object} metadata - Optional provider-specific configuration details
 */

/**
 * Interface definition for an Avatar Provider.
 * Any future avatar provider must implement these methods.
 */
export class AvatarProvider {
  /**
   * Unique identifier for the provider (e.g. 'readyplayerme')
   * @returns {string}
   */
  getId() {
    throw new Error("Not implemented");
  }

  /**
   * User-friendly name of the provider (e.g. 'Ready Player Me')
   * @returns {string}
   */
  getName() {
    throw new Error("Not implemented");
  }

  /**
   * Generates the URL for the avatar creation/editor interface
   * @param {Object} options - Customization parameters
   * @returns {string}
   */
  getEditorUrl(options) {
    throw new Error("Not implemented");
  }

  /**
   * Processes a message/event received from the editor interface (like an iframe)
   * and returns the generic AvatarData structure.
   * @param {MessageEvent} event - The postMessage event from the iframe
   * @returns {AvatarData|null}
   */
  parseEditorMessage(event) {
    throw new Error("Not implemented");
  }
}
