import React from 'react';
import Avatar from './Avatar';

const SKIN_COLORS = ['#F9C9B6', '#AC6651', '#77311D', '#ffdbac', '#8d5524', '#c68642', '#e0ac69', '#f1c27d'];
const HAIR_COLORS = ['#000000', '#506AF4', '#F48150', '#73A580', '#D6B370', '#85c2c6', '#e8e1e1', '#d4af37'];
const SHIRT_COLORS = ['#9287FF', '#6BD9E9', '#FC909F', '#F4D150', '#66fcf1', '#ff4b4b', '#1f2833', '#ffffff'];
const BG_COLORS = ['#E0DDFF', '#E4FFDD', '#FFEBA4', '#FFDDE4', '#0b0c10', '#1f2833', '#66fcf1', '#ffd700'];

const HAIR_STYLES = ['normal', 'thick', 'mohawk', 'womanLong', 'womanShort'];
const HAT_STYLES = ['none', 'beanie', 'turban'];
const GLASSES_STYLES = ['none', 'round', 'square'];
const SHIRT_STYLES = ['hoody', 'short', 'polo'];
const MOUTH_STYLES = ['laugh', 'smile', 'peace'];

export default function AvatarEditor({ config, onChange }) {
  const handleChange = (key, value) => {
    onChange({ ...config, [key]: value });
  };

  const renderColorOptions = (key, colors) => (
    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0', scrollbarWidth: 'none' }}>
      {colors.map(color => (
        <div
          key={color}
          onClick={() => handleChange(key, color)}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: color,
            border: config[key] === color ? '3px solid white' : '1px solid rgba(255,255,255,0.2)',
            cursor: 'pointer',
            flexShrink: 0
          }}
        />
      ))}
    </div>
  );

  const renderSelectOptions = (key, options) => (
    <select
      className="input-field themed-select"
      value={config[key] || 'none'}
      onChange={(e) => handleChange(key, e.target.value)}
      style={{ marginBottom: '16px' }}
    >
      {options.map(opt => (
        <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
      ))}
    </select>
  );

  return (
    <div style={{ background: 'var(--panel-bg)', borderRadius: '16px', padding: '20px', border: '1px solid var(--glass-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
        <Avatar config={config} size={150} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Skin Tone</label>
        {renderColorOptions('faceColor', SKIN_COLORS)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Hair Color</label>
        {renderColorOptions('hairColor', HAIR_COLORS)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Hair Style</label>
        {renderSelectOptions('hairStyle', HAIR_STYLES)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Outfit Style</label>
        {renderSelectOptions('shirtStyle', SHIRT_STYLES)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Outfit Color</label>
        {renderColorOptions('shirtColor', SHIRT_COLORS)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Hats & Caps</label>
        {renderSelectOptions('hatStyle', HAT_STYLES)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Glasses & Headsets</label>
        {renderSelectOptions('glassesStyle', GLASSES_STYLES)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Background Color</label>
        {renderColorOptions('bgColor', BG_COLORS)}
      </div>
    </div>
  );
}
