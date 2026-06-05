import { ReadyPlayerMeProvider } from './ReadyPlayerMeProvider';
import { DefaultAvatarProvider } from './DefaultAvatarProvider';
import { supabase } from '../supabaseClient';

class AvatarService {
  constructor() {
    this.providers = {};
    
    // Register default providers
    this.registerProvider(new ReadyPlayerMeProvider());
    this.registerProvider(new DefaultAvatarProvider());
    
    // Set default active provider ID
    this.activeProviderId = 'default';
  }

  /**
   * Register an avatar provider
   * @param {import('./avatarTypes').AvatarProvider} provider
   */
  registerProvider(provider) {
    this.providers[provider.getId()] = provider;
  }

  /**
   * Get all registered providers
   * @returns {Object}
   */
  getProviders() {
    return this.providers;
  }

  /**
   * Get provider by ID
   * @param {string} id
   * @returns {import('./avatarTypes').AvatarProvider}
   */
  getProvider(id) {
    const provider = this.providers[id];
    if (!provider) {
      throw new Error(`Avatar provider '${id}' is not registered.`);
    }
    return provider;
  }

  /**
   * Get active provider instance
   * @returns {import('./avatarTypes').AvatarProvider}
   */
  getActiveProvider() {
    return this.getProvider(this.activeProviderId);
  }

  /**
   * Set active provider
   * @param {string} id
   */
  setActiveProvider(id) {
    if (!this.providers[id]) {
      throw new Error(`Cannot select unregistered provider '${id}'.`);
    }
    this.activeProviderId = id;
  }

  /**
   * Retrieve avatar details for a user from Supabase
   * @param {string} userId - UUID of the user
   * @returns {Promise<string|null>} Resolves to the GLB avatar URL or null if none
   */
  async getUserAvatar(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching user 3D avatar URL:", error);
        return null;
      }
      return data?.avatar_url || null;
    } catch (err) {
      console.error("Failed to load user avatar:", err);
      return null;
    }
  }

  /**
   * Save user avatar details to Supabase
   * @param {string} userId - UUID of the user
   * @param {import('./avatarTypes').AvatarData} avatarData - The avatar details
   * @returns {Promise<boolean>} Success indicator
   */
  async saveUserAvatar(userId, avatarData) {
    try {
      // Save avatarUrl to profiles table
      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_url: avatarData.avatarUrl
        })
        .eq('id', userId);

      if (error) {
        console.error("Error updating user 3D avatar URL:", error);
        return false;
      }

      // Sync local storage user model so home screen updates instantly
      const localUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({
        ...localUser,
        avatar_url: avatarData.avatarUrl
      }));

      return true;
    } catch (err) {
      console.error("Failed to save user avatar:", err);
      return false;
    }
  }
}

export const avatarService = new AvatarService();
export default avatarService;
