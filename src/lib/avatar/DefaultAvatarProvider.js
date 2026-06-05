import { AvatarProvider } from './avatarTypes';

export class DefaultAvatarProvider extends AvatarProvider {
  constructor() {
    super();
    this.models = [
      {
        id: 'xbot',
        name: 'Alpha Male (Athletic)',
        url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Xbot.glb',
        description: 'High-performance male chassis optimized for strength & muscle growth.'
      },
      {
        id: 'ybot',
        name: 'Beta Female (Athletic)',
        url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Ybot.glb',
        description: 'Agile female chassis optimized for endurance & cardiovascular stamina.'
      },
      {
        id: 'robot',
        name: 'Cybernetic Mech',
        url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
        description: 'Sci-fi android companion programmed for elite athletic tracking.'
      },
      {
        id: 'soldier',
        name: 'Elite Commando',
        url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb',
        description: 'Heavy tactical uniform representing discipline and extreme resilience.'
      }
    ];
  }

  getId() {
    return 'default';
  }

  getName() {
    return 'Default FitQuest Models';
  }

  getModels() {
    return this.models;
  }

  getEditorUrl() {
    return '';
  }

  parseEditorMessage() {
    return null;
  }
}
