import { AvatarProvider } from './avatarTypes';

export class ReadyPlayerMeProvider extends AvatarProvider {
  constructor() {
    super();
    // Default config values
    this.subdomain = 'fitquest'; // We can customize or let user set in environment variables
  }

  getId() {
    return 'readyplayerme';
  }

  getName() {
    return 'Ready Player Me';
  }

  /**
   * Generates the editor URL for Ready Player Me.
   * We use the standard Ready Player Me integration config.
   * @param {Object} [options]
   * @param {string} [options.avatarId] - Existing avatar ID to edit
   * @returns {string}
   */
  getEditorUrl(options = {}) {
    const subdomain = import.meta.env.VITE_RPM_SUBDOMAIN || this.subdomain;
    
    // Base editor URL
    let url = `https://${subdomain}.readyplayer.me/avatar?frameApi`;
    
    // If we're editing an existing avatar, pass it
    if (options.avatarId) {
      url += `&id=${options.avatarId}`;
    }
    
    return url;
  }

  /**
   * Parses messages coming from the Ready Player Me iframe.
   * Ready Player Me communicates via postMessage.
   * @param {MessageEvent} event - The window message event
   * @returns {Object|null} parsed event data or null if not a relevant RPM message
   */
  parseEditorMessage(event) {
    // We expect the event.data to be a JSON string or object
    let parsedData = null;
    try {
      parsedData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch (e) {
      return null;
    }

    if (!parsedData || !parsedData.source || parsedData.source !== 'readyplayerme') {
      return null;
    }

    const eventName = parsedData.eventName;
    
    // When the avatar is created and exported
    if (eventName === 'v1.avatar.exported') {
      const avatarUrl = parsedData.data?.url;
      const avatarId = parsedData.data?.avatarId;
      
      if (avatarUrl) {
        return {
          provider: this.getId(),
          avatarUrl: avatarUrl,
          metadata: {
            avatarId: avatarId,
            exportedAt: new Date().toISOString()
          }
        };
      }
    }

    return null;
  }
}
