import React from 'react';

const STICKERS = [
  // Dùng sticker PNG/GIF miễn phí, demo dùng emoji làm sticker
  { url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f60d.png', name: 'Heart Eyes' },
  { url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f602.png', name: 'Joy' },
  { url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f62d.png', name: 'Crying' },
  { url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f618.png', name: 'Kiss' },
  { url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f60e.png', name: 'Cool' },
  { url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f973.png', name: 'Party' },
  { url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f60a.png', name: 'Smile' },
  { url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f609.png', name: 'Wink' },
];

export default function StickerPicker({ onSelect, onClose }) {
  return (
    <div className="absolute bottom-16 left-20 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 w-60 max-h-64 overflow-y-auto grid grid-cols-4 gap-2">
      <div className="col-span-4 flex justify-between items-center mb-2">
        <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">Chọn sticker</span>
        <button onClick={onClose} className="text-gray-400 hover:text-red-500">✕</button>
      </div>
      {STICKERS.map((sticker, idx) => (
        <button
          key={idx}
          className="hover:scale-110 transition-transform"
          onClick={() => onSelect(sticker)}
        >
          <img src={sticker.url} alt={sticker.name} className="w-12 h-12 rounded-lg" />
        </button>
      ))}
    </div>
  );
}
