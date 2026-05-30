import React from 'react';
import NiceAvatar, { genConfig } from 'react-nice-avatar';

export default function Avatar({ config, size = 120, gender = 'man' }) {
  // If no config is provided, generate a default one based on gender
  const avatarConfig = config || genConfig({ sex: gender === 'female' ? 'woman' : 'man' });

  return (
    <div style={{ width: size, height: size }}>
      <NiceAvatar style={{ width: '100%', height: '100%' }} {...avatarConfig} />
    </div>
  );
}
